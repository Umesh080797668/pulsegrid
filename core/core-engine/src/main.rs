use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, Query, State,
    },
    response::IntoResponse,
    routing::{delete, get, post},
    Json, Router,
};
use core_vault::Vault;
use futures_util::{SinkExt, StreamExt};
use redis::{
    AsyncCommands,
    streams::{StreamReadOptions, StreamReadReply},
};
use reqwest::Client;
use serde::Deserialize;
use sqlx::FromRow;
use sqlx::postgres::PgPoolOptions;
use std::net::SocketAddr;
use std::str::FromStr;
use std::sync::Arc;
use std::time::Duration;
use tokio::net::TcpListener;
use tokio::sync::broadcast;

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
    event_tx: broadcast::Sender<String>,
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
    let (event_tx, _) = broadcast::channel::<String>(256);
    let state = AppState {
        pool: pool.clone(),
        vault: Arc::new(Vault::new(&master_key, std::env::var("PULSE_VAULT_SALT").unwrap_or_else(|_| "pulsegrid_salt".to_string()).as_bytes())),
        event_tx: event_tx.clone(),
    };

    // Build the Axum application
    let app = Router::new()
        // Health check endpoints
        .route("/health", get(health_check))
        .route("/health/redis", get(health_redis))
        .route("/health/postgres", get(health_postgres))
        // Workspace endpoints
        .route(
            "/api/v1/workspaces",
            post(create_workspace).get(list_workspaces),
        )
        .route("/api/v1/workspaces/{workspace_id}", get(get_workspace))
        .route("/api/v1/workspaces/{workspace_id}/upgrade", post(upgrade_workspace))
        // Flow CRUD endpoints
        .route("/api/v1/flows", post(create_flow))
        .route("/api/v1/flows/{workspace_id}", get(list_flows))
        .route(
            "/api/v1/flow/{flow_id}",
            get(get_flow).put(update_flow).delete(delete_flow),
        )
        // Webhook endpoints
        .route("/api/v1/webhooks/:workspace_id", post(webhook_receiver))
        .route("/api/v1/webhooks/:workspace_id/:flow_id", post(flow_webhook_receiver))
        // Credentials endpoints
        .route(
            "/api/v1/workspaces/{workspace_id}/secrets",
            post(upsert_credential).get(list_credentials),
        )
        .route(
            "/api/v1/workspaces/{workspace_id}/secrets/{connector_id}",
            delete(delete_workspace_secret),
        )
        // Flow run endpoints
        .route("/api/v1/flow-runs/{workspace_id}", get(list_flow_runs))
        .route("/api/v1/flow-run/{run_id}", get(get_flow_run))
        .route("/api/v1/flows/{flow_id}/runs", get(get_flow_runs))
        .route("/api/v1/flows/{flow_id}/runs/{run_id}", get(get_flow_run_details))
        .route("/api/v1/flows/{flow_id}/stats", get(get_flow_stats))
        // WebSocket event stream
        .route("/events/stream", get(events_stream))
        .with_state(state.clone());

    // Run the server on port 8000 to avoid Tomcat conflict
    let addr = SocketAddr::from(([0, 0, 0, 0], 8000));
    println!("Listening on http://{}", addr);

    // Spawn our background worker for Redis Streams Event Bus
    let pool_clone = pool.clone();
    let vault_clone = state.vault.clone();
    let event_tx_clone = event_tx.clone();
    tokio::spawn(async move {
        start_event_listener(pool_clone, vault_clone, event_tx_clone).await;
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

    // Spawn our background worker for cron/scheduled flows
    let cron_pool = pool.clone();
    tokio::spawn(async move {
        
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(60)).await;
            
            let rows = sqlx::query!(
                r#"SELECT id, workspace_id, definition, last_run_at FROM flows WHERE enabled = true"#
            ).fetch_all(&cron_pool).await.unwrap_or_default();
            
            for row in rows {
                let def: crate::models::FlowDefinition = match serde_json::from_value(row.definition) {
                    Ok(d) => d,
                    Err(_) => continue,
                };
                
                if def.trigger.connector == "schedule" {
                    let cron_val = def.trigger.filters.iter().find(|f| f.field == "cron").map(|f| &f.value);
                    if let Some(serde_json::Value::String(cron_expr)) = cron_val {
                        let last = row.last_run_at.unwrap_or_else(|| chrono::Utc::now() - chrono::Duration::days(1));
                        // parse cron and see if past due
                        if let Ok(schedule) = cron::Schedule::from_str(cron_expr) {
                            if let Some(next) = schedule.after(&last).next() {
                                if chrono::Utc::now() >= next {
                                    // Emit event to Redis
                                    let event = crate::models::PulseEvent {
                                        id: uuid::Uuid::new_v4(),
                                        tenant_id: row.workspace_id.unwrap_or_default(),
                                        source: Some("schedule".into()),
                                        event_type: def.trigger.event.clone(),
                                        data: serde_json::json!({ "triggered_at": chrono::Utc::now().to_rfc3339() }),
                                    };
                                    
                                    let redis_url = "redis://127.0.0.1:6379/";
                                    if let Ok(client) = redis::Client::open(redis_url) {
                                        if let Ok(mut con) = client.get_multiplexed_async_connection().await {
                                            let _ = redis::AsyncCommands::xadd::<_, _, _, _, ()>(&mut con, "stream:events:global", "*", &[("payload", serde_json::to_string(&event).unwrap())]).await;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    });

    let listener = TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

#[derive(Debug, Deserialize)]
struct EventStreamQuery {
    workspace_id: Option<uuid::Uuid>,
}

async fn events_stream(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    Query(query): Query<EventStreamQuery>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_events_socket(socket, state, query.workspace_id))
}

async fn handle_events_socket(
    socket: WebSocket,
    state: AppState,
    workspace_id: Option<uuid::Uuid>,
) {
    let mut rx = state.event_tx.subscribe();
    let (mut sender, mut receiver) = socket.split();

    let send_task = tokio::spawn(async move {
        while let Ok(payload) = rx.recv().await {
            if !event_matches_workspace(&payload, workspace_id) {
                continue;
            }

            if sender.send(Message::Text(payload.into())).await.is_err() {
                break;
            }
        }
    });

    let recv_task = tokio::spawn(async move {
        while let Some(Ok(message)) = receiver.next().await {
            if matches!(message, Message::Close(_)) {
                break;
            }
        }
    });

    let _ = tokio::join!(send_task, recv_task);
}

fn event_matches_workspace(payload: &str, workspace_id: Option<uuid::Uuid>) -> bool {
    let Some(workspace_id) = workspace_id else {
        return true;
    };

    serde_json::from_str::<serde_json::Value>(payload)
        .ok()
        .and_then(|value| {
            value
                .get("tenant_id")
                .and_then(|tenant_id| tenant_id.as_str())
                .map(|tenant_id| tenant_id == workspace_id.to_string())
        })
        .unwrap_or(false)
}

/// Connects to Redis and indefinitely reads from the Real-Time Event Stream
async fn start_event_listener(
    pg_pool: sqlx::PgPool,
    vault: std::sync::Arc<core_vault::Vault>,
    event_tx: broadcast::Sender<String>,
) {
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

    let executor = Arc::new(FlowExecutor::new(pg_pool.clone(), vault.clone()));

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
                                    let _ = event_tx.send(payload_str.to_string());

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

                                        let insert_result = sqlx::query!(
                                            r#"
                                            INSERT INTO flow_runs (workspace_id, flow_id, status, trigger_event_id, started_at) 
                                            VALUES ($1, $2, $3, $4, NOW())
                                            RETURNING id
                                            "#,
                                            event.tenant_id as _,
                                            flow.id as _,
                                            "running",
                                            event.id as _
                                        )
                                        .fetch_one(&pg_pool)
                                        .await;

                                        let flow_run_id = match insert_result {
                                            Ok(rec) => {
                                                println!("   ✅ Logged flow_run {} in Postgres!", rec.id);
                                                rec.id
                                            },
                                            Err(e) => {
                                                eprintln!("   ❌ Error saving to Postgres: {}", e);
                                                continue;
                                            }
                                        };

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
                                            r#"UPDATE flow_runs SET status = $1, completed_at = NOW(), steps_log = $2 WHERE id = $3"#,
                                            final_status,
                                            steps_log,
                                            flow_run_id as _
                                        ).execute(&pg_pool).await;

                                        let _ = sqlx::query!(
                                            r#"UPDATE flows SET run_count = run_count + 1, last_run_at = NOW() WHERE id = $1"#,
                                            flow.id as _
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

#[derive(serde::Deserialize)]
struct UpgradeWorkspaceRequest {
    plan: String,
}

async fn upgrade_workspace(
    State(state): State<AppState>,
    Path(workspace_id): Path<uuid::Uuid>,
    Json(payload): Json<UpgradeWorkspaceRequest>,
) -> Result<Json<WorkspaceResponse>, (axum::http::StatusCode, String)> {
    let plan = payload.plan.trim().to_lowercase();
    if plan.is_empty() {
        return Err((axum::http::StatusCode::BAD_REQUEST, "Plan is required".into()));
    }

    let mut tx = state.pool.begin().await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Update workspaces table
    let row = sqlx::query!(
        "UPDATE workspaces SET plan = $1 WHERE id = $2 RETURNING id, name, slug, plan, owner_user_id, settings, created_at",
        plan,
        workspace_id
    )
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or((axum::http::StatusCode::NOT_FOUND, "Workspace not found".to_string()))?;

    // Upsert into billing_subscriptions
    sqlx::query!(
        r#"
        INSERT INTO billing_subscriptions (workspace_id, plan_tier, status)
        VALUES ($1, $2, 'active')
        ON CONFLICT (workspace_id) 
        DO UPDATE SET plan_tier = EXCLUDED.plan_tier, status = 'active', updated_at = NOW()
        "#,
        workspace_id, plan
    ).execute(&mut *tx).await.map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    tx.commit().await.map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

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

// Health check endpoints
async fn health_check() -> &'static str {
    "OK"
}

async fn health_redis(State(_state): State<AppState>) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    let redis_url = "redis://127.0.0.1:6379/";
    match redis::Client::open(redis_url) {
        Ok(client) => {
            match client.get_multiplexed_async_connection().await {
                Ok(_) => Ok(Json(serde_json::json!({"status": "healthy"}))),
                Err(e) => Err((axum::http::StatusCode::SERVICE_UNAVAILABLE, format!("Redis connection failed: {}", e))),
            }
        }
        Err(e) => Err((axum::http::StatusCode::SERVICE_UNAVAILABLE, format!("Redis client error: {}", e))),
    }
}

async fn health_postgres(State(state): State<AppState>) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    match sqlx::query!("SELECT NOW()").fetch_one(&state.pool).await {
        Ok(_) => Ok(Json(serde_json::json!({"status": "healthy"}))),
        Err(e) => Err((axum::http::StatusCode::SERVICE_UNAVAILABLE, format!("PostgreSQL connection failed: {}", e))),
    }
}

// Webhook endpoints
#[derive(Debug, Deserialize)]
struct WebhookPayload {
    #[serde(default)]
    payload: serde_json::Value,
    #[serde(default)]
    signature: Option<String>,
}

async fn webhook_receiver(
    State(_state): State<AppState>,
    Path(workspace_id): Path<uuid::Uuid>,
    Json(_payload): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    // For now, accept any webhook and push to event bus
    // TODO: Implement signature verification based on workspace webhooks config
    
    let event = PulseEvent {
        id: uuid::Uuid::new_v4(),
        tenant_id: workspace_id,
        source: Some("webhook".to_string()),
        event_type: "webhook.received".to_string(),
        data: serde_json::json!({"timestamp": chrono::Utc::now().to_rfc3339()}),
    };

    // Push to Redis Streams
    let redis_url = "redis://127.0.0.1:6379/";
    if let Ok(client) = redis::Client::open(redis_url) {
        if let Ok(mut con) = client.get_multiplexed_async_connection().await {
            let payload_str = serde_json::to_string(&event).unwrap_or_default();
            let _ = con.xadd::<_, _, _, _, ()>(
                "stream:events:global",
                "*",
                &[("payload", payload_str)]
            ).await;
        }
    }

    Ok(Json(serde_json::json!({"success": true})))
}

async fn flow_webhook_receiver(
    State(state): State<AppState>,
    Path((workspace_id, flow_id)): Path<(uuid::Uuid, uuid::Uuid)>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    // Verify flow exists and is enabled
    let _flow = sqlx::query!("SELECT id FROM flows WHERE id = $1 AND workspace_id = $2", flow_id, workspace_id)
        .fetch_optional(&state.pool)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((axum::http::StatusCode::NOT_FOUND, "Flow not found".to_string()))?;

    // Create flow run
    let run_id = sqlx::query!("
        INSERT INTO flow_runs (flow_id, workspace_id, status, started_at) 
        VALUES ($1, $2, $3, NOW())
        RETURNING id
    ", flow_id, workspace_id, "running")
        .fetch_one(&state.pool)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({
        "success": true,
        "flow_run_id": run_id.id
    })))
}

// Flow run history endpoints
async fn get_flow_runs(
    State(state): State<AppState>,
    Path(flow_id): Path<uuid::Uuid>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    let limit = params.get("limit").and_then(|s| s.parse::<i64>().ok()).unwrap_or(50).min(500);
    let offset = params.get("offset").and_then(|s| s.parse::<i64>().ok()).unwrap_or(0);

    let rows = sqlx::query!(
        r#"
        SELECT id, flow_id, workspace_id, status, trigger_event_id, started_at, completed_at, duration_ms, error_message
        FROM flow_runs
        WHERE flow_id = $1
        ORDER BY started_at DESC
        LIMIT $2 OFFSET $3
        "#,
        flow_id,
        limit,
        offset
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let runs: Vec<serde_json::Value> = rows.iter().map(|row| {
        serde_json::json!({
            "id": row.id,
            "flow_id": row.flow_id,
            "workspace_id": row.workspace_id,
            "status": row.status,
            "trigger_event_id": row.trigger_event_id,
            "started_at": row.started_at.to_rfc3339(),
            "completed_at": row.completed_at.as_ref().map(|t| t.to_rfc3339()),
            "duration_ms": row.duration_ms,
            "error_message": row.error_message,
        })
    }).collect();

    Ok(Json(serde_json::json!({
        "runs": runs,
        "total": runs.len(),
        "limit": limit,
        "offset": offset
    })))
}

async fn get_flow_run_details(
    State(state): State<AppState>,
    Path((flow_id, run_id)): Path<(uuid::Uuid, uuid::Uuid)>,
) -> Result<Json<FlowRunResponse>, (axum::http::StatusCode, String)> {
    let row = sqlx::query!(
        r#"
        SELECT id, flow_id, workspace_id, status, trigger_event_id, started_at, completed_at, duration_ms, steps_log, error_message
        FROM flow_runs
        WHERE id = $1 AND flow_id = $2
        "#,
        run_id,
        flow_id
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

async fn get_flow_stats(
    State(state): State<AppState>,
    Path(flow_id): Path<uuid::Uuid>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    let stats = sqlx::query!(
        r#"
        SELECT
            COUNT(*) as total_runs,
            COUNT(CASE WHEN status = 'success' THEN 1 END) as successful_runs,
            COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_runs,
            MAX(duration_ms) as max_duration_ms,
            MIN(duration_ms) as min_duration_ms
        FROM flow_runs
        WHERE flow_id = $1
        "#,
        flow_id
    )
    .fetch_one(&state.pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Calculate average manually
    let avg_query = sqlx::query!("SELECT AVG(CAST(duration_ms AS FLOAT8)) as avg_dur FROM flow_runs WHERE flow_id = $1", flow_id)
        .fetch_one(&state.pool)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let total = stats.total_runs.unwrap_or(0);
    let successful = stats.successful_runs.unwrap_or(0);
    let success_rate = if total > 0 { (successful as f64 / total as f64) * 100.0 } else { 0.0 };

    Ok(Json(serde_json::json!({
        "total_runs": total,
        "successful_runs": successful,
        "failed_runs": stats.failed_runs.unwrap_or(0),
        "success_rate_percent": success_rate,
        "avg_duration_ms": avg_query.avg_dur,
        "max_duration_ms": stats.max_duration_ms,
        "min_duration_ms": stats.min_duration_ms,
    })))
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
