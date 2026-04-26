use axum::{
    Json, Router,
    extract::{Path, Query, State},
    routing::{delete, get, post},
};
use core_vault::Vault;
use redis::{
    AsyncCommands,
    streams::{StreamReadOptions, StreamReadReply},
};
use reqwest::Client;
use serde::Deserialize;
use sqlx::FromRow;
use sqlx::postgres::PgPoolOptions;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use tokio::net::TcpListener;

mod grpc;
mod models;
use models::{
    CreateFlowRequest, CreateWorkspaceRequest, FlowDefinition, FlowResponse, FlowRunResponse,
    PulseEvent, UpdateFlowRequest, UpsertWorkspaceSecretRequest, WorkspaceResponse,
    WorkspaceSecretSummary,
};
mod executor;
use core_proto::pulsecore::pulse_core_service_server::PulseCoreServiceServer;
use executor::FlowExecutor;
use grpc::MyPulseCoreService;

#[derive(Clone)]
struct AppState {
    pool: sqlx::PgPool,
    vault: Arc<Vault>,
}

#[tokio::main]
async fn main() {
    println!("Starting PulseCore Engine...");
    dotenvy::dotenv().ok(); // Load environment variables from .env

    // Setup PostgreSQL connection pool
    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await
        .expect("Failed to connect to Postgres");

    println!("Connected to PostgreSQL databases!");

    let master_key = std::env::var("PULSE_VAULT_MASTER_KEY")
        .unwrap_or_else(|_| "dev-only-master-key-change-me".to_string());
    let state = AppState {
        pool: pool.clone(),
        vault: Arc::new(Vault::new(&master_key)),
    };

    // Build the Axum application
    let app = Router::new()
        .route("/health", get(|| async { "OK" }))
        .route(
            "/api/v1/workspaces",
            post(create_workspace).get(list_workspaces),
        )
        .route("/api/v1/workspaces/{workspace_id}", get(get_workspace))
        .route("/api/v1/flows", post(create_flow))
        .route("/api/v1/flows/{workspace_id}", get(list_flows))
        .route(
            "/api/v1/flow/{flow_id}",
            get(get_flow).put(update_flow).delete(delete_flow),
        )
        .route(
            "/api/v1/workspaces/{workspace_id}/secrets",
            post(upsert_credential).get(list_credentials),
        )
        .route(
            "/api/v1/workspaces/{workspace_id}/secrets/{connector_id}",
            delete(delete_workspace_secret),
        )
        .route("/api/v1/flow-runs/{workspace_id}", get(list_flow_runs))
        .route("/api/v1/flow-run/{run_id}", get(get_flow_run))
        .with_state(state);

    // Run the server on port 8000 to avoid Tomcat conflict
    let addr = SocketAddr::from(([0, 0, 0, 0], 8000));
    println!("Listening on http://{}", addr);

    // Spawn our background worker for Redis Streams Event Bus
    let pool_clone = pool.clone();
    tokio::spawn(async move {
        start_event_listener(pool_clone).await;
    });

    // Start gRPC server
    let grpc_addr = "127.0.0.1:50051".parse().unwrap();
    let grpc_pool = pool.clone();
    let service = MyPulseCoreService::new(grpc_pool);
    println!("🚀 Starting gRPC server on {}", grpc_addr);
    tokio::spawn(async move {
        tonic::transport::Server::builder()
            .add_service(PulseCoreServiceServer::new(service))
            .serve(grpc_addr)
            .await
            .unwrap();
    });

    let listener = TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

/// Connects to Redis and indefinitely reads from the Real-Time Event Stream
async fn start_event_listener(pg_pool: sqlx::PgPool) {
    let redis_url = "redis://127.0.0.1:6379/";
    let client = match redis::Client::open(redis_url) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Failed to connect to Redis: {}", e);
            return;
        }
    };

    println!("Connecting to Redis Event Bus...");
    let mut con = match client.get_multiplexed_async_connection().await {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Failed to get async connection: {}", e);
            return;
        }
    };

    println!("Connected to Redis. Listening for inbound PulseEvents...");

    // We start listening from the latest message ('$')
    let mut last_id = String::from("$");

    let opts = StreamReadOptions::default()
        .block(5000) // Block for 5 seconds waiting for events
        .count(10); // Read up to 10 events per batch

    let executor = Arc::new(FlowExecutor::new());

    loop {
        // XREAD block from our blueprint's stream key
        let result: Result<StreamReadReply, redis::RedisError> = con
            .xread_options(&["stream:events:global"], &[&last_id], &opts)
            .await;

        match result {
            Ok(reply) => {
                for key in reply.keys {
                    for node in key.ids {
                        last_id = node.id.clone();

                        // Grab the actual event payload (we assume it's stored under a 'payload' field)
                        if let Some(redis::Value::BulkString(data)) = node.map.get("payload") {
                            let payload_str = String::from_utf8_lossy(data);

                            // Try parsing into our structural PulseEvent model
                            match serde_json::from_str::<PulseEvent>(&payload_str) {
                                Ok(event) => {
                                    println!("🔥 Received PulseEvent (ID: {})", last_id);

                                    // Send to Postgres to track event/log run details properly
                                    let insert_result = sqlx::query!(
                                        r#"
                                        INSERT INTO flow_runs (workspace_id, status, trigger_event_id, started_at) 
                                        VALUES ($1, $2, $3, NOW())
                                        "#,
                                        event.tenant_id as _,
                                        "running",
                                        event.id as _
                                    )
                                    .execute(&pg_pool)
                                    .await;

                                    match insert_result {
                                        Ok(_) => println!("   ✅ Logged flow_run in Postgres!"),
                                        Err(e) => {
                                            eprintln!("   ❌ Error saving to Postgres: {}", e)
                                        }
                                    }

                                    // Fetch active flows for this workspace
                                    let active_flows = sqlx::query!(
                                        r#"
                                        SELECT id, name, definition FROM flows 
                                        WHERE workspace_id = $1 AND enabled = true
                                        "#,
                                        event.tenant_id as _
                                    )
                                    .fetch_all(&pg_pool)
                                    .await
                                    .unwrap_or_else(|_| vec![]);

                                    if active_flows.is_empty() {
                                        println!(
                                            "   ⚠️ No active flows found for workspace {}",
                                            event.tenant_id
                                        );
                                    }

                                    // Process each flow
                                    for flow in active_flows {
                                        // Parse FlowDefinition
                                        let flow_def: FlowDefinition = match serde_json::from_value(
                                            flow.definition.clone(),
                                        ) {
                                            Ok(def) => def,
                                            Err(e) => {
                                                eprintln!(
                                                    "   ❌ Invalid flow definition for flow {}: {}",
                                                    flow.id, e
                                                );
                                                continue;
                                            }
                                        };

                                        // Check if trigger matches event
                                        if !executor.matches_trigger(&flow_def.trigger, &event) {
                                            println!(
                                                "   ⏭️  Flow {} trigger did not match event",
                                                flow.name
                                            );
                                            continue;
                                        }

                                        println!("   ⚡ Executing flow: {}", flow.name);

                                        // Resolve execution order (dependency graph)
                                        let execution_order = match executor
                                            .resolve_execution_order(&flow_def.steps)
                                        {
                                            Ok(order) => order,
                                            Err(e) => {
                                                eprintln!(
                                                    "   ❌ Failed to resolve execution order: {}",
                                                    e
                                                );
                                                continue;
                                            }
                                        };

                                        // Execute step groups in parallel where possible
                                        let mut step_outputs = std::collections::HashMap::new();
                                        let mut all_steps_succeeded = true;
                                        let mut steps_log = serde_json::json!([]);

                                        for group in execution_order {
                                            // Spawn tasks for parallel execution
                                            let mut tasks = vec![];

                                            for step_id in &group {
                                                if let Some(step) =
                                                    flow_def.steps.iter().find(|s| &s.id == step_id)
                                                {
                                                    let step_clone = step.clone();
                                                    let executor_clone = Arc::clone(&executor);
                                                    let event_clone = event.clone();
                                                    let outputs_snapshot = step_outputs.clone();

                                                    let task = tokio::spawn(async move {
                                                        execute_step_with_retry(
                                                            executor_clone,
                                                            &step_clone,
                                                            serde_json::json!({}),
                                                            &outputs_snapshot,
                                                            &event_clone,
                                                        )
                                                        .await
                                                    });
                                                    tasks.push(task);
                                                }
                                            }

                                            // Wait for all tasks in this group to complete
                                            for task in tasks {
                                                match task.await {
                                                    Ok(result) => {
                                                        if result.status == "failed" {
                                                            all_steps_succeeded = false;
                                                            println!(
                                                                "      ❌ Step {} failed: {:?}",
                                                                result.step_id, result.error
                                                            );

                                                            let dlq_key = format!(
                                                                "dlq:failed:{}",
                                                                event.tenant_id
                                                            );
                                                            let dlq_payload = serde_json::json!({
                                                                "workspace_id": event.tenant_id,
                                                                "flow_id": flow.id,
                                                                "flow_name": flow.name,
                                                                "trigger_event_id": event.id,
                                                                "step_id": result.step_id,
                                                                "error": result.error,
                                                                "failed_at": chrono::Utc::now().to_rfc3339(),
                                                            });
                                                            let _ = con
                                                                .rpush::<_, _, usize>(
                                                                    dlq_key,
                                                                    dlq_payload.to_string(),
                                                                )
                                                                .await;
                                                        } else if result.status == "success" {
                                                            println!(
                                                                "      ✅ Step {} completed in {}ms",
                                                                result.step_id, result.duration_ms
                                                            );
                                                        } else if result.status == "skipped" {
                                                            println!(
                                                                "      ⏭️  Step {} skipped (condition not met)",
                                                                result.step_id
                                                            );
                                                        }

                                                        step_outputs.insert(
                                                            result.step_id.clone(),
                                                            result.output.clone(),
                                                        );
                                                        steps_log.as_array_mut().unwrap().push(
                                                            serde_json::json!({
                                                                "step_id": result.step_id,
                                                                "status": result.status,
                                                                "duration_ms": result.duration_ms,
                                                                "error": result.error
                                                            }),
                                                        );
                                                    }
                                                    Err(e) => {
                                                        eprintln!(
                                                            "      ❌ Task join error: {}",
                                                            e
                                                        );
                                                        all_steps_succeeded = false;
                                                    }
                                                }
                                            }
                                        }

                                        // Update flow run status
                                        let final_status = if all_steps_succeeded {
                                            "success"
                                        } else {
                                            "failed"
                                        };
                                        let _ = sqlx::query!(
                                            r#"UPDATE flow_runs SET status = $1, completed_at = NOW(), steps_log = $2 WHERE trigger_event_id = $3"#,
                                            final_status,
                                            steps_log,
                                            event.id as _
                                        ).execute(&pg_pool).await;

                                        if final_status == "failed" {
                                            let notify_email = flow_def
                                                .error_policy
                                                .notify_email
                                                .clone()
                                                .or_else(|| {
                                                    std::env::var("FLOW_FAILURE_NOTIFY_EMAIL").ok()
                                                });

                                            if let Some(email) = notify_email {
                                                let _ = send_failure_email(
                                                    &email,
                                                    &flow.name,
                                                    event.id,
                                                    event.tenant_id,
                                                )
                                                .await;
                                            }
                                        }

                                        println!(
                                            "   🏁 Flow execution completed with status: {}",
                                            final_status
                                        );
                                    }
                                }
                                Err(err) => {
                                    println!(
                                        "⚠️ Raw message received (ID: {}). Parsing to PulseEvent failed: {}",
                                        last_id, err
                                    );
                                    println!("   Raw Data: {}", payload_str);
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                eprintln!("Error reading stream: {}", e);
                // Sleep briefly to prevent tight loop on connection errors
                tokio::time::sleep(Duration::from_secs(2)).await;
            }
        }
    }
}

async fn execute_step_with_retry(
    executor: Arc<FlowExecutor>,
    step: &models::FlowStep,
    input_data: serde_json::Value,
    step_outputs: &std::collections::HashMap<String, serde_json::Value>,
    event: &models::PulseEvent,
) -> models::StepExecutionResult {
    let max_retries = step.retry_policy.max_retries.max(0) as usize;
    let base_backoff_ms = if step.retry_policy.initial_backoff_ms > 0 {
        step.retry_policy.initial_backoff_ms as u64
    } else {
        500
    };

    for attempt in 0..=max_retries {
        let result = executor
            .execute_step(step, input_data.clone(), step_outputs, event)
            .await;

        if result.status != "failed" {
            return result;
        }

        if attempt == max_retries {
            return result;
        }

        let sleep_ms = base_backoff_ms.saturating_mul(2u64.saturating_pow(attempt as u32));
        tokio::time::sleep(Duration::from_millis(sleep_ms)).await;
    }

    models::StepExecutionResult {
        step_id: step.id.clone(),
        status: "failed".to_string(),
        output: serde_json::Value::Null,
        error: Some("retry loop exhausted".to_string()),
        duration_ms: 0,
    }
}

async fn send_failure_email(
    to_email: &str,
    flow_name: &str,
    trigger_event_id: uuid::Uuid,
    workspace_id: uuid::Uuid,
) -> Result<(), String> {
    let resend_api_key = match std::env::var("RESEND_API_KEY") {
        Ok(v) => v,
        Err(_) => return Ok(()),
    };

    let from_email = std::env::var("FLOW_FAILURE_FROM_EMAIL")
        .unwrap_or_else(|_| "PulseGrid <onboarding@resend.dev>".to_string());

    let subject = format!("PulseGrid flow failed: {}", flow_name);
    let html = format!(
        "<p>A flow execution failed.</p><ul><li><b>Flow:</b> {}</li><li><b>Workspace:</b> {}</li><li><b>Trigger Event:</b> {}</li></ul>",
        flow_name, workspace_id, trigger_event_id
    );

    let payload = serde_json::json!({
        "from": from_email,
        "to": [to_email],
        "subject": subject,
        "html": html,
    });

    let client = Client::new();
    let resp = client
        .post("https://api.resend.com/emails")
        .bearer_auth(resend_api_key)
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("resend email failed with status {}", resp.status()));
    }

    Ok(())
}

async fn create_flow(
    State(state): State<AppState>,
    Json(payload): Json<CreateFlowRequest>,
) -> Result<Json<FlowResponse>, (axum::http::StatusCode, String)> {
    let row = sqlx::query!(
        r#"
        INSERT INTO flows (workspace_id, name, description, definition, enabled, run_count)
        VALUES ($1, $2, $3, $4, true, 0)
        RETURNING id, workspace_id, name, description, definition, enabled, run_count
        "#,
        payload.workspace_id,
        payload.name,
        payload.description,
        payload.definition,
    )
    .fetch_one(&state.pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(FlowResponse {
        id: row.id,
        workspace_id: row.workspace_id.unwrap_or_default(),
        name: row.name,
        description: row.description,
        definition: row.definition,
        enabled: row.enabled.unwrap_or(true),
        run_count: row.run_count.unwrap_or(0),
    }))
}

#[derive(Debug, Deserialize)]
struct WorkspaceListQuery {
    owner_user_id: Option<uuid::Uuid>,
}

#[derive(Debug, FromRow)]
struct WorkspaceRow {
    id: uuid::Uuid,
    name: String,
    slug: String,
    plan: String,
    owner_user_id: uuid::Uuid,
    settings: Option<serde_json::Value>,
    created_at: Option<chrono::DateTime<chrono::Utc>>,
}

async fn create_workspace(
    State(state): State<AppState>,
    Json(payload): Json<CreateWorkspaceRequest>,
) -> Result<Json<WorkspaceResponse>, (axum::http::StatusCode, String)> {
    let name = payload.name.trim();
    if name.is_empty() {
        return Err((
            axum::http::StatusCode::BAD_REQUEST,
            "Workspace name is required".to_string(),
        ));
    }

    let raw_slug = payload
        .slug
        .unwrap_or_else(|| name.to_lowercase().replace(' ', "-"));
    let slug = normalize_slug(&raw_slug)?;

    let settings = payload.settings.unwrap_or_else(|| serde_json::json!({}));

    let row = sqlx::query!(
        r#"
        INSERT INTO workspaces (name, slug, owner_user_id, settings)
        VALUES ($1, $2, $3, $4)
        RETURNING id, name, slug, plan, owner_user_id, settings, created_at
        "#,
        name,
        slug,
        payload.owner_user_id,
        settings
    )
    .fetch_one(&state.pool)
    .await
    .map_err(|e| (axum::http::StatusCode::BAD_REQUEST, e.to_string()))?;

    Ok(Json(WorkspaceResponse {
        id: row.id,
        name: row.name,
        slug: row.slug,
        plan: row.plan,
        owner_user_id: row.owner_user_id,
        settings: row.settings.unwrap_or_else(|| serde_json::json!({})),
        created_at: row.created_at,
    }))
}

async fn list_workspaces(
    State(state): State<AppState>,
    Query(query): Query<WorkspaceListQuery>,
) -> Result<Json<Vec<WorkspaceResponse>>, (axum::http::StatusCode, String)> {
    let rows: Vec<WorkspaceRow> = if let Some(owner_user_id) = query.owner_user_id {
        sqlx::query_as::<_, WorkspaceRow>(
            r#"
            SELECT id, name, slug, plan, owner_user_id, settings, created_at
            FROM workspaces
            WHERE owner_user_id = $1
            ORDER BY created_at DESC
            "#,
        )
        .bind(owner_user_id)
        .fetch_all(&state.pool)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    } else {
        sqlx::query_as::<_, WorkspaceRow>(
            r#"
            SELECT id, name, slug, plan, owner_user_id, settings, created_at
            FROM workspaces
            ORDER BY created_at DESC
            LIMIT 50
            "#,
        )
        .fetch_all(&state.pool)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    };

    Ok(Json(
        rows.into_iter()
            .map(|row| WorkspaceResponse {
                id: row.id,
                name: row.name,
                slug: row.slug,
                plan: row.plan,
                owner_user_id: row.owner_user_id,
                settings: row.settings.unwrap_or_else(|| serde_json::json!({})),
                created_at: row.created_at,
            })
            .collect(),
    ))
}

async fn get_workspace(
    State(state): State<AppState>,
    Path(workspace_id): Path<uuid::Uuid>,
) -> Result<Json<WorkspaceResponse>, (axum::http::StatusCode, String)> {
    let row = sqlx::query!(
        r#"
        SELECT id, name, slug, plan, owner_user_id, settings, created_at
        FROM workspaces
        WHERE id = $1
        "#,
        workspace_id
    )
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or((
        axum::http::StatusCode::NOT_FOUND,
        "Workspace not found".to_string(),
    ))?;

    Ok(Json(WorkspaceResponse {
        id: row.id,
        name: row.name,
        slug: row.slug,
        plan: row.plan,
        owner_user_id: row.owner_user_id,
        settings: row.settings.unwrap_or_else(|| serde_json::json!({})),
        created_at: row.created_at,
    }))
}

async fn list_flows(
    State(state): State<AppState>,
    Path(workspace_id): Path<uuid::Uuid>,
) -> Result<Json<Vec<FlowResponse>>, (axum::http::StatusCode, String)> {
    let rows = sqlx::query!(
        r#"
        SELECT id, workspace_id, name, description, definition, enabled, run_count
        FROM flows
        WHERE workspace_id = $1
        ORDER BY created_at DESC
        "#,
        workspace_id
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let flows = rows
        .into_iter()
        .map(|row| FlowResponse {
            id: row.id,
            workspace_id: row.workspace_id.unwrap_or_default(),
            name: row.name,
            description: row.description,
            definition: row.definition,
            enabled: row.enabled.unwrap_or(true),
            run_count: row.run_count.unwrap_or(0),
        })
        .collect();

    Ok(Json(flows))
}

async fn get_flow(
    State(state): State<AppState>,
    Path(flow_id): Path<uuid::Uuid>,
) -> Result<Json<FlowResponse>, (axum::http::StatusCode, String)> {
    let row = sqlx::query!(
        r#"
        SELECT id, workspace_id, name, description, definition, enabled, run_count
        FROM flows
        WHERE id = $1
        "#,
        flow_id
    )
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or((
        axum::http::StatusCode::NOT_FOUND,
        "Flow not found".to_string(),
    ))?;

    Ok(Json(FlowResponse {
        id: row.id,
        workspace_id: row.workspace_id.unwrap_or_default(),
        name: row.name,
        description: row.description,
        definition: row.definition,
        enabled: row.enabled.unwrap_or(true),
        run_count: row.run_count.unwrap_or(0),
    }))
}

async fn update_flow(
    State(state): State<AppState>,
    Path(flow_id): Path<uuid::Uuid>,
    Json(payload): Json<UpdateFlowRequest>,
) -> Result<Json<FlowResponse>, (axum::http::StatusCode, String)> {
    let existing = sqlx::query!(
        r#"
        SELECT id, workspace_id, name, description, definition, enabled, run_count
        FROM flows
        WHERE id = $1
        "#,
        flow_id
    )
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or((
        axum::http::StatusCode::NOT_FOUND,
        "Flow not found".to_string(),
    ))?;

    let updated_name = payload.name.unwrap_or(existing.name);
    let updated_description = payload.description.or(existing.description);
    let updated_definition = payload.definition.unwrap_or(existing.definition);
    let updated_enabled = payload.enabled.unwrap_or(existing.enabled.unwrap_or(true));

    let row = sqlx::query!(
        r#"
        UPDATE flows
        SET name = $1,
            description = $2,
            definition = $3,
            enabled = $4,
            updated_at = NOW()
        WHERE id = $5
        RETURNING id, workspace_id, name, description, definition, enabled, run_count
        "#,
        updated_name,
        updated_description,
        updated_definition,
        updated_enabled,
        flow_id
    )
    .fetch_one(&state.pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(FlowResponse {
        id: row.id,
        workspace_id: row.workspace_id.unwrap_or_default(),
        name: row.name,
        description: row.description,
        definition: row.definition,
        enabled: row.enabled.unwrap_or(true),
        run_count: row.run_count.unwrap_or(0),
    }))
}

async fn delete_flow(
    State(state): State<AppState>,
    Path(flow_id): Path<uuid::Uuid>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    let result = sqlx::query!(
        r#"
        DELETE FROM flows
        WHERE id = $1
        "#,
        flow_id
    )
    .execute(&state.pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if result.rows_affected() == 0 {
        return Err((
            axum::http::StatusCode::NOT_FOUND,
            "Flow not found".to_string(),
        ));
    }

    Ok(Json(
        serde_json::json!({ "success": true, "flowId": flow_id }),
    ))
}

async fn upsert_credential(
    State(state): State<AppState>,
    Path(workspace_id): Path<uuid::Uuid>,
    Json(payload): Json<UpsertWorkspaceSecretRequest>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    let connector_id = payload.name.trim().to_uppercase();
    if connector_id.is_empty() {
        return Err((
            axum::http::StatusCode::BAD_REQUEST,
            "Secret name is required".to_string(),
        ));
    }

    if payload.value.trim().is_empty() {
        return Err((
            axum::http::StatusCode::BAD_REQUEST,
            "Secret value is required".to_string(),
        ));
    }

    let (encrypted_blob, nonce) = state.vault.encrypt(&payload.value).map_err(|e| {
        (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            format!("{e:?}"),
        )
    })?;

    sqlx::query!(
        r#"
        INSERT INTO credentials (workspace_id, connector_id, encrypted_blob, nonce)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (workspace_id, connector_id)
        DO UPDATE SET encrypted_blob = EXCLUDED.encrypted_blob, nonce = EXCLUDED.nonce, updated_at = NOW()
        "#,
        workspace_id,
        connector_id,
        encrypted_blob,
        nonce
    )
    .execute(&state.pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({
        "success": true,
        "workspaceId": workspace_id,
        "name": connector_id,
    })))
}

async fn list_credentials(
    State(state): State<AppState>,
    Path(workspace_id): Path<uuid::Uuid>,
) -> Result<Json<Vec<WorkspaceSecretSummary>>, (axum::http::StatusCode, String)> {
    let rows = sqlx::query!(
        r#"
        SELECT connector_id, updated_at
        FROM credentials
        WHERE workspace_id = $1
        ORDER BY connector_id ASC
        "#,
        workspace_id
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(
        rows.into_iter()
            .map(|row| WorkspaceSecretSummary {
                name: row.connector_id,
                updated_at: row.updated_at,
            })
            .collect(),
    ))
}

async fn delete_workspace_secret(
    State(state): State<AppState>,
    Path((workspace_id, connector_id)): Path<(uuid::Uuid, String)>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    let normalized = connector_id.trim().to_uppercase();
    if normalized.is_empty() {
        return Err((
            axum::http::StatusCode::BAD_REQUEST,
            "Secret name is required".to_string(),
        ));
    }

    let result = sqlx::query!(
        r#"
        DELETE FROM credentials
        WHERE workspace_id = $1 AND connector_id = $2
        "#,
        workspace_id,
        normalized
    )
    .execute(&state.pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if result.rows_affected() == 0 {
        return Err((
            axum::http::StatusCode::NOT_FOUND,
            "Secret not found".to_string(),
        ));
    }

    Ok(Json(serde_json::json!({ "success": true })))
}

async fn list_flow_runs(
    State(state): State<AppState>,
    Path(workspace_id): Path<uuid::Uuid>,
) -> Result<Json<Vec<FlowRunResponse>>, (axum::http::StatusCode, String)> {
    let rows = sqlx::query!(
        r#"
        SELECT id, flow_id, workspace_id, status, trigger_event_id, started_at, completed_at, duration_ms, steps_log, error_message
        FROM flow_runs
        WHERE workspace_id = $1
        ORDER BY started_at DESC
        LIMIT 200
        "#,
        workspace_id
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(
        rows.into_iter()
            .map(|row| FlowRunResponse {
                id: row.id,
                flow_id: row.flow_id,
                workspace_id: row.workspace_id,
                status: row.status,
                trigger_event_id: row.trigger_event_id,
                started_at: row.started_at,
                completed_at: row.completed_at,
                duration_ms: row.duration_ms,
                steps_log: row.steps_log,
                error_message: row.error_message,
            })
            .collect(),
    ))
}

async fn get_flow_run(
    State(state): State<AppState>,
    Path(run_id): Path<uuid::Uuid>,
) -> Result<Json<FlowRunResponse>, (axum::http::StatusCode, String)> {
    let row = sqlx::query!(
        r#"
        SELECT id, flow_id, workspace_id, status, trigger_event_id, started_at, completed_at, duration_ms, steps_log, error_message
        FROM flow_runs
        WHERE id = $1
        "#,
        run_id
    )
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or((axum::http::StatusCode::NOT_FOUND, "Flow run not found".to_string()))?;

    Ok(Json(FlowRunResponse {
        id: row.id,
        flow_id: row.flow_id,
        workspace_id: row.workspace_id,
        status: row.status,
        trigger_event_id: row.trigger_event_id,
        started_at: row.started_at,
        completed_at: row.completed_at,
        duration_ms: row.duration_ms,
        steps_log: row.steps_log,
        error_message: row.error_message,
    }))
}

fn normalize_slug(slug: &str) -> Result<String, (axum::http::StatusCode, String)> {
    let normalized: String = slug
        .trim()
        .to_lowercase()
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' {
                ch
            } else {
                '-'
            }
        })
        .collect();

    let trimmed = normalized.trim_matches('-').to_string();
    if trimmed.is_empty() {
        return Err((
            axum::http::StatusCode::BAD_REQUEST,
            "Workspace slug is required".to_string(),
        ));
    }

    Ok(trimmed)
}
