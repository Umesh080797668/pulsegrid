use axum::{
    body::Bytes,
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, Query, State,
    },
    http::HeaderMap,
    response::IntoResponse,
    routing::{delete, get, post},
    Json, Router,
};
use core_vault::Vault;
use futures_util::future::join_all;
use futures_util::{SinkExt, StreamExt};
use redis::{
    AsyncCommands,
    streams::{StreamReadOptions, StreamReadReply},
};
use reqwest::Client;
use chrono::{Datelike, Timelike};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, Row};
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

#[derive(Clone, Copy)]
struct PlanLimits {
    max_flows: i64,
    max_events_per_month: i64,
    max_connectors: i64,
    allowed_connector_tier: &'static str,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
struct AIPatternRecord {
    id: uuid::Uuid,
    workspace_id: uuid::Uuid,
    pattern_type: String,
    description: String,
    confidence: f32,
    frequency: String,
    events_involved: serde_json::Value,
    suggested_trigger: Option<String>,
    suggested_actions: serde_json::Value,
    suggested_flow: serde_json::Value,
    detected_at: chrono::DateTime<chrono::Utc>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
struct StripeWebhookEnvelope {
    #[serde(rename = "type")]
    event_type: String,
    data: StripeWebhookData,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
struct StripeWebhookData {
    object: serde_json::Value,
}

const FREE_CONNECTORS: &[&str] = &[
    "GMAIL",
    "SLACK",
    "TELEGRAM",
    "GITHUB",
    "GOOGLE_SHEETS",
    "NOTION",
    "AIRTABLE",
    "HTTP",
    "EMAIL",
    "RSS",
    "WEATHER_API",
    "SCHEDULE",
    "WEBHOOK",
    "PUSHOVER",
    "DISCORD",
];

const PRO_CONNECTORS: &[&str] = &[
    "SHOPIFY",
    "STRIPE",
    "HUBSPOT",
    "SALESFORCE",
    "TWILIO",
    "SENDGRID",
    "WHATSAPP_BUSINESS",
    "LINEAR",
    "JIRA",
    "PAGERDUTY",
    "DATADOG",
    "CLOUDFLARE",
    "AWS",
    "GOOGLE_CLOUD",
    "PLAID",
    "FITBIT",
    "APPLE_HEALTH",
];

// BILLING: Plan limit configuration per workspace tier
// STUB: This is the scaffolding for plan enforcement.
// 
// Phase 4 will add:
// - Stripe integration for automatic billing
// - Monthly usage reports
// - Overage notifications and soft limits
// - Plan downgrades with data retention options
fn plan_limits(plan: &str) -> PlanLimits {
    match plan.trim().to_lowercase().as_str() {
        "pro" => PlanLimits {
            max_flows: 50,
            max_events_per_month: 50_000,
            max_connectors: 10,
            allowed_connector_tier: "pro",
        },
        "business" | "enterprise" => PlanLimits {
            max_flows: 500,
            max_events_per_month: 500_000,
            max_connectors: 100,
            allowed_connector_tier: "business",
        },
        _ => PlanLimits {
            max_flows: 5,
            max_events_per_month: 1_000,
            max_connectors: 3,
            allowed_connector_tier: "free",
        },
    }
}

fn month_start_utc() -> chrono::NaiveDate {
    let now = chrono::Utc::now().date_naive();
    chrono::NaiveDate::from_ymd_opt(now.year(), now.month(), 1).unwrap_or(now)
}

fn is_connector_allowed(plan: &str, connector_id: &str) -> bool {
    let normalized = connector_id.trim().to_uppercase();
    if FREE_CONNECTORS.contains(&normalized.as_str()) {
        return true;
    }

    let limits = plan_limits(plan);
    if limits.allowed_connector_tier == "pro" {
        return PRO_CONNECTORS.contains(&normalized.as_str()) || FREE_CONNECTORS.contains(&normalized.as_str());
    }

    if limits.allowed_connector_tier == "business" {
        return true;
    }

    false
}

async fn get_workspace_plan(
    pool: &sqlx::PgPool,
    workspace_id: uuid::Uuid,
) -> Result<String, (axum::http::StatusCode, String)> {
    let row = sqlx::query!("SELECT plan FROM workspaces WHERE id = $1", workspace_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    row.map(|r| r.plan).ok_or((axum::http::StatusCode::NOT_FOUND, "Workspace not found".to_string()))
}

async fn get_workspace_flow_count(
    pool: &sqlx::PgPool,
    workspace_id: uuid::Uuid,
) -> Result<i64, (axum::http::StatusCode, String)> {
    let row = sqlx::query!("SELECT COUNT(*) as count FROM flows WHERE workspace_id = $1", workspace_id)
        .fetch_one(pool)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(row.count.unwrap_or(0))
}

async fn get_workspace_connector_count(
    pool: &sqlx::PgPool,
    workspace_id: uuid::Uuid,
) -> Result<i64, (axum::http::StatusCode, String)> {
    let row = sqlx::query!("SELECT COUNT(*) as count FROM credentials WHERE workspace_id = $1", workspace_id)
        .fetch_one(pool)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(row.count.unwrap_or(0))
}

async fn get_monthly_usage(
    pool: &sqlx::PgPool,
    workspace_id: uuid::Uuid,
) -> Result<(i64, i64), (axum::http::StatusCode, String)> {
    let month = month_start_utc();
    let row = sqlx::query(
        "SELECT event_count, flow_run_count FROM usage_counters WHERE workspace_id = $1 AND usage_month = $2",
    )
    .bind(workspace_id)
    .bind(month)
    .fetch_optional(pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if let Some(row) = row {
        let event_count: i64 = row.try_get("event_count").unwrap_or(0);
        let flow_run_count: i64 = row.try_get("flow_run_count").unwrap_or(0);
        Ok((event_count, flow_run_count))
    } else {
        Ok((0, 0))
    }
}

async fn increment_usage(
    pool: &sqlx::PgPool,
    workspace_id: uuid::Uuid,
    event_delta: i64,
    flow_run_delta: i64,
) -> Result<(), (axum::http::StatusCode, String)> {
    let month = month_start_utc();
    sqlx::query(
        r#"
        INSERT INTO usage_counters (workspace_id, usage_month, event_count, flow_run_count, connector_count)
        VALUES ($1, $2, $3, $4, 0)
        ON CONFLICT (workspace_id, usage_month)
        DO UPDATE SET
            event_count = usage_counters.event_count + EXCLUDED.event_count,
            flow_run_count = usage_counters.flow_run_count + EXCLUDED.flow_run_count,
            updated_at = NOW()
        "#,
    )
    .bind(workspace_id)
    .bind(month)
    .bind(event_delta)
    .bind(flow_run_delta)
    .execute(pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(())
}

async fn enforce_flow_limit(
    pool: &sqlx::PgPool,
    workspace_id: uuid::Uuid,
) -> Result<(), (axum::http::StatusCode, String)> {
    let plan = get_workspace_plan(pool, workspace_id).await?;
    let limits = plan_limits(&plan);
    let count = get_workspace_flow_count(pool, workspace_id).await?;
    if count >= limits.max_flows {
        return Err((
            axum::http::StatusCode::PAYMENT_REQUIRED,
            format!("Plan '{}' allows only {} flows", plan, limits.max_flows),
        ));
    }
    Ok(())
}

async fn enforce_connector_limit(
    pool: &sqlx::PgPool,
    workspace_id: uuid::Uuid,
    connector_id: &str,
) -> Result<(), (axum::http::StatusCode, String)> {
    let plan = get_workspace_plan(pool, workspace_id).await?;
    let limits = plan_limits(&plan);
    if !is_connector_allowed(&plan, connector_id) {
        return Err((
            axum::http::StatusCode::PAYMENT_REQUIRED,
            format!("Connector {} requires a higher plan", connector_id),
        ));
    }

    let count = get_workspace_connector_count(pool, workspace_id).await?;
    if count >= limits.max_connectors {
        return Err((
            axum::http::StatusCode::PAYMENT_REQUIRED,
            format!("Plan '{}' allows only {} connectors", plan, limits.max_connectors),
        ));
    }

    Ok(())
}

async fn enforce_event_quota(
    pool: &sqlx::PgPool,
    workspace_id: uuid::Uuid,
) -> Result<(), (axum::http::StatusCode, String)> {
    let plan = get_workspace_plan(pool, workspace_id).await?;
    let limits = plan_limits(&plan);
    let (event_count, _) = get_monthly_usage(pool, workspace_id).await?;
    if event_count >= limits.max_events_per_month {
        return Err((
            axum::http::StatusCode::TOO_MANY_REQUESTS,
            format!("Plan '{}' monthly event quota exceeded", plan),
        ));
    }
    Ok(())
}

#[allow(dead_code)]
async fn detect_workspace_patterns(
    pool: &sqlx::PgPool,
    workspace_id: uuid::Uuid,
) -> Result<Vec<AIPatternRecord>, (axum::http::StatusCode, String)> {
    // STUB: Pattern detection analysis - uses runtime queries since tables might not exist at compile time
    // TODO Phase 3: Replace with actual ML model inference
    let rows = sqlx::query(
        r#"
        SELECT fr.id, fr.flow_id, fr.started_at, fr.status, f.name AS flow_name
        FROM flow_runs fr
        LEFT JOIN flows f ON f.id = fr.flow_id
        WHERE fr.workspace_id = $1
          AND fr.started_at >= NOW() - INTERVAL '30 days'
        ORDER BY fr.started_at ASC
        "#,
    )
    .bind(workspace_id)
    .fetch_all(pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let mut patterns = Vec::new();
    if rows.is_empty() {
        return Ok(patterns);
    }

    let mut by_flow: std::collections::HashMap<uuid::Uuid, Vec<(chrono::DateTime<chrono::Utc>, String, String)>> =
        std::collections::HashMap::new();
    let mut ordered: Vec<(uuid::Uuid, chrono::DateTime<chrono::Utc>, String, String)> = Vec::new();

    for row in rows {
        let flow_id: Option<uuid::Uuid> = row.get("flow_id");
        let Some(flow_id) = flow_id else { continue };
        let started_at: chrono::DateTime<chrono::Utc> = row.get("started_at");
        let status: String = row.get("status");
        let flow_name: Option<String> = row.get("flow_name");
        let flow_name = flow_name.unwrap_or_else(|| "Unnamed flow".to_string());
        ordered.push((flow_id, started_at, status.clone(), flow_name.clone()));
        by_flow.entry(flow_id).or_default().push((started_at, status, flow_name));
    }

    for (flow_id, samples) in by_flow.iter() {
        if samples.len() >= 3 {
            let mut hour_groups: std::collections::HashMap<u32, usize> = std::collections::HashMap::new();
            let mut failure_count = 0usize;
            for (started_at, status, _) in samples.iter() {
                *hour_groups.entry(started_at.hour()).or_insert(0) += 1;
                if status.eq_ignore_ascii_case("failed") {
                    failure_count += 1;
                }
            }

            if let Some((hour, count)) = hour_groups.into_iter().max_by_key(|(_, count)| *count) {
                if count >= 3 {
                    let flow_name = samples.first().map(|(_, _, name)| name.clone()).unwrap_or_else(|| "flow".to_string());
                    patterns.push(AIPatternRecord {
                        id: uuid::Uuid::new_v4(),
                        workspace_id,
                        pattern_type: "time_based".to_string(),
                        description: format!("{} frequently runs around {:02}:00 UTC", flow_name, hour),
                        confidence: ((count as f32 / samples.len() as f32) + 0.2).min(1.0),
                        frequency: format!("{} runs observed", count),
                        events_involved: serde_json::json!([flow_id.to_string()]),
                        suggested_trigger: Some(format!("Schedule around {:02}:00 UTC", hour)),
                        suggested_actions: serde_json::json!([]),
                        suggested_flow: serde_json::json!({
                            "type": "schedule",
                            "connector": "schedule",
                            "event": "schedule.tick",
                            "filters": [{"field": "cron", "op": "eq", "value": format!("0 {} * * *", hour)}]
                        }),
                        detected_at: chrono::Utc::now(),
                    });
                }
            }

            if failure_count * 2 >= samples.len() && samples.len() >= 5 {
                let flow_name = samples.first().map(|(_, _, name)| name.clone()).unwrap_or_else(|| "flow".to_string());
                patterns.push(AIPatternRecord {
                    id: uuid::Uuid::new_v4(),
                    workspace_id,
                    pattern_type: "anomaly".to_string(),
                    description: format!("{} shows a high failure rate over the last 30 days", flow_name),
                    confidence: 0.8,
                    frequency: format!("{} failures out of {} runs", failure_count, samples.len()),
                    events_involved: serde_json::json!([flow_id.to_string()]),
                    suggested_trigger: None,
                    suggested_actions: serde_json::json!(["inspect recent step failures", "review connector secrets"]),
                    suggested_flow: serde_json::json!({
                        "type": "action",
                        "connector": "ai",
                        "event": "failure.analysis"
                    }),
                    detected_at: chrono::Utc::now(),
                });
            }
        }
    }

    let mut correlation_pairs: std::collections::HashMap<(uuid::Uuid, uuid::Uuid), usize> =
        std::collections::HashMap::new();
    for window in ordered.windows(2) {
        let (flow_a, time_a, _, _) = &window[0];
        let (flow_b, time_b, _, _) = &window[1];
        if flow_a != flow_b {
            let delta = (*time_b - *time_a).num_seconds();
            if delta > 0 && delta <= 600 {
                *correlation_pairs.entry((*flow_a, *flow_b)).or_insert(0) += 1;
            }
        }
    }

    for ((flow_a, flow_b), count) in correlation_pairs {
        if count >= 2 {
            patterns.push(AIPatternRecord {
                id: uuid::Uuid::new_v4(),
                workspace_id,
                pattern_type: "correlation".to_string(),
                description: format!("Flow {} is often followed by {} within 10 minutes", flow_a, flow_b),
                confidence: (count as f32 / 4.0).min(1.0),
                frequency: format!("{} correlated runs", count),
                events_involved: serde_json::json!([flow_a.to_string(), flow_b.to_string()]),
                suggested_trigger: Some(format!("When flow {} completes", flow_a)),
                suggested_actions: serde_json::json!([flow_b.to_string()]),
                suggested_flow: serde_json::json!({
                    "type": "action",
                    "connector": "webhook",
                    "event": "flow.correlated"
                }),
                detected_at: chrono::Utc::now(),
            });
        }
    }

    Ok(patterns)
}

#[allow(dead_code)]
async fn refresh_workspace_patterns(
    pool: &sqlx::PgPool,
    workspace_id: uuid::Uuid,
) -> Result<Vec<AIPatternRecord>, (axum::http::StatusCode, String)> {
    let patterns = detect_workspace_patterns(pool, workspace_id).await?;
    let mut tx = pool
        .begin()
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    sqlx::query("DELETE FROM ai_detected_patterns WHERE workspace_id = $1")
        .bind(workspace_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    for pattern in &patterns {
        sqlx::query(
            r#"
            INSERT INTO ai_detected_patterns (
                id, workspace_id, pattern_type, description, confidence, frequency,
                events_involved, suggested_trigger, suggested_actions, suggested_flow, detected_at, updated_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
            "#,
        )
        .bind(pattern.id)
        .bind(pattern.workspace_id)
        .bind(&pattern.pattern_type)
        .bind(&pattern.description)
        .bind(pattern.confidence)
        .bind(&pattern.frequency)
        .bind(&pattern.events_involved)
        .bind(&pattern.suggested_trigger)
        .bind(&pattern.suggested_actions)
        .bind(&pattern.suggested_flow)
        .bind(pattern.detected_at)
        .execute(&mut *tx)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    }

    tx.commit()
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(patterns)
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
        .route("/api/v1/workspaces/{workspace_id}/billing/usage", get(get_workspace_usage))
        .route("/api/v1/workspaces/{workspace_id}/patterns", get(get_detected_patterns))
        // Stripe webhook
        .route("/api/v1/stripe/webhook", post(stripe_webhook_handler))
        // Flow CRUD endpoints
        .route("/api/v1/flows", post(create_flow))
        .route("/api/v1/flows/{workspace_id}", get(list_flows))
        .route(
            "/api/v1/flow/{flow_id}",
            get(get_flow).put(update_flow).delete(delete_flow),
        )
        // Webhook endpoints
        .route("/api/v1/webhooks/{workspace_id}", post(webhook_receiver))
        .route("/api/v1/webhooks/{workspace_id}/{flow_id}", post(flow_webhook_receiver))
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
    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("failed to build event listener runtime");
        rt.block_on(start_event_listener(pool_clone, vault_clone, event_tx_clone));
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
    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("failed to build cron runtime");

        rt.block_on(async move {
            loop {
                tokio::time::sleep(std::time::Duration::from_secs(60)).await;

                let rows = sqlx::query!(
                    r#"SELECT id, workspace_id, definition, last_run_at FROM flows WHERE enabled = true"#
                )
                .fetch_all(&cron_pool)
                .await
                .unwrap_or_default();

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
                                            sub_flow_depth: None,
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
    const STREAM_KEY: &str = "stream:events:global";
    const CONSUMER_GROUP: &str = "pulsegrid-workers";

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

    // Ensure consumer group exists (idempotent)
    if let Err(e) = redis::cmd("XGROUP")
        .arg("CREATE")
        .arg(STREAM_KEY)
        .arg(CONSUMER_GROUP)
        .arg("$")
        .arg("MKSTREAM")
        .query_async::<()>(&mut con)
        .await
    {
        let err = e.to_string();
        if !err.contains("BUSYGROUP") {
            eprintln!("Failed to create Redis consumer group: {}", err);
            return;
        }
    }

    let consumer_name = format!("consumer-{}", uuid::Uuid::new_v4());
    println!(
        "Using Redis consumer group '{}' with consumer '{}'",
        CONSUMER_GROUP, consumer_name
    );

    let opts = StreamReadOptions::default()
        .group(CONSUMER_GROUP, &consumer_name)
        .block(5000) // Block for 5 seconds waiting for events
        .count(10); // Read up to 10 events per batch

    let executor = Arc::new(FlowExecutor::new(pg_pool.clone(), vault.clone()));

    loop {
        // XREADGROUP for at-least-once delivery
        let result: Result<StreamReadReply, redis::RedisError> = con
            .xread_options(&[STREAM_KEY], &[">"], &opts)
            .await;

        match result {
            Ok(reply) => {
                for key in reply.keys {
                    for node in key.ids {
                        // Grab the actual event payload (we assume it's stored under a 'payload' field)
                        if let Some(redis::Value::BulkString(data)) = node.map.get("payload") {
                            let payload_str = String::from_utf8_lossy(data);

                            // Try parsing into our structural PulseEvent model
                            match serde_json::from_str::<PulseEvent>(&payload_str) {
                                Ok(event) => {
                                    println!("🔥 Received PulseEvent (ID: {})", node.id);
                                    let _ = event_tx.send(payload_str.to_string());

                                    // BILLING: Increment event count
                                    let _ = increment_usage(&pg_pool, event.tenant_id, 1, 0).await;

                                    // PATTERN DETECTION: STUB - Trigger after collecting N events
                                    // TODO Phase 3: Replace with actual ML-based pattern detection via tract ONNX
                                    // For now, this is a placeholder that could trigger pattern analysis after N events
                                    // Example: Every 100 events, call analyze_event_history() and store results
                                    let (event_count, _) = get_monthly_usage(&pg_pool, event.tenant_id).await.unwrap_or((0, 0));
                                    if event_count % 100 == 0 && event_count > 0 {
                                        eprintln!("[STUB] Trigger batch pattern detection (every 100 events) - not yet implemented");
                                        // TODO: Call analyze_event_history() and store to ai_detected_patterns table
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
                                        let should_dead_letter = flow_def
                                            .error_policy
                                            .on_failure
                                            .eq_ignore_ascii_case("dead_letter");

                                        for group in execution_order {
                                            use std::future::Future;
                                            use std::pin::Pin;

                                            let mut futures_vec: Vec<Pin<Box<dyn Future<Output = models::StepExecutionResult> + '_>>> = Vec::new();

                                            for step_id in &group {
                                                if let Some(step) =
                                                    flow_def.steps.iter().find(|s| &s.id == step_id)
                                                {
                                                    let step_clone = step.clone();
                                                    let executor_clone = Arc::clone(&executor);
                                                    let event_clone = event.clone();
                                                    let outputs_snapshot = step_outputs.clone();

                                                    let fut = Box::pin(async move {
                                                        execute_step_with_retry(
                                                            executor_clone,
                                                            &step_clone,
                                                            serde_json::json!({}),
                                                            &outputs_snapshot,
                                                            &event_clone,
                                                        )
                                                        .await
                                                    });

                                                    futures_vec.push(fut);
                                                }
                                            }

                                            let results = join_all(futures_vec).await;

                                            for result in results {
                                                if result.status == "failed" {
                                                    all_steps_succeeded = false;
                                                    println!(
                                                        "      ❌ Step {} failed: {:?}",
                                                        result.step_id, result.error
                                                    );

                                                    if should_dead_letter {
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
                                                    }
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

                                        // Push run-completion event for realtime dashboard updates
                                        let workspace_stream = format!("stream:events:{}", event.tenant_id);
                                        let completion_payload = serde_json::json!({
                                            "event_type": "flow_run_completed",
                                            "tenant_id": event.tenant_id,
                                            "flow_id": flow.id,
                                            "status": final_status,
                                            "run_id": flow_run_id,
                                            "completed_at": chrono::Utc::now().to_rfc3339(),
                                        });
                                        let completion_payload_str = serde_json::to_string(&completion_payload)
                                            .unwrap_or_else(|_| "{}".to_string());
                                        let _ = con
                                            .xadd::<_, _, _, _, ()>(
                                                &workspace_stream,
                                                "*",
                                                &[("payload", completion_payload_str)],
                                            )
                                            .await;

                                        let _ = sqlx::query!(
                                            r#"UPDATE flows SET run_count = run_count + 1, last_run_at = NOW() WHERE id = $1"#,
                                            flow.id as _
                                        ).execute(&pg_pool).await;

                                        if final_status == "failed"
                                            && flow_def
                                                .error_policy
                                                .on_failure
                                                .eq_ignore_ascii_case("notify_owner")
                                        {
                                            let owner_email = sqlx::query_scalar::<_, String>(
                                                r#"
                                                SELECT u.email
                                                FROM workspaces w
                                                JOIN users u ON u.id = w.owner_user_id
                                                WHERE w.id = $1
                                                LIMIT 1
                                                "#,
                                            )
                                            .bind(event.tenant_id)
                                            .fetch_optional(&pg_pool)
                                            .await
                                            .ok()
                                            .flatten();

                                            let notify_email = flow_def
                                                .error_policy
                                                .notify_email
                                                .clone()
                                                .or(owner_email)
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

                                    // Acknowledge only after successful processing
                                    if let Err(e) = redis::cmd("XACK")
                                        .arg(STREAM_KEY)
                                        .arg(CONSUMER_GROUP)
                                        .arg(&node.id)
                                        .query_async::<i32>(&mut con)
                                        .await
                                    {
                                        eprintln!(
                                            "Failed to ACK message {} in group {}: {}",
                                            node.id, CONSUMER_GROUP, e
                                        );
                                    }
                                }
                                Err(err) => {
                                    println!(
                                        "⚠️ Raw message received (ID: {}). Parsing to PulseEvent failed: {}",
                                        node.id, err
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
    // BILLING: Enforce flow creation limit per plan
    enforce_flow_limit(&state.pool, payload.workspace_id).await?;
    
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
    // BILLING STUB: Workspace plan upgrade handler
    // This endpoint updates the workspace plan and billing subscription.
    // 
    // Phase 4 (Full Stripe Integration) will add:
    // - Stripe API calls to create/update customer subscriptions
    // - Webhook signature verification from Stripe events
    // - Subscription lifecycle management (pause, cancel, downgrade)
    // - Invoice generation and payment processing
    // - Retry logic for failed payments
    // - Trial period management for new plans
    // - Proration calculations for mid-cycle upgrades
    //
    // Current limitations (scaffold):
    // - No Stripe API integration
    // - No subscription created in Stripe during upgrade
    // - No webhook handler to sync Stripe changes back to DB
    // - No cancellation logic if payment fails
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

    // BILLING: Enforce connector tier and count limits per plan
    enforce_connector_limit(&state.pool, workspace_id, &connector_id).await?;

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
#[allow(dead_code)]
struct WebhookPayload {
    #[serde(default)]
    payload: serde_json::Value,
    #[serde(default)]
    signature: Option<String>,
}

async fn webhook_receiver(
    State(state): State<AppState>,
    Path(workspace_id): Path<uuid::Uuid>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    verify_workspace_webhook_signature(&state, workspace_id, &headers, &body).await?;

    // BILLING: Enforce event quota per plan
    enforce_event_quota(&state.pool, workspace_id).await?;

    let payload_value = serde_json::from_slice::<serde_json::Value>(&body).unwrap_or_else(|_| {
        serde_json::json!({ "raw": String::from_utf8_lossy(&body).to_string() })
    });
    
    let event = PulseEvent {
        id: uuid::Uuid::new_v4(),
        tenant_id: workspace_id,
        source: Some("webhook".to_string()),
        event_type: "webhook.received".to_string(),
        data: serde_json::json!({
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "payload": payload_value
        }),
        sub_flow_depth: None,
    };

    // Increment event count for billing
    let _ = increment_usage(&state.pool, workspace_id, 1, 0).await;

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
    headers: HeaderMap,
    body: Bytes,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    verify_workspace_webhook_signature(&state, workspace_id, &headers, &body).await?;

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

async fn verify_workspace_webhook_signature(
    state: &AppState,
    workspace_id: uuid::Uuid,
    headers: &HeaderMap,
    body: &Bytes,
) -> Result<(), (axum::http::StatusCode, String)> {
    let signature = headers
        .get("x-signature")
        .or_else(|| headers.get("x-webhook-signature"))
        .or_else(|| headers.get("x-hub-signature-256"))
        .and_then(|v| v.to_str().ok())
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .ok_or((
            axum::http::StatusCode::UNAUTHORIZED,
            "Missing webhook signature header".to_string(),
        ))?;

    let row = sqlx::query(
        r#"
        SELECT encrypted_blob, nonce
        FROM credentials
        WHERE workspace_id = $1 AND LOWER(connector_id) = 'webhook'
        LIMIT 1
        "#,
    )
    .bind(workspace_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or((
        axum::http::StatusCode::UNAUTHORIZED,
        "Webhook secret not configured".to_string(),
    ))?;

    let encrypted_blob: Vec<u8> = row
        .try_get("encrypted_blob")
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let nonce: Vec<u8> = row
        .try_get("nonce")
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let secret = state
        .vault
        .decrypt(&encrypted_blob, &nonce)
        .map_err(|_| {
            (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to decrypt webhook secret".to_string(),
            )
        })?;

    let payload = std::str::from_utf8(body).map_err(|_| {
        (
            axum::http::StatusCode::BAD_REQUEST,
            "Webhook payload is not valid UTF-8".to_string(),
        )
    })?;

    if !state
        .vault
        .verify_webhook_signature(payload, signature, &secret)
    {
        return Err((
            axum::http::StatusCode::UNAUTHORIZED,
            "Invalid webhook signature".to_string(),
        ));
    }

    Ok(())
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

// STUB: Pattern detection endpoint - returns detected patterns for a workspace
// This is scaffolding for the pattern detection feature. Full ML-based detection
// will be implemented in Phase 3 with tract ONNX integration.
async fn get_detected_patterns(
    State(state): State<AppState>,
    Path(workspace_id): Path<uuid::Uuid>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    // STUB: Retrieve patterns from ai_detected_patterns table
    // TODO: Add pagination, filtering by pattern_type, date range
    let patterns = sqlx::query(
        r#"
        SELECT id, workspace_id, pattern_type, description, confidence, frequency,
               events_involved, suggested_trigger, suggested_actions, suggested_flow, detected_at
        FROM ai_detected_patterns
        WHERE workspace_id = $1
        ORDER BY detected_at DESC
        LIMIT 50
        "#
    )
    .bind(workspace_id)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let patterns_json: Vec<serde_json::Value> = patterns.iter().map(|row| {
        serde_json::json!({
            "id": row.get::<String, _>("id"),
            "workspace_id": row.get::<uuid::Uuid, _>("workspace_id").to_string(),
            "pattern_type": row.get::<String, _>("pattern_type"),
            "description": row.get::<String, _>("description"),
            "confidence": row.get::<f32, _>("confidence"),
            "frequency": row.get::<String, _>("frequency"),
            "events_involved": row.get::<serde_json::Value, _>("events_involved"),
            "suggested_trigger": row.get::<Option<String>, _>("suggested_trigger"),
            "suggested_actions": row.get::<serde_json::Value, _>("suggested_actions"),
            "suggested_flow": row.get::<serde_json::Value, _>("suggested_flow"),
            "detected_at": row.get::<chrono::DateTime<chrono::Utc>, _>("detected_at").to_rfc3339(),
        })
    }).collect();

    Ok(Json(serde_json::json!({
        "patterns": patterns_json,
        "total": patterns_json.len()
    })))
}

// BILLING: Stripe webhook handler for subscription lifecycle events
// STUB: This endpoint validates Stripe webhook signatures and processes subscription events.
// TODO: Add actual Stripe secret verification, implement subscription create/cancel/expire lifecycle
async fn stripe_webhook_handler(
    _state: State<AppState>,
    body: axum::body::Bytes,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    // STUB: Parse Stripe webhook signature and event
    // In production, verify signature using Stripe secret from environment
    let _stripe_secret = std::env::var("STRIPE_WEBHOOK_SECRET")
        .unwrap_or_else(|_| "whsec_test".to_string());
    
    let body_str = String::from_utf8(body.to_vec())
        .map_err(|e| (axum::http::StatusCode::BAD_REQUEST, e.to_string()))?;
    
    // TODO: Implement stripe_verify_signature(&body_str, headers, &stripe_secret)
    // For now, just parse the event
    let event: serde_json::Value = serde_json::from_str(&body_str)
        .map_err(|e| (axum::http::StatusCode::BAD_REQUEST, e.to_string()))?;
    
    let event_type = event.get("type").and_then(|v| v.as_str())
        .unwrap_or("unknown");
    
    eprintln!("[STUB] Stripe webhook received: {}", event_type);
    
    // BILLING: Stub handlers for subscription lifecycle events
    match event_type {
        "customer.subscription.created" => {
            // TODO: Extract customer_id, subscription_id from event.data.object
            // TODO: Update billing_subscriptions table with Stripe IDs
            eprintln!("[STUB] Subscription created - not yet implemented");
        },
        "customer.subscription.updated" => {
            // TODO: Update plan_tier and status in billing_subscriptions
            eprintln!("[STUB] Subscription updated - not yet implemented");
        },
        "customer.subscription.deleted" => {
            // TODO: Set status to 'canceled' in billing_subscriptions
            // TODO: Revert workspace plan to 'free'
            eprintln!("[STUB] Subscription canceled - not yet implemented");
        },
        "invoice.payment_failed" => {
            // TODO: Set status to 'payment_failed' and send notification
            eprintln!("[STUB] Payment failed - not yet implemented");
        },
        _ => {
            eprintln!("[STUB] Unknown Stripe event type: {}", event_type);
        }
    }
    
    // Return success to acknowledge receipt
    Ok(Json(serde_json::json!({
        "received": true,
        "event_type": event_type
    })))
}

// BILLING: Usage metering endpoint - returns current month usage for a workspace
// STUB: Shows event and flow run counts for billing enforcement
async fn get_workspace_usage(
    State(state): State<AppState>,
    Path(workspace_id): Path<uuid::Uuid>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    // Get current plan
    let plan = get_workspace_plan(&state.pool, workspace_id).await
        .unwrap_or_else(|_| "free".to_string());
    
    let limits = plan_limits(&plan);
    
    // Get current month usage
    let (event_count, flow_run_count) = get_monthly_usage(&state.pool, workspace_id)
        .await
        .unwrap_or((0, 0));
    
    // Get current counts
    let flow_count = get_workspace_flow_count(&state.pool, workspace_id).await
        .unwrap_or(0);
    let connector_count = get_workspace_connector_count(&state.pool, workspace_id).await
        .unwrap_or(0);
    
    Ok(Json(serde_json::json!({
        "plan": plan,
        "current_month": {
            "events_count": event_count,
            "flow_runs_count": flow_run_count,
            "events_limit": limits.max_events_per_month,
            "events_remaining": (limits.max_events_per_month - event_count).max(0),
        },
        "limits": {
            "max_flows": limits.max_flows,
            "max_events_per_month": limits.max_events_per_month,
            "max_connectors": limits.max_connectors,
            "allowed_connector_tier": limits.allowed_connector_tier,
        },
        "current_resources": {
            "flows_count": flow_count,
            "flows_remaining": (limits.max_flows - flow_count).max(0),
            "connectors_count": connector_count,
            "connectors_remaining": (limits.max_connectors - connector_count).max(0),
        }
    })))
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
