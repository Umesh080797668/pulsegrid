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
use chrono::{Datelike, Timelike};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, Postgres, QueryBuilder, Row};
use sqlx::postgres::PgPoolOptions;
use std::collections::HashSet;
use std::net::SocketAddr;
use std::str::FromStr;
use std::sync::Arc;
use std::time::Duration;
use tokio::net::TcpListener;
use tokio::sync::broadcast;

mod grpc;
mod models;
mod cache;
mod approval;
use cache::LocalCache;
#[allow(unused_imports)]
use models::{
    ApiKey, CreateApiKeyRequest, CreateApiKeyResponse, ApiKeyResponse,
    CreateFlowRequest, CreateWorkspaceRequest, FlowDefinition, FlowResponse, FlowRunResponse,
    FlowEnvironmentStatus, FlowVersionDiff, FlowVersionResponse,
    PulseEvent, UpdateFlowRequest, UpsertWorkspaceSecretRequest, WorkspaceResponse,
    WorkspaceSecretSummary, ApprovalDecisionRequest, ApprovalDecisionResponse,
};
mod executor;
mod guard_emitter;
mod codebase_indexer;
mod workspace_vault;
use approval::ApprovalManager;
use core_proto::guard::guard_stream_server::GuardStreamServer;
use core_proto::pulsecore::pulse_core_service_server::PulseCoreServiceServer;
use guard_emitter::{install_guard_event_pipeline, GuardEventPublisher, GuardStreamService};
use executor::FlowExecutor;
use grpc::MyPulseCoreService;
use workspace_vault::WorkspaceVaultService;

#[derive(Clone)]
struct AppState {
    pool: sqlx::PgPool,
    vault: Arc<Vault>,
    workspace_vaults: Arc<WorkspaceVaultService>,
    event_tx: broadcast::Sender<String>,
    cache: Arc<LocalCache>,
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

#[derive(Debug, Deserialize)]
struct StripeCustomerCreateResponse {
    id: String,
}

#[derive(Debug, Deserialize)]
struct StripeSubscriptionCreateResponse {
    id: String,
}

#[derive(Debug, Deserialize)]
struct DetectedPatternsQuery {
    limit: Option<i64>,
    offset: Option<i64>,
    pattern_type: Option<String>,
    start_date: Option<String>,
    end_date: Option<String>,
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
// Phase 1/2 enforcement baseline: static plan limits used by runtime checks.
// 
// Phase 4 will add:
// - Stripe integration for automatic billing
// - Monthly usage reports
// - Overage notifications and soft limits
// - Plan downgrades with data retention options
fn plan_limits(plan: &str) -> PlanLimits {
    match plan.trim().to_lowercase().as_str() {
        "business" => PlanLimits {
            max_flows: 500,
            max_events_per_month: 60_000_000,
            max_connectors: 100,
            allowed_connector_tier: "business",
        },
        "pro" => PlanLimits {
            max_flows: 50,
            max_events_per_month: 3_000_000,
            max_connectors: 10,
            allowed_connector_tier: "pro",
        },
        "enterprise" => PlanLimits {
            max_flows: 5000,
            max_events_per_month: 600_000_000,
            max_connectors: 1000,
            allowed_connector_tier: "business",
        },
        _ => PlanLimits {
            max_flows: 5,
            max_events_per_month: 30_000,
            max_connectors: 3,
            allowed_connector_tier: "free",
        },
    }
}

fn month_start_utc() -> chrono::NaiveDate {
    let now = chrono::Utc::now().date_naive();
    chrono::NaiveDate::from_ymd_opt(now.year(), now.month(), 1).unwrap_or(now)
}

fn flow_has_opt_in_polling(definition: &FlowDefinition) -> bool {
    let connector = definition.trigger.connector.trim().to_lowercase();
    if matches!(connector.as_str(), "webhook" | "schedule") {
        return false;
    }

    definition.trigger.filters.iter().any(|filter| {
        let field = filter.field.trim().to_lowercase();
        let interval = match field.as_str() {
            "poll_interval_seconds" | "poll_every_seconds" | "interval_seconds" | "poll_interval" => filter
                .value
                .as_i64()
                .or_else(|| filter.value.as_str().and_then(|value| value.parse::<i64>().ok())),
            "polling_enabled" => Some(if filter.value.as_bool().unwrap_or(false) { 1 } else { 0 }),
            _ => None,
        };

        matches!(interval, Some(value) if value > 0)
    })
}

fn trigger_poll_interval_seconds(definition: &FlowDefinition) -> i64 {
    definition
        .trigger
        .filters
        .iter()
        .find(|filter| {
            matches!(
                filter.field.as_str(),
                "poll_interval_seconds" | "poll_every_seconds" | "interval_seconds" | "poll_interval"
            )
        })
        .and_then(|filter| {
            filter
                .value
                .as_i64()
                .or_else(|| filter.value.as_str().and_then(|value| value.parse::<i64>().ok()))
        })
        .unwrap_or(300)
        .clamp(30, 3600)
}
async fn run_database_migrations(pool: &sqlx::PgPool) -> Result<u32, Box<dyn std::error::Error>> {
    // Create migrations table if it doesn't exist
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS _sqlx_migrations (
            version BIGINT PRIMARY KEY,
            description TEXT NOT NULL,
            installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            success BOOLEAN NOT NULL,
            execution_time BIGINT NOT NULL,
            installed_by TEXT NOT NULL
        )
        "#
    )
    .execute(pool)
    .await?;

    // Read migration files from ./migrations directory
    let migrations_dir = "./migrations";
    let mut entries = std::fs::read_dir(migrations_dir)?
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let path = e.path();
            if path.extension().map(|ext| ext == "sql").unwrap_or(false) {
                Some(path)
            } else {
                None
            }
        })
        .collect::<Vec<_>>();
    
    entries.sort();
    
    let mut count = 0;
    for migration_path in entries {
        let filename = migration_path.file_name().unwrap().to_string_lossy().to_string();
        // Extract version from filename (format: YYYYMMDDHHMMSS_description.sql)
        let version_str = filename.split('_').next().unwrap_or("0");
        if let Ok(version) = version_str.parse::<i64>() {
            // Check if already applied
            let already_applied: Option<(i64,)> = sqlx::query_as(
                "SELECT version FROM _sqlx_migrations WHERE version = $1"
            )
            .bind(version)
            .fetch_optional(pool)
            .await?;
            
            if already_applied.is_none() {
                let sql_content = std::fs::read_to_string(&migration_path)?;
                let start = std::time::Instant::now();
                
                match sqlx::query(&sql_content).execute(pool).await {
                    Ok(_) => {
                        let execution_time = start.elapsed().as_millis() as i64;
                        sqlx::query(
                            "INSERT INTO _sqlx_migrations (version, description, success, execution_time, installed_by) VALUES ($1, $2, true, $3, 'pulsegrid-startup')"
                        )
                        .bind(version)
                        .bind(&filename)
                        .bind(execution_time)
                        .execute(pool)
                        .await?;
                        
                        println!("  ✅ Applied migration: {}", filename);
                        count += 1;
                    }
                    Err(e) => {
                        eprintln!("  ❌ Migration failed: {} - {}", filename, e);
                        sqlx::query(
                            "INSERT INTO _sqlx_migrations (version, description, success, execution_time, installed_by) VALUES ($1, $2, false, 0, 'pulsegrid-startup')"
                        )
                        .bind(version)
                        .bind(&filename)
                        .execute(pool)
                        .await?;
                        
                        return Err(Box::new(e));
                    }
                }
            }
        }
    }
    
    Ok(count)
}

async fn publish_event_to_redis(redis_url: &str, event: &PulseEvent) {
    if let Ok(client) = redis::Client::open(redis_url) {
        if let Ok(mut con) = client.get_multiplexed_async_connection().await {
            let workspace_stream = workspace_stream_key_for_environment(event.tenant_id, event_environment(event));
            let payload = serde_json::to_string(event).unwrap_or_default();
            let _ = redis::AsyncCommands::xadd::<_, _, _, _, ()>(&mut con, &workspace_stream, "*", &[("payload", payload)]).await;
        }
    }
}

async fn start_schedule_worker(cron_pool: sqlx::PgPool, redis_url: String) {
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

            if def.trigger.connector != "schedule" {
                continue;
            }

            let cron_val = def.trigger.filters.iter().find(|f| f.field == "cron").map(|f| &f.value);
            if let Some(serde_json::Value::String(cron_expr)) = cron_val {
                let last = row.last_run_at.unwrap_or_else(|| chrono::Utc::now() - chrono::Duration::days(1));

                if let Ok(schedule) = cron::Schedule::from_str(cron_expr) {
                    if let Some(next) = schedule.after(&last).next() {
                        if chrono::Utc::now() >= next {
                            let event = crate::models::PulseEvent {
                                id: uuid::Uuid::new_v4(),
                                tenant_id: row.workspace_id.unwrap_or_default(),
                                source: Some("schedule".into()),
                                event_type: def.trigger.event.clone(),
                                data: serde_json::json!({
                                    "triggered_at": chrono::Utc::now().to_rfc3339(),
                                    "flow_id": row.id,
                                    "cron": cron_expr,
                                }),
                                sub_flow_depth: None,
                            };

                            publish_event_to_redis(&redis_url, &event).await;
                            let _ = sqlx::query!("UPDATE flows SET last_run_at = NOW() WHERE id = $1", row.id as _)
                                .execute(&cron_pool)
                                .await;
                        }
                    }
                }
            }
        }
    }
}

async fn start_approval_expiry_worker(pg_pool: sqlx::PgPool) {
    let sweep_seconds = std::env::var("APPROVAL_EXPIRY_SWEEP_SECONDS")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(60)
        .max(10);

    loop {
        tokio::time::sleep(std::time::Duration::from_secs(sweep_seconds)).await;

        let approval_manager = ApprovalManager::new(pg_pool.clone());
        let expired_count = match approval_manager.expire_old_approvals().await {
            Ok(count) => count,
            Err(error) => {
                eprintln!("Failed to expire old approvals: {}", error);
                continue;
            }
        };

        if expired_count == 0 {
            continue;
        }

        match sqlx::query!(
            r#"
            UPDATE flow_runs fr
            SET status = 'failed',
                completed_at = COALESCE(fr.completed_at, NOW()),
                error_message = 'Approval expired'
            WHERE fr.status = 'pending_approval'
              AND EXISTS (
                  SELECT 1
                  FROM pending_approvals pa
                  WHERE pa.flow_run_id = fr.id
                    AND pa.status = 'expired'
              )
            "#
        )
        .execute(&pg_pool)
        .await
        {
            Ok(result) => {
                if result.rows_affected() > 0 {
                    println!(
                        "⏱️ Expired {} approvals; failed {} flow runs waiting on approval",
                        expired_count,
                        result.rows_affected()
                    );
                }
            }
            Err(error) => {
                eprintln!("Failed to mark flow runs as failed for expired approvals: {}", error);
            }
        }
    }
}

async fn start_polling_worker(poll_pool: sqlx::PgPool, redis_url: String) {
    loop {
        tokio::time::sleep(std::time::Duration::from_secs(60)).await;

        let rows = sqlx::query!(
            r#"SELECT id, workspace_id, definition, last_run_at FROM flows WHERE enabled = true"#
        )
        .fetch_all(&poll_pool)
        .await
        .unwrap_or_default();

        for row in rows {
            let def: crate::models::FlowDefinition = match serde_json::from_value(row.definition) {
                Ok(d) => d,
                Err(_) => continue,
            };

            if !flow_has_opt_in_polling(&def) {
                continue;
            }

            let poll_interval_seconds = trigger_poll_interval_seconds(&def);
            let last_polled_at = row.last_run_at.unwrap_or_else(|| chrono::Utc::now() - chrono::Duration::days(1));
            let now = chrono::Utc::now();

            if now.signed_duration_since(last_polled_at).num_seconds() < poll_interval_seconds {
                continue;
            }

            let event = crate::models::PulseEvent {
                id: uuid::Uuid::new_v4(),
                tenant_id: row.workspace_id.unwrap_or_default(),
                source: Some(def.trigger.connector.clone()),
                event_type: def.trigger.event.clone(),
                data: serde_json::json!({
                    "poll_interval_seconds": poll_interval_seconds,
                    "polled_at": now.to_rfc3339(),
                    "connector": def.trigger.connector,
                    "flow_id": row.id,
                }),
                sub_flow_depth: None,
            };

            publish_event_to_redis(&redis_url, &event).await;
            let _ = sqlx::query!("UPDATE flows SET last_run_at = NOW() WHERE id = $1", row.id as _)
                .execute(&poll_pool)
                .await;
        }
    }
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

    let (guard_signal_tx, _) = broadcast::channel(512);
    let guard_publisher = Arc::new(GuardEventPublisher::new(guard_signal_tx.clone()));
    if let Err(error) = install_guard_event_pipeline(guard_publisher.clone()) {
        eprintln!("Failed to initialize guard event pipeline: {}", error);
    }

    // Setup PostgreSQL connection pool
    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await
        .expect("Failed to connect to Postgres");

    println!("Connected to PostgreSQL databases!");
    
    // Run migrations automatically on startup using runtime approach
    println!("🔄 Running database migrations...");
    match run_database_migrations(&pool).await {
        Ok(count) => println!("✅ Database migrations completed successfully ({} migrations run)", count),
        Err(e) => {
            eprintln!("⚠️  Warning: Failed to run migrations: {}", e);
            eprintln!("Continuing anyway, but schema may not be up-to-date. Check migrations manually.");
        }
    }

    codebase_indexer::spawn_codebase_indexer(pool.clone());

    // Initialize local cache
    let cache = Arc::new(
        LocalCache::new("./data/local_cache")
            .expect("Failed to initialize RocksDB cache")
    );
    println!("Initialized local RocksDB cache!");

    let webhook_signing_secret = std::env::var("PULSE_WEBHOOK_SIGNING_SECRET")
        .unwrap_or_else(|_| "pulsegrid-dev-webhook-signing-secret".to_string());
    let workspace_vaults = Arc::new(
        WorkspaceVaultService::from_env(pool.clone())
            .expect("PULSE_HSM_ESCROW_URL must be configured for workspace credential escrow"),
    );
    let (event_tx, _) = broadcast::channel::<String>(256);
    
    // Initialize Redis URL for connection pooling (used by event publishers)
    let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://localhost:6379/".to_string());
    
    let state = AppState {
        pool: pool.clone(),
        vault: Arc::new(Vault::new(&webhook_signing_secret, std::env::var("PULSE_WEBHOOK_SIGNING_SALT").unwrap_or_else(|_| "pulsegrid_webhook_salt".to_string()).as_bytes())),
        workspace_vaults: workspace_vaults.clone(),
        event_tx: event_tx.clone(),
        cache: cache.clone(),
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
        .route("/api/v1/workspaces/{workspace_id}/billing/subscription", get(get_workspace_subscription_status))
        .route("/api/v1/workspaces/{workspace_id}/billing/usage", get(get_workspace_usage))
        .route("/api/v1/workspaces/{workspace_id}/patterns", get(get_detected_patterns))
        // API Keys endpoints
        .route(
            "/api/v1/workspaces/{workspace_id}/api-keys",
            post(create_api_key).get(list_api_keys),
        )
        .route(
            "/api/v1/workspaces/{workspace_id}/api-keys/{key_id}",
            delete(revoke_api_key),
        )
        // Stripe webhook
        .route("/api/v1/stripe/webhook", post(stripe_webhook_handler))
        // Flow CRUD endpoints
        .route("/api/v1/flows", post(create_flow))
        .route("/api/v1/flows/{workspace_id}", get(list_flows))
        .route(
            "/api/v1/flow/{flow_id}",
            get(get_flow).put(update_flow).delete(delete_flow),
        )
        .route("/api/v1/flows/{flow_id}/versions", get(list_flow_versions))
        .route(
            "/api/v1/flows/{flow_id}/versions/{version_id}/diff",
            get(get_flow_version_diff),
        )
        .route(
            "/api/v1/flows/{flow_id}/rollback/{version_id}",
            post(rollback_flow_version),
        )
        .route(
            "/api/v1/flows/{flow_id}/deploy/{environment}",
            post(deploy_flow_to_environment),
        )
        .route(
            "/api/v1/flows/{flow_id}/promote",
            post(promote_flow_environment),
        )
        .route(
            "/api/v1/flows/{flow_id}/environments",
            get(get_flow_environment_statuses),
        )
        .route(
            "/api/v1/flows/{flow_id}/run/{environment}",
            post(run_flow_in_environment),
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
        .route(
            "/api/v1/credentials/{credential_id}/dependents",
            get(get_credential_dependents),
        )
        // Flow run endpoints
        .route("/api/v1/flow-runs/{workspace_id}", get(list_flow_runs))
        .route("/api/v1/flow-run/{run_id}", get(get_flow_run))
        .route("/api/v1/flows/{flow_id}/runs", get(get_flow_runs))
        .route("/api/v1/flows/{flow_id}/runs/{run_id}", get(get_flow_run_details))
        .route("/api/v1/flows/{flow_id}/runs/{run_id}/steps/{step_id}/replay", post(replay_flow_run_step))
        .route("/api/v1/flows/{flow_id}/stats", get(get_flow_stats))
        .route("/api/v1/replay/{workspace_id}", get(get_replay_events))
        // Approval endpoints
        .route("/api/v1/approvals/decision", post(approval_decision_handler))
        .route("/api/v1/approvals/{flow_run_id}/pending", get(get_pending_approvals))
        // WebSocket event stream
        .route("/events/stream", get(events_stream))
        .with_state(state.clone());

    // Run the server on port 8000 to avoid Tomcat conflict
    let addr = SocketAddr::from(([0, 0, 0, 0], 8000));
    println!("Listening on http://{}", addr);

    // Spawn our background worker for Redis Streams Event Bus
    let pool_clone = pool.clone();
    let vault_clone = state.vault.clone();
    let workspace_vaults_clone = workspace_vaults.clone();
    let event_tx_clone = event_tx.clone();
    let cache_clone = state.cache.clone();
    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("failed to build event listener runtime");
        rt.block_on(start_event_listener(pool_clone, vault_clone, workspace_vaults_clone, event_tx_clone, cache_clone));
    });

    // Start gRPC server
    let grpc_addr = "127.0.0.1:50051".parse().unwrap();
    let grpc_pool = pool.clone();
    let service = MyPulseCoreService::new(grpc_pool, workspace_vaults.clone());
    let guard_stream_service = GuardStreamService::new(guard_signal_tx.clone());
    println!("🚀 Starting gRPC server on {}", grpc_addr);
    tokio::spawn(async move {
        tonic::transport::Server::builder()
            .add_service(PulseCoreServiceServer::new(service))
            .add_service(GuardStreamServer::new(guard_stream_service))
            .serve(grpc_addr)
            .await
            .unwrap();
    });

    // Spawn background workers for cron/scheduled flows and generic polling triggers
    let cron_pool = pool.clone();
    let polling_pool = pool.clone();
    let approval_expiry_pool = pool.clone();
    let health_check_pool = pool.clone();
    let redis_url_clone = redis_url.clone();
    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("failed to build cron runtime");

        rt.block_on(async move {
            tokio::join!(
                start_schedule_worker(cron_pool, redis_url_clone.clone()),
                start_polling_worker(polling_pool, redis_url_clone.clone()),
                start_approval_expiry_worker(approval_expiry_pool),
                executor::start_connector_health_check_worker(health_check_pool)
            );
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

fn parse_stripe_signature_header(headers: &HeaderMap) -> Result<(String, String), String> {
    let signature_header = headers
        .get("Stripe-Signature")
        .or_else(|| headers.get("stripe-signature"))
        .ok_or_else(|| "Missing Stripe-Signature header".to_string())?;

    let signature_header = signature_header
        .to_str()
        .map_err(|_| "Invalid Stripe-Signature header".to_string())?;

    let mut timestamp: Option<String> = None;
    let mut signature: Option<String> = None;

    for part in signature_header.split(',') {
        let mut pieces = part.trim().splitn(2, '=');
        let key = pieces.next().unwrap_or_default().trim();
        let value = pieces.next().unwrap_or_default().trim();

        match key {
            "t" if !value.is_empty() => timestamp = Some(value.to_string()),
            "v1" if !value.is_empty() && signature.is_none() => signature = Some(value.to_string()),
            _ => {}
        }
    }

    match (timestamp, signature) {
        (Some(t), Some(sig)) => Ok((t, sig)),
        _ => Err("Missing t or v1 in Stripe-Signature header".to_string()),
    }
}

fn stripe_subscription_plan_tier(object: &serde_json::Value) -> String {
    object
        .get("plan")
        .and_then(|plan| plan.get("nickname"))
        .and_then(|value| value.as_str())
        .or_else(|| {
            object
                .get("price")
                .and_then(|price| price.get("nickname"))
                .and_then(|value| value.as_str())
        })
        .unwrap_or("free")
        .trim()
        .to_lowercase()
}

fn stripe_secret_key() -> Result<String, (axum::http::StatusCode, String)> {
    std::env::var("STRIPE_SECRET_KEY")
        .map_err(|_| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, "STRIPE_SECRET_KEY is not set".to_string()))
}

fn stripe_pro_price_id() -> Result<String, (axum::http::StatusCode, String)> {
    std::env::var("PRO_PRICE_ID")
        .map_err(|_| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, "PRO_PRICE_ID is not set".to_string()))
}

async fn stripe_create_customer(
    owner_email: &str,
    workspace_id: uuid::Uuid,
) -> Result<String, (axum::http::StatusCode, String)> {
    let secret_key = stripe_secret_key()?;
    let workspace_id_str = workspace_id.to_string();
    let client = reqwest::Client::new();

    let response = client
        .post("https://api.stripe.com/v1/customers")
        .bearer_auth(secret_key)
        .form(&[
            ("email", owner_email),
            ("metadata[workspace_id]", workspace_id_str.as_str()),
        ])
        .send()
        .await
        .map_err(|e| (axum::http::StatusCode::BAD_GATEWAY, e.to_string()))?;

    let status = response.status();
    let response_body = response
        .text()
        .await
        .map_err(|e| (axum::http::StatusCode::BAD_GATEWAY, e.to_string()))?;

    if !status.is_success() {
        return Err((
            axum::http::StatusCode::BAD_GATEWAY,
            format!("Stripe customer creation failed: {}", response_body),
        ));
    }

    let customer: StripeCustomerCreateResponse = serde_json::from_str(&response_body)
        .map_err(|e| (axum::http::StatusCode::BAD_GATEWAY, e.to_string()))?;

    Ok(customer.id)
}

async fn stripe_create_subscription(
    customer_id: &str,
    workspace_id: uuid::Uuid,
) -> Result<String, (axum::http::StatusCode, String)> {
    let secret_key = stripe_secret_key()?;
    let price_id = stripe_pro_price_id()?;
    let workspace_id_str = workspace_id.to_string();
    let client = reqwest::Client::new();

    let response = client
        .post("https://api.stripe.com/v1/subscriptions")
        .bearer_auth(secret_key)
        .form(&[
            ("customer", customer_id),
            ("items[0][price]", price_id.as_str()),
            ("metadata[workspace_id]", workspace_id_str.as_str()),
        ])
        .send()
        .await
        .map_err(|e| (axum::http::StatusCode::BAD_GATEWAY, e.to_string()))?;

    let status = response.status();
    let response_body = response
        .text()
        .await
        .map_err(|e| (axum::http::StatusCode::BAD_GATEWAY, e.to_string()))?;

    if !status.is_success() {
        return Err((
            axum::http::StatusCode::BAD_GATEWAY,
            format!("Stripe subscription creation failed: {}", response_body),
        ));
    }

    let subscription: StripeSubscriptionCreateResponse = serde_json::from_str(&response_body)
        .map_err(|e| (axum::http::StatusCode::BAD_GATEWAY, e.to_string()))?;

    Ok(subscription.id)
}

async fn resolve_workspace_id_for_subscription(
    state: &AppState,
    object: &serde_json::Value,
) -> Result<uuid::Uuid, (axum::http::StatusCode, String)> {
    if let Some(workspace_id) = object
        .get("metadata")
        .and_then(|metadata| metadata.get("workspace_id"))
        .and_then(|value| value.as_str())
    {
        return uuid::Uuid::parse_str(workspace_id)
            .map_err(|e| (axum::http::StatusCode::BAD_REQUEST, e.to_string()));
    }

    if let Some(customer_id) = object.get("customer").and_then(|value| value.as_str()) {
        if let Some(workspace_id) = sqlx::query_scalar::<_, uuid::Uuid>(
            r#"
            SELECT workspace_id
            FROM billing_subscriptions
            WHERE stripe_customer_id = $1
            ORDER BY created_at DESC
            LIMIT 1
            "#,
        )
        .bind(customer_id)
        .fetch_optional(&state.pool)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        {
            return Ok(workspace_id);
        }
    }

    if let Some(subscription_id) = object.get("id").and_then(|value| value.as_str()) {
        if let Some(workspace_id) = sqlx::query_scalar::<_, uuid::Uuid>(
            r#"
            SELECT workspace_id
            FROM billing_subscriptions
            WHERE stripe_subscription_id = $1
            ORDER BY created_at DESC
            LIMIT 1
            "#,
        )
        .bind(subscription_id)
        .fetch_optional(&state.pool)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        {
            return Ok(workspace_id);
        }
    }

    Err((
        axum::http::StatusCode::BAD_REQUEST,
        "Unable to resolve workspace_id for Stripe subscription event".to_string(),
    ))
}

#[derive(Debug, FromRow)]
struct UpgradeWorkspaceRow {
    id: uuid::Uuid,
    name: String,
    slug: String,
    plan: String,
    owner_user_id: uuid::Uuid,
    settings: Option<serde_json::Value>,
    created_at: Option<chrono::DateTime<chrono::Utc>>,
    stripe_customer_id: Option<String>,
    owner_email: String,
}

async fn publish_workspace_stream_event(
    workspace_id: uuid::Uuid,
    payload: serde_json::Value,
) -> Result<(), (axum::http::StatusCode, String)> {
    let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://localhost:6379/".to_string());
    let client = redis::Client::open(redis_url)
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let mut con = client
        .get_multiplexed_async_connection()
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let stream_key = workspace_stream_key(workspace_id);
    let payload_str = serde_json::to_string(&payload)
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    con.xadd::<_, _, _, _, ()>(&stream_key, "*", &[("payload", payload_str)])
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(())
}

async fn publish_step_io_event(
    workspace_id: uuid::Uuid,
    flow_run_id: uuid::Uuid,
    steps_log: &serde_json::Value,
    payload: serde_json::Value,
) -> Result<(), (axum::http::StatusCode, String)> {
    let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379/".to_string());
    let client = redis::Client::open(redis_url)
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let mut con = client
        .get_multiplexed_async_connection()
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let cache_key = format!("flow_run:{}:step_outputs", flow_run_id);
    let steps_json = serde_json::to_string(steps_log)
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let _: () = con
        .set_ex(&cache_key, steps_json, 60 * 60 * 24)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let stream_key = workspace_stream_key(workspace_id);
    let payload_str = serde_json::to_string(&payload)
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    con.xadd::<_, _, _, _, ()>(&stream_key, "*", &[("payload", payload_str)])
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    Ok(())
}

fn build_step_io_log_entry(
    step_id: &str,
    status: &str,
    duration_ms: i32,
    error: Option<String>,
    input: serde_json::Value,
    output: serde_json::Value,
    step_outputs_snapshot: serde_json::Value,
    trigger_event: &models::PulseEvent,
    flow_run_id: uuid::Uuid,
    flow_id: uuid::Uuid,
    group_index: usize,
) -> serde_json::Value {
    serde_json::json!({
        "step_id": step_id,
        "status": status,
        "duration_ms": duration_ms,
        "error": error,
        "input": input,
        "output": output,
        "step_outputs_snapshot": step_outputs_snapshot,
        "trigger_event": trigger_event,
        "flow_run_id": flow_run_id,
        "flow_id": flow_id,
        "group_index": group_index,
        "recorded_at": chrono::Utc::now().to_rfc3339(),
    })
}

async fn verify_stripe_webhook_signature(
    state: &AppState,
    headers: &HeaderMap,
    body: &Bytes,
) -> Result<String, (axum::http::StatusCode, String)> {
    let secret = std::env::var("STRIPE_WEBHOOK_SECRET")
        .map_err(|_| (axum::http::StatusCode::BAD_REQUEST, "STRIPE_WEBHOOK_SECRET is not set".to_string()))?;

    let (timestamp, provided_signature) = parse_stripe_signature_header(headers)
        .map_err(|message| (axum::http::StatusCode::BAD_REQUEST, message))?;

    let body_str = String::from_utf8(body.to_vec())
        .map_err(|e| (axum::http::StatusCode::BAD_REQUEST, e.to_string()))?;

    let signed_payload = format!("{}.{}", timestamp, body_str);
    let expected_signature = state
        .vault
        .hmac_sha256_hex(&signed_payload, &secret)
        .map_err(|_| (axum::http::StatusCode::BAD_REQUEST, "Failed to compute Stripe signature".to_string()))?;

    if expected_signature != provided_signature.to_lowercase() {
        return Err((axum::http::StatusCode::BAD_REQUEST, "Invalid Stripe webhook signature".to_string()));
    }

    Ok(body_str)
}

fn workspace_stream_key(workspace_id: uuid::Uuid) -> String {
    format!("stream:events:{}", workspace_id)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum FlowEnvironment {
    Production,
    Staging,
}

impl FlowEnvironment {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Production => "production",
            Self::Staging => "staging",
        }
    }

    fn parse(value: Option<&str>) -> Self {
        match value
            .map(|v| v.trim().to_ascii_lowercase())
            .as_deref()
        {
            Some("staging") => Self::Staging,
            _ => Self::Production,
        }
    }
}

fn workspace_stream_key_for_environment(workspace_id: uuid::Uuid, environment: FlowEnvironment) -> String {
    match environment {
        FlowEnvironment::Production => workspace_stream_key(workspace_id),
        FlowEnvironment::Staging => format!("stream:events:{}:staging", workspace_id),
    }
}

fn event_environment(event: &PulseEvent) -> FlowEnvironment {
    let from_data = event
        .data
        .get("environment")
        .and_then(|value| value.as_str());
    FlowEnvironment::parse(from_data)
}

fn clickhouse_db_for_environment(environment: FlowEnvironment) -> Option<String> {
    match environment {
        FlowEnvironment::Staging => std::env::var("CLICKHOUSE_DB_STAGING")
            .ok()
            .or_else(|| std::env::var("CLICKHOUSE_DB").ok()),
        FlowEnvironment::Production => std::env::var("CLICKHOUSE_DB").ok(),
    }
}

fn invalidate_workspace_flow_cache(cache: &Arc<LocalCache>, workspace_id: uuid::Uuid) {
    let prod_cache_key = format!("flows:{}:{}", workspace_id, FlowEnvironment::Production.as_str());
    let staging_cache_key = format!("flows:{}:{}", workspace_id, FlowEnvironment::Staging.as_str());
    let legacy_cache_key = format!("flows:{}", workspace_id);
    let _ = cache.delete(&prod_cache_key);
    let _ = cache.delete(&staging_cache_key);
    let _ = cache.delete(&legacy_cache_key);
}

async fn ensure_redis_consumer_group(
    con: &mut redis::aio::MultiplexedConnection,
    stream_key: &str,
    consumer_group: &str,
) {
    if let Err(e) = redis::cmd("XGROUP")
        .arg("CREATE")
        .arg(stream_key)
        .arg(consumer_group)
        .arg("$")
        .arg("MKSTREAM")
        .query_async::<()>(&mut *con)
        .await
    {
        let err = e.to_string();
        if !err.contains("BUSYGROUP") {
            eprintln!("Failed to create Redis consumer group for {}: {}", stream_key, err);
        }
    }
}

async fn enqueue_failure_email_notification(
    workspace_id: uuid::Uuid,
    flow_name: &str,
    error: &str,
    email: &str,
) {
    let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://localhost:6379/".to_string());
    if let Ok(client) = redis::Client::open(redis_url) {
        if let Ok(mut con) = client.get_multiplexed_async_connection().await {
            let payload = serde_json::json!({
                "workspace_id": workspace_id,
                "flow_name": flow_name,
                "error": error,
                "email": email,
            });
            let _ = con
                .lpush::<_, _, usize>("queue:email:failure", payload.to_string())
                .await;
        }
    }
}

/// Connects to Redis and indefinitely reads from the Real-Time Event Stream
async fn start_event_listener(
    pg_pool: sqlx::PgPool,
    vault: std::sync::Arc<core_vault::Vault>,
    workspace_vaults: Arc<WorkspaceVaultService>,
    event_tx: broadcast::Sender<String>,
    cache: Arc<LocalCache>,
) {
    const CONSUMER_GROUP: &str = "pulsegrid-workers";

    let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://localhost:6379/".to_string());
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

    let consumer_name = format!("consumer-{}", uuid::Uuid::new_v4());
    println!(
        "Using Redis consumer group '{}' with consumer '{}'",
        CONSUMER_GROUP, consumer_name
    );

    let opts = StreamReadOptions::default()
        .group(CONSUMER_GROUP, &consumer_name)
        .block(5000) // Block for 5 seconds waiting for events
        .count(10); // Read up to 10 events per batch

    let executor = Arc::new(
        FlowExecutor::new(pg_pool.clone(), vault.clone()).with_workspace_vaults(workspace_vaults),
    );
    let mut known_streams: HashSet<String> = HashSet::new();
    let mut event_counter = 0u64;
    
    // Workspace list caching: TTL of 30 seconds, with manual invalidation
    let mut workspace_cache: Option<(Vec<uuid::Uuid>, std::time::Instant)> = None;
    let workspace_cache_ttl = Duration::from_secs(30);

    loop {
        // Periodically clear expired cache entries (every 1000 events)
        event_counter += 1;
        if event_counter % 1000 == 0 {
            if let Err(e) = cache.clear() {
                eprintln!("⚠️ Failed to clear cache: {}", e);
            } else {
                println!("🧹 Cache cleared (event counter: {})", event_counter);
            }
        }
        
        // Use cached workspace list if available and not expired
        let workspace_ids = match &workspace_cache {
            Some((cached_ids, timestamp)) if timestamp.elapsed() < workspace_cache_ttl => {
                cached_ids.clone()
            }
            _ => {
                // Cache miss or expired - query database
                let ids = sqlx::query_scalar::<_, uuid::Uuid>("SELECT id FROM workspaces")
                    .fetch_all(&pg_pool)
                    .await
                    .unwrap_or_default();
                workspace_cache = Some((ids.clone(), std::time::Instant::now()));
                ids
            }
        };

        let mut stream_keys: Vec<String> = workspace_ids
            .into_iter()
            .flat_map(|workspace_id| {
                vec![
                    workspace_stream_key_for_environment(workspace_id, FlowEnvironment::Production),
                    workspace_stream_key_for_environment(workspace_id, FlowEnvironment::Staging),
                ]
            })
            .collect();
        stream_keys.sort();
        stream_keys.dedup();

        if stream_keys.is_empty() {
            tokio::time::sleep(Duration::from_secs(2)).await;
            continue;
        }

        for stream_key in &stream_keys {
            if known_streams.insert(stream_key.clone()) {
                ensure_redis_consumer_group(&mut con, stream_key, CONSUMER_GROUP).await;
            }
        }

        let stream_key_refs: Vec<&str> = stream_keys.iter().map(|s| s.as_str()).collect();
        let stream_ids = vec![">"; stream_key_refs.len()];

        // XREADGROUP for at-least-once delivery
        let result: Result<StreamReadReply, redis::RedisError> = con
            .xread_options(&stream_key_refs, &stream_ids, &opts)
            .await;

        match result {
            Ok(reply) => {
                for key in reply.keys {
                    let stream_environment = if key.key.ends_with(":staging") {
                        FlowEnvironment::Staging
                    } else {
                        FlowEnvironment::Production
                    };
                    for node in key.ids {
                        // Grab the actual event payload (we assume it's stored under a 'payload' field)
                        if let Some(redis::Value::BulkString(data)) = node.map.get("payload") {
                            let payload_str = String::from_utf8_lossy(data);

                            // Try parsing into our structural PulseEvent model
                            match serde_json::from_str::<PulseEvent>(&payload_str) {
                                Ok(event) => {
                                    let payload_environment = event_environment(&event);
                                    let execution_environment = if stream_environment == FlowEnvironment::Staging
                                        || payload_environment == FlowEnvironment::Staging
                                    {
                                        FlowEnvironment::Staging
                                    } else {
                                        FlowEnvironment::Production
                                    };

                                    println!("🔥 Received PulseEvent (ID: {})", node.id);
                                    let _ = event_tx.send(payload_str.to_string());

                                    // EVENT REPLAY: Store event in ring buffer (sorted set capped at 500)
                                    // Get current Unix timestamp in milliseconds
                                    let unix_ms = chrono::Utc::now().timestamp_millis();
                                    let ring_buffer_key = format!(
                                        "workspace:{}:events:{}",
                                        event.tenant_id,
                                        execution_environment.as_str()
                                    );
                                    
                                    // Add event to sorted set with timestamp as score
                                    let _: Result<(), _> = con.zadd(
                                        &ring_buffer_key,
                                        &payload_str.to_string(),
                                        unix_ms
                                    ).await;
                                    
                                    // Cap at 500 events: remove oldest events if count exceeds 500
                                    let _: Result<(), _> = con.zremrangebyrank(&ring_buffer_key, 0, -501).await;
                                    
                                    // BILLING: Increment event count
                                    let _ = increment_usage(&pg_pool, event.tenant_id, 1, 0).await;

                                    if event.event_type == "approval.response" {
                                        if let Err(error) = handle_approval_response_event(
                                            &pg_pool,
                                            &executor,
                                            &mut con,
                                            &event,
                                        )
                                        .await
                                        {
                                            eprintln!("Approval response handling failed: {}", error);
                                        }
                                        continue;
                                    }

                                    let (event_count, _) = get_monthly_usage(&pg_pool, event.tenant_id).await.unwrap_or((0, 0));
                                    if event_count % 100 == 0 && event_count > 0 {
                                        // Batch pattern detection: collect recent flow_runs + step logs and analyze
                                        let recent_rows = sqlx::query!(
                                            r#"
                                            SELECT fr.id, fr.flow_id, fr.started_at, fr.status, fr.steps_log, f.name AS flow_name
                                            FROM flow_runs fr
                                            LEFT JOIN flows f ON f.id = fr.flow_id
                                            WHERE fr.workspace_id = $1 AND fr.environment = $2
                                            ORDER BY fr.started_at DESC
                                            LIMIT 500
                                            "#,
                                            event.tenant_id as _,
                                            execution_environment.as_str(),
                                        )
                                        .fetch_all(&pg_pool)
                                        .await
                                        .unwrap_or_default();

                                        let mut entries: Vec<core_ai::pattern_detection::EventEntry> = Vec::new();

                                        for r in recent_rows.into_iter() {
                                            let started_at: chrono::DateTime<chrono::Utc> = r.started_at;
                                            let flow_name = if r.flow_name.is_empty() {
                                                r.flow_id
                                                    .map(|id| id.to_string())
                                                    .unwrap_or_else(|| "unknown".to_string())
                                            } else {
                                                r.flow_name
                                            };
                                            let status = r.status.clone();

                                            // Add a run-level event
                                            entries.push(core_ai::pattern_detection::EventEntry {
                                                event_type: format!("flow.{}.run.{}", flow_name, status),
                                                timestamp: started_at,
                                                connector: "flow".to_string(),
                                                action: Some(status.clone()),
                                            });

                                            // If steps_log exists, try to extract step-level events
                                            if let Some(steps_val) = r.steps_log {
                                                if let Some(arr) = steps_val.as_array() {
                                                    for step in arr.iter() {
                                                        let step_id = step.get("step_id").and_then(|v| v.as_str()).unwrap_or("unknown").to_string();
                                                        let step_status = step.get("status").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                                        entries.push(core_ai::pattern_detection::EventEntry {
                                                            event_type: format!("flow.{}.step.{}", flow_name, step_id),
                                                            timestamp: started_at,
                                                            connector: "step".to_string(),
                                                            action: Some(step_status),
                                                        });
                                                    }
                                                }
                                            }
                                        }

                                        // Call into PulseAI analyzer (synchronous, returns Result)
                                        match core_ai::pattern_detection::analyze_event_history(event.tenant_id, entries) {
                                            Ok(patterns) => {
                                                if patterns.is_empty() {
                                                    println!("Pattern detection: no patterns for workspace {}", event.tenant_id);
                                                } else {
                                                    // Persist patterns
                                                    let mut tx = match pg_pool.begin().await {
                                                        Ok(t) => t,
                                                        Err(e) => {
                                                            eprintln!("Failed to begin tx for pattern insert: {}", e);
                                                            continue;
                                                        }
                                                    };

                                                    let mut anomaly_events: Vec<(String, f32)> = Vec::new();

                                                    for p in patterns.into_iter() {
                                                        let db_id = uuid::Uuid::new_v4();
                                                        let pattern_type_str = match p.pattern_type {
                                                            core_ai::pattern_detection::PatternType::RepeatedAction => "repeated_action",
                                                            core_ai::pattern_detection::PatternType::EventCorrelation => "correlation",
                                                            core_ai::pattern_detection::PatternType::Anomaly => "anomaly",
                                                            core_ai::pattern_detection::PatternType::TimeBased => "time_based",
                                                        };

                                                        let _ = sqlx::query(
                                                            r#"
                                                            INSERT INTO ai_detected_patterns (
                                                                id, workspace_id, pattern_type, description, confidence, frequency,
                                                                events_involved, suggested_trigger, suggested_actions, suggested_flow, detected_at, updated_at
                                                            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
                                                            "#,
                                                        )
                                                        .bind(db_id)
                                                        .bind(event.tenant_id)
                                                        .bind(pattern_type_str)
                                                        .bind(&p.description)
                                                        .bind(p.confidence)
                                                        .bind(&p.frequency)
                                                        .bind(serde_json::json!(p.events_involved))
                                                        .bind(&p.suggested_trigger)
                                                        .bind(serde_json::json!(p.suggested_actions))
                                                        .bind(serde_json::json!(serde_json::Value::Null))
                                                        .bind(chrono::Utc::now())
                                                        .execute(&mut *tx)
                                                        .await;

                                                        // Queue anomaly alerts for realtime delivery after the DB transaction commits.
                                                        if matches!(p.pattern_type, core_ai::pattern_detection::PatternType::Anomaly) && p.confidence > 0.8 {
                                                            anomaly_events.push((p.description, p.confidence));
                                                        }
                                                    }

                                                    if let Err(e) = tx.commit().await {
                                                        eprintln!("Failed to commit pattern inserts: {}", e);
                                                    } else {
                                                        let workspace_stream = workspace_stream_key_for_environment(
                                                            event.tenant_id,
                                                            execution_environment,
                                                        );
                                                        for (description, confidence) in anomaly_events.into_iter() {
                                                            let anomaly_payload = serde_json::json!({
                                                                "event_type": "anomaly_detected",
                                                                "description": description,
                                                                "confidence": confidence,
                                                            });

                                                            let _ = con
                                                                .xadd::<_, _, _, _, ()>(
                                                                    &workspace_stream,
                                                                    "*",
                                                                    &[("payload", serde_json::to_string(&anomaly_payload).unwrap())],
                                                                )
                                                                .await;
                                                        }
                                                    }
                                                }
                                            }
                                            Err(err) => {
                                                eprintln!("Pattern detection failed for workspace {}: {}", event.tenant_id, err);
                                            }
                                        }
                                    }

                                    // Check cache for flow definitions first
                                    let cache_key = format!(
                                        "flows:{}:{}",
                                        event.tenant_id,
                                        execution_environment.as_str()
                                    );
                                    let active_flows = if let Some(cached) = cache.get::<Vec<(uuid::Uuid, String, serde_json::Value)>>(&cache_key) {
                                        println!("   📦 Using cached flows for workspace {}", event.tenant_id);
                                        cached
                                    } else {
                                        // Cache miss: fetch from database
                                        let flows = sqlx::query(
                                            r#"
                                            SELECT f.id, f.name, fe.definition
                                            FROM flows f
                                            JOIN flow_environments fe ON fe.flow_id = f.id
                                            WHERE f.workspace_id = $1
                                              AND fe.environment = $2
                                              AND fe.enabled = TRUE
                                            "#,
                                        )
                                        .bind(event.tenant_id)
                                        .bind(execution_environment.as_str())
                                        .fetch_all(&pg_pool)
                                        .await
                                        .unwrap_or_else(|_| vec![]);

                                        let result: Vec<_> = flows
                                            .iter()
                                            .map(|f| {
                                                (
                                                    f.get::<uuid::Uuid, _>("id"),
                                                    f.get::<String, _>("name"),
                                                    f.get::<serde_json::Value, _>("definition"),
                                                )
                                            })
                                            .collect();
                                        
                                        // Write to cache with TTL (5 minutes is handled by LocalCache)
                                        let _ = cache.set(&cache_key, result.clone());
                                        result
                                    };

                                    if active_flows.is_empty() {
                                        println!(
                                            "   ⚠️ No active flows found for workspace {}",
                                            event.tenant_id
                                        );
                                    }

                                    // Process each flow
                                    for (flow_id, flow_name, flow_definition) in active_flows {
                                        // Parse FlowDefinition
                                        let flow_def: FlowDefinition = match serde_json::from_value(
                                            flow_definition.clone(),
                                        ) {
                                            Ok(def) => def,
                                            Err(e) => {
                                                eprintln!(
                                                    "   ❌ Invalid flow definition for flow {}: {}",
                                                    flow_id, e
                                                );
                                                continue;
                                            }
                                        };

                                        // Check if trigger matches event
                                        if !executor.matches_trigger(&flow_def.trigger, &event) {
                                            println!(
                                                "   ⏭️  Flow {} trigger did not match event",
                                                flow_name
                                            );
                                            continue;
                                        }

                                        println!("   ⚡ Executing flow: {}", flow_name);

                                        let insert_result = sqlx::query!(
                                            r#"
                                            INSERT INTO flow_runs (workspace_id, flow_id, environment, status, trigger_event_id, started_at) 
                                            VALUES ($1, $2, $3, $4, $5, NOW())
                                            RETURNING id
                                            "#,
                                            event.tenant_id as _,
                                            flow_id as _,
                                            execution_environment.as_str(),
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

                                        let run_metrics = sqlx::query!(
                                            r#"SELECT started_at, COALESCE(duration_ms, 0) AS duration_ms FROM flow_runs WHERE id = $1"#,
                                            flow_run_id as _
                                        )
                                        .fetch_one(&pg_pool)
                                        .await
                                        .ok();

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
                                        let mut paused_for_approval = false;
                                        let should_dead_letter = flow_def
                                            .error_policy
                                            .on_failure
                                            .eq_ignore_ascii_case("dead_letter");

                                        for (group_index, group) in execution_order.iter().enumerate() {
                                            use std::future::Future;
                                            use std::pin::Pin;

                                            let mut futures_vec: Vec<Pin<Box<dyn Future<Output = (models::StepExecutionResult, serde_json::Value, serde_json::Value)> + '_>>> = Vec::new();

                                            for step_id in group {
                                                if let Some(step) =
                                                    flow_def.steps.iter().find(|s| &s.id == step_id)
                                                {
                                                    let step_clone = step.clone();
                                                    let executor_clone = Arc::clone(&executor);
                                                    let event_clone = event.clone();
                                                    let outputs_snapshot = step_outputs.clone();
                                                    let flow_def_clone = flow_def.clone();
                                                    let flow_name_clone = flow_name.clone();
                                                    let group_snapshot = execution_order.clone();
                                                    let flow_id_clone = flow_id;
                                                    let flow_run_id_clone = flow_run_id;
                                                    let fut = Box::pin(async move {
                                                        let step_outputs_snapshot = serde_json::to_value(&outputs_snapshot)
                                                            .unwrap_or_else(|_| serde_json::json!({}));
                                                        let step_input = executor_clone
                                                            .build_step_input(
                                                                &step_clone,
                                                                serde_json::json!({}),
                                                                &outputs_snapshot,
                                                                &event_clone,
                                                            )
                                                            .await;

                                                        if step_clone.r#type == "wait_for_approval" {
                                                            let context_json = serde_json::json!({
                                                                "workspace_id": event_clone.tenant_id,
                                                                "flow_id": flow_id_clone,
                                                                "flow_run_id": flow_run_id_clone,
                                                                "flow_name": flow_name_clone,
                                                                "step_id": step_clone.id,
                                                                "step_name": step_clone.id,
                                                                "message": format!("Approval required for step {}", step_clone.id),
                                                                "step_outputs": serde_json::to_value(&outputs_snapshot).unwrap_or_else(|_| serde_json::json!({})),
                                                                "execution_order": group_snapshot,
                                                                "current_group_index": group_index,
                                                                "flow_definition": flow_def_clone,
                                                                "trigger_event": event_clone,
                                                            });
                                                            let timeout_hours = step_clone
                                                                .approval_config
                                                                .as_ref()
                                                                .map(|cfg| cfg.timeout_hours)
                                                                .unwrap_or(24)
                                                                .max(1) as i64;
                                                            let expires_at = chrono::Utc::now()
                                                                + chrono::Duration::hours(timeout_hours);
                                                            match executor_clone
                                                                .create_pending_approval(flow_run_id_clone, &step_clone, context_json, expires_at)
                                                                .await
                                                            {
                                                                Ok(token) => (
                                                                    models::StepExecutionResult {
                                                                        step_id: step_clone.id.clone(),
                                                                        status: "waiting".to_string(),
                                                                        output: serde_json::json!({"approval_token": token}),
                                                                        error: None,
                                                                        duration_ms: 0,
                                                                    },
                                                                    step_input,
                                                                    step_outputs_snapshot,
                                                                ),
                                                                Err(error) => (
                                                                    models::StepExecutionResult {
                                                                        step_id: step_clone.id.clone(),
                                                                        status: "failed".to_string(),
                                                                        output: serde_json::Value::Null,
                                                                        error: Some(error),
                                                                        duration_ms: 0,
                                                                    },
                                                                    step_input,
                                                                    step_outputs_snapshot,
                                                                ),
                                                            }
                                                        } else {
                                                            (
                                                                execute_step_with_retry(
                                                                executor_clone,
                                                                &step_clone,
                                                                    step_input.clone(),
                                                                &outputs_snapshot,
                                                                &event_clone,
                                                                )
                                                                .await,
                                                                step_input,
                                                                step_outputs_snapshot,
                                                            )
                                                        }
                                                    });

                                                    futures_vec.push(fut);
                                                }
                                            }

                                            let results = join_all(futures_vec).await;

                                            for (result, step_input, step_outputs_snapshot) in results {
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
                                                            "flow_id": flow_id,
                                                            "flow_name": flow_name,
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
                                                } else if result.status == "waiting" {
                                                    println!(
                                                        "      ⏸️  Step {} waiting for approval",
                                                        result.step_id
                                                    );
                                                    paused_for_approval = true;
                                                    all_steps_succeeded = false;
                                                }

                                                step_outputs.insert(
                                                    result.step_id.clone(),
                                                    result.output.clone(),
                                                );

                                                let log_entry = build_step_io_log_entry(
                                                    &result.step_id,
                                                    &result.status,
                                                    result.duration_ms,
                                                    result.error.clone(),
                                                    step_input.clone(),
                                                    result.output.clone(),
                                                    step_outputs_snapshot.clone(),
                                                    &event,
                                                    flow_run_id,
                                                    flow_id,
                                                    group_index,
                                                );
                                                steps_log.as_array_mut().unwrap().push(log_entry.clone());

                                                let _ = sqlx::query(
                                                    r#"UPDATE flow_runs SET steps_log = $1 WHERE id = $2"#,
                                                )
                                                .bind(steps_log.clone())
                                                .bind(flow_run_id)
                                                .execute(&pg_pool)
                                                .await;

                                                let step_stream_payload = serde_json::json!({
                                                    "event_type": "flow_run_step_io",
                                                    "tenant_id": event.tenant_id,
                                                    "flow_id": flow_id,
                                                    "flow_run_id": flow_run_id,
                                                    "step_id": result.step_id,
                                                    "status": result.status,
                                                    "duration_ms": result.duration_ms,
                                                    "error": result.error,
                                                    "input": step_input,
                                                    "output": log_entry.get("output").cloned().unwrap_or(serde_json::Value::Null),
                                                    "step_outputs_snapshot": step_outputs_snapshot,
                                                    "trigger_event": event,
                                                });
                                                let _ = publish_step_io_event(
                                                    event.tenant_id,
                                                    flow_run_id,
                                                    &steps_log,
                                                    step_stream_payload,
                                                ).await;
                                            }

                                            if paused_for_approval {
                                                break;
                                            }
                                        }

                                        if paused_for_approval {
                                            let _ = sqlx::query!(
                                                r#"UPDATE flow_runs SET status = 'pending_approval', steps_log = $1 WHERE id = $2"#,
                                                steps_log,
                                                flow_run_id as _
                                            ).execute(&pg_pool).await;
                                            continue;
                                        }

                                        // Update flow run status
                                        let final_status = if all_steps_succeeded {
                                            "success"
                                        } else {
                                            "failed"
                                        };
                                        let _ = sqlx::query!(
                                            r#"UPDATE flow_runs SET status = $1, completed_at = NOW(), duration_ms = (EXTRACT(EPOCH FROM NOW() - started_at) * 1000)::INT, steps_log = $2 WHERE id = $3"#,
                                            final_status,
                                            steps_log,
                                            flow_run_id as _
                                        ).execute(&pg_pool).await;

                                        // Non-blocking ClickHouse insert for flow_run_metrics
                                        let clickhouse_url = std::env::var("CLICKHOUSE_URL").ok();
                                        let clickhouse_user = std::env::var("CLICKHOUSE_USER").ok();
                                        let clickhouse_password = std::env::var("CLICKHOUSE_PASSWORD").ok();
                                        let clickhouse_db = clickhouse_db_for_environment(execution_environment);

                                        if clickhouse_url.is_some() {
                                            let run_id = flow_run_id;
                                            let tenant_id = event.tenant_id;
                                            let fid = flow_id;
                                            let started_at = run_metrics.as_ref().map(|row| row.started_at).unwrap_or_else(chrono::Utc::now);
                                            let duration_ms = run_metrics
                                                .as_ref()
                                                .and_then(|row| row.duration_ms)
                                                .unwrap_or(0)
                                                .max(0) as u32;
                                            let status_str = final_status.to_string();
                                            let step_count = steps_log.as_array().map(|a| a.len()).unwrap_or(0) as u8;
                                            let failures = steps_log.as_array().map(|a| {
                                                a.iter().filter(|s| s.get("status").and_then(|st| st.as_str()) == Some("failed")).count()
                                            }).unwrap_or(0) as u8;

                                            tokio::spawn(async move {
                                                if let (Some(url), Some(user), Some(password), Some(db)) = 
                                                    (clickhouse_url, clickhouse_user, clickhouse_password, clickhouse_db) {
                                                    let insert_query = format!(
                                                        "INSERT INTO {}.flow_run_metrics (run_id, tenant_id, flow_id, started_at, duration_ms, status, steps_count, failures_count) FORMAT JSONEachRow",
                                                        db
                                                    );
                                                    
                                                    let json_payload = serde_json::json!({
                                                        "run_id": run_id,
                                                        "tenant_id": tenant_id,
                                                        "flow_id": fid,
                                                        "started_at": started_at,
                                                        "duration_ms": duration_ms,
                                                        "status": status_str,
                                                        "steps_count": step_count,
                                                        "failures_count": failures
                                                    });

                                                    let client = reqwest::Client::new();
                                                    let _ = client
                                                        .post(format!("{}/?query={}", url, urlencoding::encode(&insert_query)))
                                                        .basic_auth(&user, Some(&password))
                                                        .json(&json_payload)
                                                        .send()
                                                        .await;
                                                }
                                            });
                                        }

                                        // Push run-completion event for realtime dashboard updates
                                        let workspace_stream = workspace_stream_key_for_environment(
                                            event.tenant_id,
                                            execution_environment,
                                        );
                                        let completion_payload = serde_json::json!({
                                            "event_type": "flow_run_completed",
                                            "tenant_id": event.tenant_id,
                                            "flow_id": flow_id,
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
                                            flow_id as _
                                        ).execute(&pg_pool).await;

                                        if final_status == "failed"
                                            && flow_def
                                                .error_policy
                                                .on_failure
                                                .eq_ignore_ascii_case("notify_owner")
                                        {
                                            let failure_error = steps_log
                                                .as_array()
                                                .and_then(|steps| {
                                                    steps.iter().rev().find_map(|step| {
                                                        step.get("error")
                                                            .and_then(|e| e.as_str())
                                                            .map(|s| s.to_string())
                                                    })
                                                })
                                                .unwrap_or_else(|| "flow execution failed".to_string());

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
                                                enqueue_failure_email_notification(
                                                    event.tenant_id,
                                                    &flow_name,
                                                    &failure_error,
                                                    &email,
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
                                        .arg(&key.key)
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

async fn handle_approval_response_event(
    pg_pool: &sqlx::PgPool,
    executor: &Arc<FlowExecutor>,
    con: &mut redis::aio::MultiplexedConnection,
    event: &models::PulseEvent,
) -> Result<(), String> {
    let approval_token = event
        .data
        .get("approval_token")
        .or_else(|| event.data.get("token"))
        .and_then(|value| value.as_str())
        .ok_or_else(|| "approval response missing approval_token".to_string())?;

    let decision = event
        .data
        .get("decision")
        .and_then(|value| value.as_str())
        .unwrap_or("approved");

    let approval_row = sqlx::query(
        r#"
        SELECT
            pa.flow_run_id,
            pa.step_id,
            pa.context_json,
            pa.status,
            fr.workspace_id,
            fr.flow_id,
            COALESCE(f.name, pa.context_json->>'flow_name', 'Unknown flow') AS flow_name
        FROM pending_approvals pa
        JOIN flow_runs fr ON fr.id = pa.flow_run_id
        LEFT JOIN flows f ON f.id = fr.flow_id
        WHERE pa.approval_token = $1
        LIMIT 1
        "#,
    )
    .bind(approval_token)
    .fetch_optional(pg_pool)
    .await
    .map_err(|error| error.to_string())?;

    let Some(row) = approval_row else {
        return Ok(());
    };

    let status: String = row.try_get("status").map_err(|error| error.to_string())?;
    if status != "pending" {
        return Ok(());
    }

    let flow_run_id: uuid::Uuid = row.try_get("flow_run_id").map_err(|error| error.to_string())?;
    let step_id: String = row.try_get("step_id").map_err(|error| error.to_string())?;
    let workspace_id: uuid::Uuid = row.try_get("workspace_id").map_err(|error| error.to_string())?;
    let flow_id: uuid::Uuid = row.try_get("flow_id").map_err(|error| error.to_string())?;
    let flow_name: String = row.try_get("flow_name").map_err(|error| error.to_string())?;
    let context_json: serde_json::Value = row.try_get("context_json").map_err(|error| error.to_string())?;

    if decision.eq_ignore_ascii_case("rejected") {
        sqlx::query(
            r#"
            UPDATE pending_approvals
            SET status = 'rejected', updated_at = NOW()
            WHERE approval_token = $1
            "#,
        )
        .bind(approval_token)
        .execute(pg_pool)
        .await
        .map_err(|error| error.to_string())?;

        sqlx::query(
            r#"
            UPDATE flow_runs
            SET status = 'failed', completed_at = NOW(), error_message = 'Approval rejected'
            WHERE id = $1
            "#,
        )
        .bind(flow_run_id)
        .execute(pg_pool)
        .await
        .map_err(|error| error.to_string())?;

        let completion_payload = serde_json::json!({
            "event_type": "flow_run_completed",
            "tenant_id": workspace_id,
            "flow_id": flow_id,
            "status": "failed",
            "run_id": flow_run_id,
            "completed_at": chrono::Utc::now().to_rfc3339(),
            "error_message": "Approval rejected",
            "flow_name": flow_name,
        });
        let workspace_stream = workspace_stream_key(workspace_id);
        let _ = con
            .xadd::<_, _, _, _, ()>(
                &workspace_stream,
                "*",
                &[("payload", serde_json::to_string(&completion_payload).unwrap_or_else(|_| "{}".to_string()))],
            )
            .await;

        return Ok(());
    }

    sqlx::query(
        r#"
        UPDATE pending_approvals
        SET status = 'approved', updated_at = NOW()
        WHERE approval_token = $1
        "#,
    )
    .bind(approval_token)
    .execute(pg_pool)
    .await
    .map_err(|error| error.to_string())?;

    let flow_definition_value = context_json
        .get("flow_definition")
        .cloned()
        .ok_or_else(|| "approval context missing flow_definition".to_string())?;
    let flow_def: FlowDefinition = serde_json::from_value(flow_definition_value)
        .map_err(|error| error.to_string())?;

    let execution_order: Vec<Vec<String>> = context_json
        .get("execution_order")
        .cloned()
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_else(|| executor.resolve_execution_order(&flow_def.steps).unwrap_or_default());

    let step_outputs: std::collections::HashMap<String, serde_json::Value> = context_json
        .get("step_outputs")
        .cloned()
        .and_then(|value| serde_json::from_value(value).ok())
        .unwrap_or_default();

    let mut step_outputs = step_outputs;
    step_outputs.insert(
        step_id.clone(),
        serde_json::json!({
            "status": "approved",
            "decision": decision,
            "approval_token": approval_token,
            "approved_at": chrono::Utc::now().to_rfc3339(),
        }),
    );

    let start_group_index = context_json
        .get("current_group_index")
        .and_then(|value| value.as_u64())
        .map(|index| index as usize + 1)
        .unwrap_or(0);

    resume_flow_after_approval(
        pg_pool,
        executor,
        con,
        flow_run_id,
        workspace_id,
        flow_id,
        flow_name,
        flow_def,
        execution_order,
        step_outputs,
        start_group_index,
        context_json,
    )
    .await
}

async fn resume_flow_after_approval(
    pg_pool: &sqlx::PgPool,
    executor: &Arc<FlowExecutor>,
    con: &mut redis::aio::MultiplexedConnection,
    flow_run_id: uuid::Uuid,
    workspace_id: uuid::Uuid,
    flow_id: uuid::Uuid,
    flow_name: String,
    flow_def: FlowDefinition,
    execution_order: Vec<Vec<String>>,
    mut step_outputs: std::collections::HashMap<String, serde_json::Value>,
    start_group_index: usize,
    trigger_event: serde_json::Value,
) -> Result<(), String> {
    let event: models::PulseEvent = serde_json::from_value(trigger_event)
        .map_err(|error| error.to_string())?;
    let mut all_steps_succeeded = true;
    let mut steps_log = serde_json::json!([]);
    let mut paused_for_approval = false;
    let should_dead_letter = flow_def
        .error_policy
        .on_failure
        .eq_ignore_ascii_case("dead_letter");

    for (group_index, group) in execution_order.iter().enumerate().skip(start_group_index) {
        use std::future::Future;
        use std::pin::Pin;

        let mut futures_vec: Vec<Pin<Box<dyn Future<Output = (models::StepExecutionResult, serde_json::Value, serde_json::Value)> + '_>>> = Vec::new();

        for step_id in group {
            if let Some(step) = flow_def.steps.iter().find(|candidate| &candidate.id == step_id) {
                let step_clone = step.clone();
                let executor_clone = Arc::clone(executor);
                let event_clone = event.clone();
                let outputs_snapshot = step_outputs.clone();
                let flow_def_clone = flow_def.clone();
                let flow_name_clone = flow_name.clone();
                let group_snapshot = execution_order.clone();
                let flow_id_clone = flow_id;
                let flow_run_id_clone = flow_run_id;

                let fut = Box::pin(async move {
                    let step_outputs_snapshot = serde_json::to_value(&outputs_snapshot)
                        .unwrap_or_else(|_| serde_json::json!({}));
                    let step_input = executor_clone
                        .build_step_input(
                            &step_clone,
                            serde_json::json!({}),
                            &outputs_snapshot,
                            &event_clone,
                        )
                        .await;

                    if step_clone.r#type == "wait_for_approval" {
                        let context_json = serde_json::json!({
                            "workspace_id": event_clone.tenant_id,
                            "flow_id": flow_id_clone,
                            "flow_run_id": flow_run_id_clone,
                            "flow_name": flow_name_clone,
                            "step_id": step_clone.id,
                            "step_name": step_clone.id,
                            "message": format!("Approval required for step {}", step_clone.id),
                            "step_outputs": serde_json::to_value(&outputs_snapshot).unwrap_or_else(|_| serde_json::json!({})),
                            "execution_order": group_snapshot,
                            "current_group_index": group_index,
                            "flow_definition": flow_def_clone,
                            "trigger_event": event_clone,
                        });
                        let timeout_hours = step_clone
                            .approval_config
                            .as_ref()
                            .map(|cfg| cfg.timeout_hours)
                            .unwrap_or(24)
                            .max(1) as i64;
                        let expires_at = chrono::Utc::now()
                            + chrono::Duration::hours(timeout_hours);

                        match executor_clone
                            .create_pending_approval(flow_run_id_clone, &step_clone, context_json, expires_at)
                            .await
                        {
                            Ok(token) => (
                                models::StepExecutionResult {
                                    step_id: step_clone.id.clone(),
                                    status: "waiting".to_string(),
                                    output: serde_json::json!({"approval_token": token}),
                                    error: None,
                                    duration_ms: 0,
                                },
                                step_input,
                                step_outputs_snapshot,
                            ),
                            Err(error) => (
                                models::StepExecutionResult {
                                    step_id: step_clone.id.clone(),
                                    status: "failed".to_string(),
                                    output: serde_json::Value::Null,
                                    error: Some(error),
                                    duration_ms: 0,
                                },
                                step_input,
                                step_outputs_snapshot,
                            ),
                        }
                    } else {
                        (
                            execute_step_with_retry(
                                executor_clone,
                                &step_clone,
                                step_input.clone(),
                                &outputs_snapshot,
                                &event_clone,
                            )
                            .await,
                            step_input,
                            step_outputs_snapshot,
                        )
                    }
                });

                futures_vec.push(fut);
            }
        }

        let results = join_all(futures_vec).await;

        for (result, step_input, step_outputs_snapshot) in results {
            if result.status == "failed" {
                all_steps_succeeded = false;

                if should_dead_letter {
                    let dlq_key = format!("dlq:failed:{}", workspace_id);
                    let dlq_payload = serde_json::json!({
                        "workspace_id": workspace_id,
                        "flow_id": flow_id,
                        "flow_name": flow_name,
                        "trigger_event_id": event.id,
                        "step_id": result.step_id,
                        "error": result.error,
                        "failed_at": chrono::Utc::now().to_rfc3339(),
                    });
                    let _ = con
                        .rpush::<_, _, usize>(dlq_key, dlq_payload.to_string())
                        .await;
                }
            } else if result.status == "waiting" {
                paused_for_approval = true;
                all_steps_succeeded = false;
            }

            step_outputs.insert(result.step_id.clone(), result.output.clone());

            let log_entry = build_step_io_log_entry(
                &result.step_id,
                &result.status,
                result.duration_ms,
                result.error.clone(),
                step_input.clone(),
                result.output.clone(),
                step_outputs_snapshot.clone(),
                &event,
                flow_run_id,
                flow_id,
                group_index,
            );
            steps_log.as_array_mut().unwrap().push(log_entry.clone());

            let _ = sqlx::query(
                r#"UPDATE flow_runs SET steps_log = $1 WHERE id = $2"#,
            )
            .bind(steps_log.clone())
            .bind(flow_run_id)
            .execute(pg_pool)
            .await;

            let step_stream_payload = serde_json::json!({
                "event_type": "flow_run_step_io",
                "tenant_id": workspace_id,
                "flow_id": flow_id,
                "flow_run_id": flow_run_id,
                "step_id": result.step_id,
                "status": result.status,
                "duration_ms": result.duration_ms,
                "error": result.error,
                "input": step_input,
                "output": log_entry.get("output").cloned().unwrap_or(serde_json::Value::Null),
                "step_outputs_snapshot": step_outputs_snapshot,
                "trigger_event": event,
            });
            let _ = publish_step_io_event(
                workspace_id,
                flow_run_id,
                &steps_log,
                step_stream_payload,
            ).await;
        }

        if paused_for_approval {
            break;
        }
    }

    if paused_for_approval {
        let _ = sqlx::query(
            r#"UPDATE flow_runs SET status = 'pending_approval', steps_log = $1 WHERE id = $2"#,
        )
        .bind(steps_log)
        .bind(flow_run_id)
        .execute(pg_pool)
        .await;
        return Ok(());
    }

    let final_status = if all_steps_succeeded { "success" } else { "failed" };
    let _ = sqlx::query(
        r#"UPDATE flow_runs SET status = $1, completed_at = NOW(), duration_ms = (EXTRACT(EPOCH FROM NOW() - started_at) * 1000)::INT, steps_log = $2 WHERE id = $3"#,
    )
    .bind(final_status)
    .bind(steps_log)
    .bind(flow_run_id)
    .execute(pg_pool)
    .await;

    let completion_payload = serde_json::json!({
        "event_type": "flow_run_completed",
        "tenant_id": workspace_id,
        "flow_id": flow_id,
        "status": final_status,
        "run_id": flow_run_id,
        "completed_at": chrono::Utc::now().to_rfc3339(),
        "flow_name": flow_name,
    });
    let workspace_stream = workspace_stream_key(workspace_id);
    let _ = con
        .xadd::<_, _, _, _, ()>(
            &workspace_stream,
            "*",
            &[("payload", serde_json::to_string(&completion_payload).unwrap_or_else(|_| "{}".to_string()))],
        )
        .await;

    Ok(())
}

#[derive(Debug, Deserialize)]
struct FlowRunsQuery {
    environment: Option<String>,
}

#[derive(Debug, Deserialize)]
struct FlowDiffQuery {
    target_version_id: Option<uuid::Uuid>,
}

fn step_map(definition: &serde_json::Value) -> std::collections::HashMap<String, serde_json::Value> {
    definition
        .get("steps")
        .and_then(|steps| steps.as_array())
        .map(|steps| {
            steps
                .iter()
                .filter_map(|step| {
                    let id = step.get("id").and_then(|value| value.as_str())?;
                    Some((id.to_string(), step.clone()))
                })
                .collect::<std::collections::HashMap<_, _>>()
        })
        .unwrap_or_default()
}

fn build_flow_version_diff(from_definition: &serde_json::Value, to_definition: &serde_json::Value) -> FlowVersionDiff {
    let from_steps = step_map(from_definition);
    let to_steps = step_map(to_definition);

    let from_ids = from_steps
        .keys()
        .cloned()
        .collect::<std::collections::HashSet<_>>();
    let to_ids = to_steps
        .keys()
        .cloned()
        .collect::<std::collections::HashSet<_>>();

    let mut added_nodes: Vec<String> = to_ids
        .difference(&from_ids)
        .cloned()
        .collect();
    let mut removed_nodes: Vec<String> = from_ids
        .difference(&to_ids)
        .cloned()
        .collect();
    let mut changed_nodes: Vec<String> = from_ids
        .intersection(&to_ids)
        .filter_map(|id| {
            let from_step = from_steps.get(id)?;
            let to_step = to_steps.get(id)?;
            if from_step != to_step {
                Some(id.clone())
            } else {
                None
            }
        })
        .collect();

    added_nodes.sort();
    removed_nodes.sort();
    changed_nodes.sort();

    FlowVersionDiff {
        added_nodes,
        removed_nodes,
        changed_nodes,
    }
}

async fn create_flow(
    State(state): State<AppState>,
    Json(payload): Json<CreateFlowRequest>,
) -> Result<Json<FlowResponse>, (axum::http::StatusCode, String)> {
    // BILLING: Enforce flow creation limit per plan
    enforce_flow_limit(&state.pool, payload.workspace_id).await?;

    let mut tx = state
        .pool
        .begin()
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let row = sqlx::query!(
        r#"
        INSERT INTO flows (workspace_id, name, description, definition, enabled, run_count, created_by)
        VALUES ($1, $2, $3, $4, true, 0, $5)
        RETURNING id, workspace_id, name, description, definition, enabled, run_count
        "#,
        payload.workspace_id,
        payload.name,
        payload.description,
        payload.definition,
        payload.created_by,
    )
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    sqlx::query(
        r#"
        INSERT INTO flow_versions (flow_id, definition, created_by, note)
        VALUES ($1, $2, $3, $4)
        "#,
    )
    .bind(row.id)
    .bind(row.definition.clone())
    .bind(payload.created_by)
    .bind(Some("Initial flow version".to_string()))
    .execute(&mut *tx)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    sqlx::query(
        r#"
        INSERT INTO flow_environments (flow_id, environment, definition, enabled, deployed_by)
        VALUES ($1, 'production', $2, $3, $4)
        ON CONFLICT (flow_id, environment)
        DO UPDATE SET definition = EXCLUDED.definition, enabled = EXCLUDED.enabled, deployed_by = EXCLUDED.deployed_by, deployed_at = NOW(), updated_at = NOW()
        "#,
    )
    .bind(row.id)
    .bind(row.definition.clone())
    .bind(row.enabled.unwrap_or(true))
    .bind(payload.created_by)
    .execute(&mut *tx)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    sqlx::query(
        r#"
        INSERT INTO flow_environments (flow_id, environment, definition, enabled, deployed_by)
        VALUES ($1, 'staging', $2, FALSE, $3)
        ON CONFLICT (flow_id, environment)
        DO NOTHING
        "#,
    )
    .bind(row.id)
    .bind(row.definition.clone())
    .bind(payload.created_by)
    .execute(&mut *tx)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    tx.commit()
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

    state
        .workspace_vaults
        .bootstrap_workspace(row.id, Some(payload.owner_user_id))
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, format!("Failed to bootstrap workspace key: {e:?}")))?;

    let _ = sqlx::query!(
        r#"
        INSERT INTO workspace_members (workspace_id, user_id, role)
        VALUES ($1, $2, 'owner')
        ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role
        "#,
        row.id,
        payload.owner_user_id
    )
    .execute(&state.pool)
    .await;

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
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    let plan = payload.plan.trim().to_lowercase();
    if plan.is_empty() {
        return Err((axum::http::StatusCode::BAD_REQUEST, "Plan is required".into()));
    }

    let workspace = sqlx::query_as::<_, UpgradeWorkspaceRow>(
        r#"
        SELECT
            w.id,
            w.name,
            w.slug,
            w.plan,
            w.owner_user_id,
            w.settings,
            w.created_at,
            w.stripe_customer_id,
            u.email AS owner_email
        FROM workspaces w
        JOIN users u ON u.id = w.owner_user_id
        WHERE w.id = $1
        "#,
    )
    .bind(workspace_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or((axum::http::StatusCode::NOT_FOUND, "Workspace not found".to_string()))?;

    let stripe_customer_id = match workspace.stripe_customer_id.clone() {
        Some(customer_id) => customer_id,
        None => {
            let created_customer_id = stripe_create_customer(&workspace.owner_email, workspace.id).await?;
            let mut tx = state.pool.begin().await
                .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            sqlx::query(
                "UPDATE workspaces SET stripe_customer_id = $1 WHERE id = $2",
            )
            .bind(&created_customer_id)
            .bind(workspace.id)
            .execute(&mut *tx)
            .await
            .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            tx.commit().await
                .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            created_customer_id
        }
    };

    let stripe_subscription_id = stripe_create_subscription(&stripe_customer_id, workspace.id).await?;

    let mut tx = state.pool.begin().await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    sqlx::query(
        r#"
        INSERT INTO billing_subscriptions (
            workspace_id,
            stripe_customer_id,
            stripe_subscription_id,
            plan_tier,
            status,
            updated_at
        )
        VALUES ($1, $2, $3, $4, 'pending', NOW())
        ON CONFLICT (workspace_id)
        DO UPDATE SET
            stripe_customer_id = EXCLUDED.stripe_customer_id,
            stripe_subscription_id = EXCLUDED.stripe_subscription_id,
            plan_tier = EXCLUDED.plan_tier,
            status = 'pending',
            updated_at = NOW()
        "#,
    )
    .bind(workspace.id)
    .bind(&stripe_customer_id)
    .bind(&stripe_subscription_id)
    .bind(&plan)
    .execute(&mut *tx)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    tx.commit().await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Wait briefly for Stripe webhook to confirm activation so clients don't receive stale plan state.
    let mut confirmed_status = "pending".to_string();
    let mut confirmed_plan = workspace.plan.clone();
    for _ in 0..10 {
        let row = sqlx::query(
            r#"
            SELECT status, plan_tier
            FROM billing_subscriptions
            WHERE workspace_id = $1
            "#,
        )
        .bind(workspace.id)
        .fetch_optional(&state.pool)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        if let Some(row) = row {
            let status: String = row.try_get("status").unwrap_or_else(|_| "pending".to_string());
            let plan_tier: String = row.try_get("plan_tier").unwrap_or_else(|_| workspace.plan.clone());
            confirmed_status = status.clone();
            confirmed_plan = plan_tier;
            if status.eq_ignore_ascii_case("active") {
                break;
            }
        }

        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    }

    Ok(Json(serde_json::json!({
        "workspace": {
            "id": workspace.id,
            "name": workspace.name,
            "slug": workspace.slug,
            "plan": workspace.plan,
            "owner_user_id": workspace.owner_user_id,
            "settings": workspace.settings.unwrap_or_else(|| serde_json::json!({})),
            "created_at": workspace.created_at,
        },
        "billing": {
            "requested_plan": plan,
            "status": confirmed_status,
            "confirmed_plan": confirmed_plan,
            "stripe_customer_id": stripe_customer_id,
            "stripe_subscription_id": stripe_subscription_id,
        }
    })))
}

async fn get_workspace_subscription_status(
    State(state): State<AppState>,
    Path(workspace_id): Path<uuid::Uuid>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    let workspace = sqlx::query(
        r#"
        SELECT id, name, slug, plan, owner_user_id, settings, created_at
        FROM workspaces
        WHERE id = $1
        "#,
    )
    .bind(workspace_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or((axum::http::StatusCode::NOT_FOUND, "Workspace not found".to_string()))?;

    let billing = sqlx::query(
        r#"
        SELECT plan_tier, status, stripe_customer_id, stripe_subscription_id, updated_at
        FROM billing_subscriptions
        WHERE workspace_id = $1
        "#,
    )
    .bind(workspace_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let billing_json = if let Some(row) = billing {
        serde_json::json!({
            "requested_plan": row.try_get::<String, _>("plan_tier").unwrap_or_else(|_| "free".to_string()),
            "status": row.try_get::<String, _>("status").unwrap_or_else(|_| "unknown".to_string()),
            "stripe_customer_id": row.try_get::<Option<String>, _>("stripe_customer_id").ok().flatten(),
            "stripe_subscription_id": row.try_get::<Option<String>, _>("stripe_subscription_id").ok().flatten(),
            "updated_at": row
                .try_get::<Option<chrono::DateTime<chrono::Utc>>, _>("updated_at")
                .ok()
                .flatten()
                .map(|v| v.to_rfc3339()),
        })
    } else {
        serde_json::json!({
            "requested_plan": workspace.try_get::<String, _>("plan").unwrap_or_else(|_| "free".to_string()),
            "status": "none"
        })
    };

    Ok(Json(serde_json::json!({
        "workspace": {
            "id": workspace.try_get::<uuid::Uuid, _>("id").unwrap_or(workspace_id),
            "name": workspace.try_get::<String, _>("name").unwrap_or_default(),
            "slug": workspace.try_get::<String, _>("slug").unwrap_or_default(),
            "plan": workspace.try_get::<String, _>("plan").unwrap_or_else(|_| "free".to_string()),
            "owner_user_id": workspace.try_get::<uuid::Uuid, _>("owner_user_id").unwrap_or_default(),
            "settings": workspace.try_get::<Option<serde_json::Value>, _>("settings").ok().flatten().unwrap_or_else(|| serde_json::json!({})),
            "created_at": workspace
                .try_get::<Option<chrono::DateTime<chrono::Utc>>, _>("created_at")
                .ok()
                .flatten()
                .map(|v| v.to_rfc3339()),
        },
        "billing": billing_json,
    })))
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

    let workspace_id = existing.workspace_id;
    let updated_name = payload.name.unwrap_or(existing.name);
    let updated_description = payload.description.or(existing.description);
    let updated_definition = payload.definition.unwrap_or(existing.definition);
    let updated_enabled = payload.enabled.unwrap_or(existing.enabled.unwrap_or(true));

    let mut tx = state
        .pool
        .begin()
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

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
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let version_note = payload
        .note
        .clone()
        .unwrap_or_else(|| "Flow definition updated".to_string());

    sqlx::query(
        r#"
        INSERT INTO flow_versions (flow_id, definition, created_by, note)
        VALUES ($1, $2, $3, $4)
        "#,
    )
    .bind(flow_id)
    .bind(row.definition.clone())
    .bind(payload.created_by)
    .bind(Some(version_note))
    .execute(&mut *tx)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    sqlx::query(
        r#"
        INSERT INTO flow_environments (flow_id, environment, definition, enabled, deployed_by)
        VALUES ($1, 'production', $2, $3, $4)
        ON CONFLICT (flow_id, environment)
        DO UPDATE SET definition = EXCLUDED.definition, enabled = EXCLUDED.enabled, deployed_by = EXCLUDED.deployed_by, deployed_at = NOW(), updated_at = NOW()
        "#,
    )
    .bind(flow_id)
    .bind(row.definition.clone())
    .bind(updated_enabled)
    .bind(payload.created_by)
    .execute(&mut *tx)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    tx.commit()
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Invalidate flow cache for this workspace
    if let Some(ws_id) = workspace_id {
        invalidate_workspace_flow_cache(&state.cache, ws_id);
    }

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

async fn list_flow_versions(
    State(state): State<AppState>,
    Path(flow_id): Path<uuid::Uuid>,
) -> Result<Json<Vec<FlowVersionResponse>>, (axum::http::StatusCode, String)> {
    let rows = sqlx::query(
        r#"
        SELECT id, flow_id, definition, created_at, created_by, note
        FROM flow_versions
        WHERE flow_id = $1
        ORDER BY created_at DESC
        "#,
    )
    .bind(flow_id)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let versions = rows
        .into_iter()
        .map(|row| FlowVersionResponse {
            id: row.get("id"),
            flow_id: row.get("flow_id"),
            definition: row.get("definition"),
            created_at: row.get("created_at"),
            created_by: row.try_get("created_by").ok(),
            note: row.try_get("note").ok(),
        })
        .collect();

    Ok(Json(versions))
}

async fn get_flow_version_diff(
    State(state): State<AppState>,
    Path((flow_id, version_id)): Path<(uuid::Uuid, uuid::Uuid)>,
    Query(query): Query<FlowDiffQuery>,
) -> Result<Json<FlowVersionDiff>, (axum::http::StatusCode, String)> {
    let source = sqlx::query(
        "SELECT definition FROM flow_versions WHERE id = $1 AND flow_id = $2",
    )
    .bind(version_id)
    .bind(flow_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or((
        axum::http::StatusCode::NOT_FOUND,
        "Version not found".to_string(),
    ))?;

    let source_definition: serde_json::Value = source.get("definition");

    let target_definition: serde_json::Value = if let Some(target_version_id) = query.target_version_id {
        let target = sqlx::query(
            "SELECT definition FROM flow_versions WHERE id = $1 AND flow_id = $2",
        )
        .bind(target_version_id)
        .bind(flow_id)
        .fetch_optional(&state.pool)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or((
            axum::http::StatusCode::NOT_FOUND,
            "Target version not found".to_string(),
        ))?;
        target.get("definition")
    } else {
        let live = sqlx::query("SELECT definition FROM flows WHERE id = $1")
            .bind(flow_id)
            .fetch_optional(&state.pool)
            .await
            .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
            .ok_or((
                axum::http::StatusCode::NOT_FOUND,
                "Flow not found".to_string(),
            ))?;
        live.get("definition")
    };

    Ok(Json(build_flow_version_diff(
        &source_definition,
        &target_definition,
    )))
}

#[derive(Debug, Deserialize)]
struct RollbackRequest {
    created_by: Option<uuid::Uuid>,
    note: Option<String>,
}

async fn rollback_flow_version(
    State(state): State<AppState>,
    Path((flow_id, version_id)): Path<(uuid::Uuid, uuid::Uuid)>,
    Json(payload): Json<RollbackRequest>,
) -> Result<Json<FlowResponse>, (axum::http::StatusCode, String)> {
    let version = sqlx::query(
        r#"
        SELECT definition, created_at
        FROM flow_versions
        WHERE id = $1 AND flow_id = $2
        "#,
    )
    .bind(version_id)
    .bind(flow_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or((
        axum::http::StatusCode::NOT_FOUND,
        "Flow version not found".to_string(),
    ))?;

    let rollback_definition: serde_json::Value = version.get("definition");
    let version_created_at: chrono::DateTime<chrono::Utc> = version.get("created_at");

    let mut tx = state
        .pool
        .begin()
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let row = sqlx::query!(
        r#"
        UPDATE flows
        SET definition = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING id, workspace_id, name, description, definition, enabled, run_count
        "#,
        rollback_definition,
        flow_id,
    )
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or((axum::http::StatusCode::NOT_FOUND, "Flow not found".to_string()))?;

    let note = payload.note.unwrap_or_else(|| {
        format!(
            "Rollback to version {} ({})",
            version_id,
            version_created_at.to_rfc3339()
        )
    });

    sqlx::query(
        "INSERT INTO flow_versions (flow_id, definition, created_by, note) VALUES ($1, $2, $3, $4)",
    )
    .bind(flow_id)
    .bind(row.definition.clone())
    .bind(payload.created_by)
    .bind(Some(note))
    .execute(&mut *tx)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    sqlx::query(
        r#"
        INSERT INTO flow_environments (flow_id, environment, definition, enabled, deployed_by)
        VALUES ($1, 'production', $2, $3, $4)
        ON CONFLICT (flow_id, environment)
        DO UPDATE SET definition = EXCLUDED.definition, enabled = EXCLUDED.enabled, deployed_by = EXCLUDED.deployed_by, deployed_at = NOW(), updated_at = NOW()
        "#,
    )
    .bind(flow_id)
    .bind(row.definition.clone())
    .bind(row.enabled.unwrap_or(true))
    .bind(payload.created_by)
    .execute(&mut *tx)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    tx.commit()
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if let Some(ws_id) = row.workspace_id {
        invalidate_workspace_flow_cache(&state.cache, ws_id);
    }

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
struct DeployFlowEnvironmentRequest {
    created_by: Option<uuid::Uuid>,
    note: Option<String>,
}

async fn deploy_flow_to_environment(
    State(state): State<AppState>,
    Path((flow_id, environment)): Path<(uuid::Uuid, String)>,
    Json(payload): Json<DeployFlowEnvironmentRequest>,
) -> Result<Json<Vec<FlowEnvironmentStatus>>, (axum::http::StatusCode, String)> {
    let target_env = FlowEnvironment::parse(Some(&environment));
    if target_env != FlowEnvironment::Staging {
        return Err((
            axum::http::StatusCode::BAD_REQUEST,
            "Only staging deployments are supported from this endpoint".to_string(),
        ));
    }

    let flow = sqlx::query!(
        "SELECT id, definition FROM flows WHERE id = $1",
        flow_id
    )
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or((axum::http::StatusCode::NOT_FOUND, "Flow not found".to_string()))?;

    sqlx::query(
        r#"
        INSERT INTO flow_environments (flow_id, environment, definition, enabled, deployed_by)
        VALUES ($1, $2, $3, TRUE, $4)
        ON CONFLICT (flow_id, environment)
        DO UPDATE SET definition = EXCLUDED.definition, enabled = TRUE, deployed_by = EXCLUDED.deployed_by, deployed_at = NOW(), updated_at = NOW()
        "#,
    )
    .bind(flow_id)
    .bind(target_env.as_str())
    .bind(flow.definition)
    .bind(payload.created_by)
    .execute(&state.pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let note = payload
        .note
        .unwrap_or_else(|| "Deployed current flow to staging".to_string());
    sqlx::query(
        "INSERT INTO flow_versions (flow_id, definition, created_by, note) SELECT id, definition, $2, $3 FROM flows WHERE id = $1",
    )
    .bind(flow_id)
    .bind(payload.created_by)
    .bind(Some(note))
    .execute(&state.pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    get_flow_environment_statuses_inner(&state, flow_id).await
}

async fn promote_flow_environment(
    State(state): State<AppState>,
    Path(flow_id): Path<uuid::Uuid>,
    Json(payload): Json<DeployFlowEnvironmentRequest>,
) -> Result<Json<FlowResponse>, (axum::http::StatusCode, String)> {
    let staging = sqlx::query(
        r#"
        SELECT definition
        FROM flow_environments
        WHERE flow_id = $1 AND environment = 'staging' AND enabled = TRUE
        "#,
    )
    .bind(flow_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or((
        axum::http::StatusCode::BAD_REQUEST,
        "No active staging deployment found for this flow".to_string(),
    ))?;

    let staging_definition: serde_json::Value = staging.get("definition");

    let mut tx = state
        .pool
        .begin()
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let row = sqlx::query!(
        r#"
        UPDATE flows
        SET definition = $1, updated_at = NOW(), enabled = TRUE
        WHERE id = $2
        RETURNING id, workspace_id, name, description, definition, enabled, run_count
        "#,
        staging_definition,
        flow_id
    )
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or((axum::http::StatusCode::NOT_FOUND, "Flow not found".to_string()))?;

    sqlx::query(
        r#"
        INSERT INTO flow_environments (flow_id, environment, definition, enabled, deployed_by)
        VALUES ($1, 'production', $2, TRUE, $3)
        ON CONFLICT (flow_id, environment)
        DO UPDATE SET definition = EXCLUDED.definition, enabled = TRUE, deployed_by = EXCLUDED.deployed_by, deployed_at = NOW(), updated_at = NOW()
        "#,
    )
    .bind(flow_id)
    .bind(row.definition.clone())
    .bind(payload.created_by)
    .execute(&mut *tx)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let note = payload
        .note
        .clone()
        .unwrap_or_else(|| "Promoted staging deployment to production".to_string());
    sqlx::query(
        "INSERT INTO flow_versions (flow_id, definition, created_by, note) VALUES ($1, $2, $3, $4)",
    )
    .bind(flow_id)
    .bind(row.definition.clone())
    .bind(payload.created_by)
    .bind(Some(note))
    .execute(&mut *tx)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    tx.commit()
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    if let Some(ws_id) = row.workspace_id {
        invalidate_workspace_flow_cache(&state.cache, ws_id);
    }

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

async fn get_flow_environment_statuses_inner(
    state: &AppState,
    flow_id: uuid::Uuid,
) -> Result<Json<Vec<FlowEnvironmentStatus>>, (axum::http::StatusCode, String)> {
    let rows = sqlx::query(
        r#"
        SELECT environment, enabled, deployed_at, deployed_by
        FROM flow_environments
        WHERE flow_id = $1
        ORDER BY environment ASC
        "#,
    )
    .bind(flow_id)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let statuses = rows
        .into_iter()
        .map(|row| FlowEnvironmentStatus {
            environment: row.get::<String, _>("environment"),
            deployed: true,
            enabled: row.get::<bool, _>("enabled"),
            deployed_at: row.try_get("deployed_at").ok(),
            deployed_by: row.try_get("deployed_by").ok(),
        })
        .collect::<Vec<_>>();

    Ok(Json(statuses))
}

async fn get_flow_environment_statuses(
    State(state): State<AppState>,
    Path(flow_id): Path<uuid::Uuid>,
) -> Result<Json<Vec<FlowEnvironmentStatus>>, (axum::http::StatusCode, String)> {
    get_flow_environment_statuses_inner(&state, flow_id).await
}

#[derive(Debug, Deserialize)]
struct RunFlowEnvironmentRequest {
    input: Option<serde_json::Value>,
}

async fn run_flow_in_environment(
    State(state): State<AppState>,
    Path((flow_id, environment)): Path<(uuid::Uuid, String)>,
    Json(payload): Json<RunFlowEnvironmentRequest>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    let target_env = FlowEnvironment::parse(Some(&environment));
    let flow = sqlx::query!(
        "SELECT workspace_id, name FROM flows WHERE id = $1",
        flow_id
    )
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or((axum::http::StatusCode::NOT_FOUND, "Flow not found".to_string()))?;

    let workspace_id = flow.workspace_id.ok_or((
        axum::http::StatusCode::BAD_REQUEST,
        "Flow has no workspace".to_string(),
    ))?;

    if target_env == FlowEnvironment::Staging {
        let staging_exists = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS (SELECT 1 FROM flow_environments WHERE flow_id = $1 AND environment = 'staging' AND enabled = TRUE)",
        )
        .bind(flow_id)
        .fetch_one(&state.pool)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

        if !staging_exists {
            return Err((
                axum::http::StatusCode::BAD_REQUEST,
                "Flow is not deployed to staging".to_string(),
            ));
        }
    }

    let event = serde_json::json!({
        "id": uuid::Uuid::new_v4(),
        "tenant_id": workspace_id,
        "source": "dashboard.manual",
        "event_type": "manual.run",
        "data": {
            "environment": target_env.as_str(),
            "target_flow_id": flow_id,
            "payload": payload.input.unwrap_or_else(|| serde_json::json!({}))
        }
    });

    let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379/".to_string());
    let client = redis::Client::open(redis_url)
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let mut con = client
        .get_multiplexed_async_connection()
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let stream_key = workspace_stream_key_for_environment(workspace_id, target_env);
    let payload_str = serde_json::to_string(&event)
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let message_id: String = con
        .xadd(&stream_key, "*", &[("payload", payload_str)])
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(serde_json::json!({
        "success": true,
        "flow_id": flow_id,
        "flow_name": flow.name,
        "environment": target_env.as_str(),
        "redis_stream": stream_key,
        "event_id": message_id,
    })))
}

async fn delete_flow(
    State(state): State<AppState>,
    Path(flow_id): Path<uuid::Uuid>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    // Fetch workspace_id before deleting
    let flow = sqlx::query!(
        r#"
        SELECT workspace_id FROM flows
        WHERE id = $1
        "#,
        flow_id
    )
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let workspace_id = flow.and_then(|f| f.workspace_id);

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

    // Invalidate flow cache for this workspace
    if let Some(ws_id) = workspace_id {
        invalidate_workspace_flow_cache(&state.cache, ws_id);
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

    state
        .workspace_vaults
        .bootstrap_workspace(workspace_id, None)
        .await
        .map_err(|e| {
            (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to bootstrap workspace key: {e:?}"),
            )
        })?;

    let (encrypted_blob, nonce, workspace_key_version) = state
        .workspace_vaults
        .encrypt_workspace_secret(workspace_id, &payload.value)
        .await
        .map_err(|e| {
            (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                format!("{e:?}"),
            )
        })?;

    sqlx::query!(
        r#"
        INSERT INTO credentials (workspace_id, connector_id, encrypted_blob, nonce, workspace_key_version)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (workspace_id, connector_id)
        DO UPDATE SET encrypted_blob = EXCLUDED.encrypted_blob, nonce = EXCLUDED.nonce, workspace_key_version = EXCLUDED.workspace_key_version, updated_at = NOW()
        "#,
        workspace_id,
        connector_id,
        encrypted_blob,
        nonce,
        workspace_key_version
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

async fn get_credential_dependents(
    State(state): State<AppState>,
    Path(credential_id): Path<uuid::Uuid>,
) -> Result<Json<models::CredentialDependentsResponse>, (axum::http::StatusCode, String)> {
    // Fetch the credential to get workspace_id and connector_id
    let credential = sqlx::query!(
        "SELECT workspace_id, connector_id FROM credentials WHERE id = $1",
        credential_id
    )
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or_else(|| (axum::http::StatusCode::NOT_FOUND, "Credential not found".to_string()))?;
    
    let workspace_id = credential.workspace_id;
    let connector_id = credential.connector_id.clone();
    
    // Query all flows in this workspace to find ones that reference this credential
    // Parse flow definitions to find dependency
    let flows = sqlx::query!(
        r#"
        SELECT id, name, definition, enabled, created_at
        FROM flows
        WHERE workspace_id = $1
        ORDER BY created_at DESC
        "#,
        workspace_id
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    
    // Filter flows that use this credential
    let mut dependent_flows: Vec<models::CredentialDependentFlow> = Vec::new();
    
    for flow in flows {
        // definition comes as a serde_json::Value from sqlx::query!
        let flow_str = flow.definition.to_string().to_lowercase();
        if flow_str.contains(&connector_id.to_lowercase()) {
            // Get last execution time and count
            let execution_stats = sqlx::query!(
                r#"
                SELECT COUNT(*) as count, MAX(completed_at) as last_completed
                FROM flow_runs
                WHERE flow_id = $1 AND workspace_id = $2
                "#,
                flow.id,
                workspace_id
            )
            .fetch_optional(&state.pool)
            .await
            .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
            
            let (execution_count, last_executed_at) = if let Some(stats) = execution_stats {
                (stats.count.unwrap_or(0), stats.last_completed)
            } else {
                (0, None)
            };
            
            dependent_flows.push(models::CredentialDependentFlow {
                flow_id: flow.id,
                flow_name: flow.name.clone(),
                status: if flow.enabled.unwrap_or(true) { "active" } else { "paused" }.to_string(),
                created_at: flow.created_at,
                last_executed_at,
                execution_count,
            });
        }
    }
    
    let active_flows = dependent_flows.iter().filter(|f| f.status == "active").count() as i64;
    let total_flows = dependent_flows.len() as i64;
    
    Ok(Json(models::CredentialDependentsResponse {
        credential_id,
        connector_id,
        total_flows,
        active_flows,
        flows: dependent_flows,
    }))
}

async fn list_flow_runs(
    State(state): State<AppState>,
    Path(workspace_id): Path<uuid::Uuid>,
    Query(query): Query<FlowRunsQuery>,
) -> Result<Json<Vec<FlowRunResponse>>, (axum::http::StatusCode, String)> {
    let environment = FlowEnvironment::parse(query.environment.as_deref());

    let rows = sqlx::query(
        r#"
        SELECT id, flow_id, workspace_id, environment, status, trigger_event_id, started_at, completed_at, duration_ms, steps_log, error_message
        FROM flow_runs
        WHERE workspace_id = $1 AND environment = $2
        ORDER BY started_at DESC
        LIMIT 200
        "#,
    )
    .bind(workspace_id)
    .bind(environment.as_str())
    .fetch_all(&state.pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(Json(
        rows.into_iter()
            .map(|row| FlowRunResponse {
                id: row.get("id"),
                flow_id: row.try_get::<Option<uuid::Uuid>, _>("flow_id").ok().flatten(),
                workspace_id: row.get("workspace_id"),
                environment: row.try_get::<String, _>("environment").ok(),
                status: row.get("status"),
                trigger_event_id: row.try_get::<Option<uuid::Uuid>, _>("trigger_event_id").ok().flatten(),
                started_at: row.get("started_at"),
                completed_at: row.try_get::<Option<chrono::DateTime<chrono::Utc>>, _>("completed_at").ok().flatten(),
                duration_ms: row.try_get::<Option<i32>, _>("duration_ms").ok().flatten(),
                steps_log: row.try_get::<Option<serde_json::Value>, _>("steps_log").ok().flatten(),
                error_message: row.try_get::<Option<String>, _>("error_message").ok().flatten(),
            })
            .collect(),
    ))
}

async fn get_flow_run(
    State(state): State<AppState>,
    Path(run_id): Path<uuid::Uuid>,
) -> Result<Json<FlowRunResponse>, (axum::http::StatusCode, String)> {
    let row = sqlx::query(
        r#"
        SELECT id, flow_id, workspace_id, environment, status, trigger_event_id, started_at, completed_at, duration_ms, steps_log, error_message
        FROM flow_runs
        WHERE id = $1
        "#,
    )
    .bind(run_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or((axum::http::StatusCode::NOT_FOUND, "Flow run not found".to_string()))?;

    Ok(Json(FlowRunResponse {
        id: row.get("id"),
        flow_id: row.try_get::<Option<uuid::Uuid>, _>("flow_id").ok().flatten(),
        workspace_id: row.get("workspace_id"),
        environment: row.try_get::<String, _>("environment").ok(),
        status: row.get("status"),
        trigger_event_id: row.try_get::<Option<uuid::Uuid>, _>("trigger_event_id").ok().flatten(),
        started_at: row.get("started_at"),
        completed_at: row.try_get::<Option<chrono::DateTime<chrono::Utc>>, _>("completed_at").ok().flatten(),
        duration_ms: row.try_get::<Option<i32>, _>("duration_ms").ok().flatten(),
        steps_log: row.try_get::<Option<serde_json::Value>, _>("steps_log").ok().flatten(),
        error_message: row.try_get::<Option<String>, _>("error_message").ok().flatten(),
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
            let workspace_stream = workspace_stream_key(workspace_id);
            let _ = con.xadd::<_, _, _, _, ()>(
                &workspace_stream,
                "*",
                &[("payload", payload_str)]
            ).await;
        }
    }

    // Non-blocking ClickHouse insert for events table
    let clickhouse_url = std::env::var("CLICKHOUSE_URL").ok();
    let clickhouse_user = std::env::var("CLICKHOUSE_USER").ok();
    let clickhouse_password = std::env::var("CLICKHOUSE_PASSWORD").ok();
    let clickhouse_db = std::env::var("CLICKHOUSE_DB").ok();

    if clickhouse_url.is_some() {
        let event_id = event.id;
        let tenant_id = event.tenant_id;
        let now = chrono::Utc::now();
        let payload_size = body.len() as u32;

        tokio::spawn(async move {
            if let (Some(url), Some(user), Some(password), Some(db)) = 
                (clickhouse_url, clickhouse_user, clickhouse_password, clickhouse_db) {
                let insert_query = format!(
                    "INSERT INTO {}.events (event_id, tenant_id, connector, event_type, received_at, payload_size_bytes) FORMAT JSONEachRow",
                    db
                );
                
                let json_payload = serde_json::json!({
                    "event_id": event_id,
                    "tenant_id": tenant_id,
                    "connector": "webhook",
                    "event_type": "webhook.received",
                    "received_at": now,
                    "payload_size_bytes": payload_size
                });

                let client = reqwest::Client::new();
                let _ = client
                    .post(format!("{}/?query={}", url, urlencoding::encode(&insert_query)))
                    .basic_auth(&user, Some(&password))
                    .json(&json_payload)
                    .send()
                    .await;
            }
        });
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
        INSERT INTO flow_runs (flow_id, workspace_id, environment, status, started_at) 
        VALUES ($1, $2, $3, $4, NOW())
        RETURNING id
    ", flow_id, workspace_id, "production", "running")
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
        SELECT encrypted_blob, nonce, workspace_key_version
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
    let workspace_key_version: i32 = row
        .try_get("workspace_key_version")
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let secret = state
        .workspace_vaults
        .decrypt_workspace_secret(workspace_id, workspace_key_version, &encrypted_blob, &nonce)
        .await
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
    let environment = FlowEnvironment::parse(params.get("environment").map(String::as_str));

    let rows = sqlx::query(
        r#"
        SELECT id, flow_id, workspace_id, environment, status, trigger_event_id, started_at, completed_at, duration_ms, error_message
        FROM flow_runs
        WHERE flow_id = $1 AND environment = $2
        ORDER BY started_at DESC
        LIMIT $3 OFFSET $4
        "#,
    )
    .bind(flow_id)
    .bind(environment.as_str())
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let runs: Vec<serde_json::Value> = rows
        .iter()
        .map(|row| {
            let started_at: chrono::DateTime<chrono::Utc> = row.get("started_at");
            let completed_at = row
                .try_get::<Option<chrono::DateTime<chrono::Utc>>, _>("completed_at")
                .ok()
                .flatten();
            serde_json::json!({
                "id": row.get::<uuid::Uuid, _>("id"),
                "flow_id": row.try_get::<Option<uuid::Uuid>, _>("flow_id").ok().flatten(),
                "workspace_id": row.get::<uuid::Uuid, _>("workspace_id"),
                "environment": row.try_get::<String, _>("environment").ok(),
                "status": row.get::<String, _>("status"),
                "trigger_event_id": row.try_get::<Option<uuid::Uuid>, _>("trigger_event_id").ok().flatten(),
                "started_at": started_at.to_rfc3339(),
                "completed_at": completed_at.map(|t| t.to_rfc3339()),
                "duration_ms": row.try_get::<Option<i32>, _>("duration_ms").ok().flatten(),
                "error_message": row.try_get::<Option<String>, _>("error_message").ok().flatten(),
            })
        })
        .collect();

    Ok(Json(serde_json::json!({
        "runs": runs,
        "total": runs.len(),
        "limit": limit,
        "offset": offset,
        "environment": environment.as_str(),
    })))
}

async fn get_flow_run_details(
    State(state): State<AppState>,
    Path((flow_id, run_id)): Path<(uuid::Uuid, uuid::Uuid)>,
) -> Result<Json<FlowRunResponse>, (axum::http::StatusCode, String)> {
    let row = sqlx::query(
        r#"
        SELECT id, flow_id, workspace_id, environment, status, trigger_event_id, started_at, completed_at, duration_ms, steps_log, error_message
        FROM flow_runs
        WHERE id = $1 AND flow_id = $2
        "#,
    )
    .bind(run_id)
    .bind(flow_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or((axum::http::StatusCode::NOT_FOUND, "Flow run not found".to_string()))?;

    Ok(Json(FlowRunResponse {
        id: row.get("id"),
        flow_id: row.try_get::<Option<uuid::Uuid>, _>("flow_id").ok().flatten(),
        workspace_id: row.get("workspace_id"),
        environment: row.try_get::<String, _>("environment").ok(),
        status: row.get("status"),
        trigger_event_id: row.try_get::<Option<uuid::Uuid>, _>("trigger_event_id").ok().flatten(),
        started_at: row.get("started_at"),
        completed_at: row.try_get::<Option<chrono::DateTime<chrono::Utc>>, _>("completed_at").ok().flatten(),
        duration_ms: row.try_get::<Option<i32>, _>("duration_ms").ok().flatten(),
        steps_log: row.try_get::<Option<serde_json::Value>, _>("steps_log").ok().flatten(),
        error_message: row.try_get::<Option<String>, _>("error_message").ok().flatten(),
    }))
}

async fn replay_flow_run_step(
    State(state): State<AppState>,
    Path((flow_id, run_id, step_id)): Path<(uuid::Uuid, uuid::Uuid, String)>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    let row = sqlx::query(
        r#"
        SELECT id, flow_id, workspace_id, environment, status, trigger_event_id, started_at, completed_at, duration_ms, steps_log, error_message
        FROM flow_runs
        WHERE id = $1 AND flow_id = $2
        "#,
    )
    .bind(run_id)
    .bind(flow_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or((axum::http::StatusCode::NOT_FOUND, "Flow run not found".to_string()))?;

    let workspace_id: uuid::Uuid = row.get("workspace_id");
    let steps_log: serde_json::Value = row
        .try_get::<Option<serde_json::Value>, _>("steps_log")
        .ok()
        .flatten()
        .ok_or((axum::http::StatusCode::NOT_FOUND, "No step log found for this run".to_string()))?;

    let replay_entry = steps_log
        .as_array()
        .and_then(|entries| entries.iter().find(|entry| entry.get("step_id").and_then(|value| value.as_str()) == Some(step_id.as_str())))
        .cloned()
        .ok_or((axum::http::StatusCode::NOT_FOUND, format!("Step {} not found in run log", step_id)))?;

    let flow_row = sqlx::query(
        r#"
        SELECT definition, name
        FROM flows
        WHERE id = $1 AND workspace_id = $2
        "#,
    )
    .bind(flow_id)
    .bind(workspace_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
    .ok_or((axum::http::StatusCode::NOT_FOUND, "Flow not found".to_string()))?;

    let definition: FlowDefinition = serde_json::from_value(
        flow_row
            .try_get::<serde_json::Value, _>("definition")
            .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?,
    )
    .map_err(|e| (axum::http::StatusCode::BAD_REQUEST, format!("Invalid flow definition: {}", e)))?;

    let step_def = definition
        .steps
        .iter()
        .find(|step| step.id == step_id)
        .cloned()
        .ok_or((axum::http::StatusCode::NOT_FOUND, format!("Step {} not found in flow definition", step_id)))?;

    let trigger_event_value = replay_entry
        .get("trigger_event")
        .cloned()
        .ok_or((axum::http::StatusCode::BAD_REQUEST, "Replay log does not contain trigger event context".to_string()))?;
    let trigger_event: models::PulseEvent = serde_json::from_value(trigger_event_value)
        .map_err(|e| (axum::http::StatusCode::BAD_REQUEST, format!("Failed to parse trigger event: {}", e)))?;

    let frozen_input = replay_entry.get("input").cloned().unwrap_or_else(|| serde_json::json!({}));
    let frozen_step_outputs: std::collections::HashMap<String, serde_json::Value> = replay_entry
        .get("step_outputs_snapshot")
        .cloned()
        .map(|value| serde_json::from_value(value).unwrap_or_default())
        .unwrap_or_default();

    let pool = state.pool.clone();
    let vault = state.vault.clone();
    let workspace_vaults = state.workspace_vaults.clone();
    let step_def_for_exec = step_def.clone();
    let frozen_input_for_exec = frozen_input.clone();
    let frozen_step_outputs_for_exec = frozen_step_outputs.clone();
    let trigger_event_for_exec = trigger_event.clone();

    let result = tokio::task::spawn_blocking(move || {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|e| e.to_string())?;

        let executor = FlowExecutor::new(pool, vault).with_workspace_vaults(workspace_vaults);
        let replay_result = runtime.block_on(async move {
            executor
                .execute_step(
                    &step_def_for_exec,
                    frozen_input_for_exec,
                    &frozen_step_outputs_for_exec,
                    &trigger_event_for_exec,
                )
                .await
        });

        Ok::<models::StepExecutionResult, String>(replay_result)
    })
    .await
    .map_err(|e| {
        (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            format!("Replay task join error: {}", e),
        )
    })?
    .map_err(|e| {
        (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            format!("Replay task runtime error: {}", e),
        )
    })?;

    let replay_payload = serde_json::json!({
        "event_type": "flow_run_step_io",
        "tenant_id": workspace_id,
        "flow_id": flow_id,
        "flow_run_id": run_id,
        "step_id": step_id,
        "status": result.status.clone(),
        "duration_ms": result.duration_ms,
        "error": result.error.clone(),
        "input": frozen_input,
        "output": result.output.clone(),
        "step_outputs_snapshot": frozen_step_outputs,
        "trigger_event": trigger_event,
        "replay": true,
    });

    let _ = publish_step_io_event(
        workspace_id,
        run_id,
        &steps_log,
        replay_payload,
    ).await;

    Ok(Json(serde_json::json!({
        "success": true,
        "replayed": true,
        "flow_id": flow_id,
        "flow_run_id": run_id,
        "step_id": step_id,
        "result": result,
    })))
}

async fn get_detected_patterns(
    State(state): State<AppState>,
    Path(workspace_id): Path<uuid::Uuid>,
    Query(params): Query<DetectedPatternsQuery>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    let limit = params.limit.unwrap_or(50).clamp(1, 200);
    let offset = params.offset.unwrap_or(0).max(0);
    let start_date_raw = params.start_date.clone();
    let end_date_raw = params.end_date.clone();

    let start_date = match start_date_raw.as_deref() {
        Some(ref value) => Some(
            chrono::DateTime::parse_from_rfc3339(value)
                .map_err(|_| {
                    (
                        axum::http::StatusCode::BAD_REQUEST,
                        "Invalid start_date. Use RFC3339 format".to_string(),
                    )
                })?
                .with_timezone(&chrono::Utc),
        ),
        None => None,
    };

    let end_date = match end_date_raw.as_deref() {
        Some(ref value) => Some(
            chrono::DateTime::parse_from_rfc3339(value)
                .map_err(|_| {
                    (
                        axum::http::StatusCode::BAD_REQUEST,
                        "Invalid end_date. Use RFC3339 format".to_string(),
                    )
                })?
                .with_timezone(&chrono::Utc),
        ),
        None => None,
    };

    let normalized_pattern_type = params
        .pattern_type
        .as_ref()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let mut query_builder = QueryBuilder::<Postgres>::new(
        r#"
        SELECT id, workspace_id, pattern_type, description, confidence, frequency,
               events_involved, suggested_trigger, suggested_actions, suggested_flow, detected_at
        FROM ai_detected_patterns
        WHERE workspace_id = "#,
    );
    query_builder.push_bind(workspace_id);

    if let Some(pattern_type) = normalized_pattern_type.as_deref() {
        query_builder.push(" AND pattern_type = ");
        query_builder.push_bind(pattern_type);
    }
    if let Some(date) = start_date.as_ref() {
        query_builder.push(" AND detected_at >= ");
        query_builder.push_bind(date.clone());
    }
    if let Some(date) = end_date.as_ref() {
        query_builder.push(" AND detected_at <= ");
        query_builder.push_bind(date.clone());
    }

    query_builder.push(" ORDER BY detected_at DESC LIMIT ");
    query_builder.push_bind(limit);
    query_builder.push(" OFFSET ");
    query_builder.push_bind(offset);

    let patterns = query_builder
        .build()
        .fetch_all(&state.pool)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let mut count_query_builder = QueryBuilder::<Postgres>::new(
        "SELECT COUNT(*)::bigint AS total FROM ai_detected_patterns WHERE workspace_id = ",
    );
    count_query_builder.push_bind(workspace_id);

    if let Some(pattern_type) = normalized_pattern_type.as_deref() {
        count_query_builder.push(" AND pattern_type = ");
        count_query_builder.push_bind(pattern_type);
    }
    if let Some(date) = start_date.as_ref() {
        count_query_builder.push(" AND detected_at >= ");
        count_query_builder.push_bind(date.clone());
    }
    if let Some(date) = end_date.as_ref() {
        count_query_builder.push(" AND detected_at <= ");
        count_query_builder.push_bind(date.clone());
    }

    let total_row = count_query_builder
        .build()
        .fetch_one(&state.pool)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let total = total_row.get::<i64, _>("total");

    let patterns_json: Vec<serde_json::Value> = patterns.iter().map(|row| {
        serde_json::json!({
            "id": row.get::<uuid::Uuid, _>("id").to_string(),
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
        "total": total,
        "limit": limit,
        "offset": offset,
        "filters": {
            "pattern_type": normalized_pattern_type,
            "start_date": start_date_raw,
            "end_date": end_date_raw,
        }
    })))
}

// BILLING: Stripe webhook handler for subscription lifecycle events
async fn stripe_webhook_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    let body_str = verify_stripe_webhook_signature(&state, &headers, &body).await?;

    let event: serde_json::Value = serde_json::from_str(&body_str)
        .map_err(|e| (axum::http::StatusCode::BAD_REQUEST, e.to_string()))?;
    
    let event_type = event.get("type").and_then(|v| v.as_str())
        .ok_or_else(|| (axum::http::StatusCode::BAD_REQUEST, "Missing Stripe event type".to_string()))?;
    let event_object = event
        .get("data")
        .and_then(|data| data.get("object"))
        .cloned()
        .ok_or_else(|| (axum::http::StatusCode::BAD_REQUEST, "Missing Stripe event object".to_string()))?;
    
    match event_type {
        "customer.subscription.created" => {
            let workspace_id = resolve_workspace_id_for_subscription(&state, &event_object).await?;
            let subscription_id = event_object
                .get("id")
                .and_then(|value| value.as_str())
                .ok_or_else(|| (axum::http::StatusCode::BAD_REQUEST, "Missing subscription id".to_string()))?;
            let customer_id = event_object
                .get("customer")
                .and_then(|value| value.as_str())
                .ok_or_else(|| (axum::http::StatusCode::BAD_REQUEST, "Missing Stripe customer id".to_string()))?;
            let plan_tier = stripe_subscription_plan_tier(&event_object);
            let status = event_object
                .get("status")
                .and_then(|value| value.as_str())
                .unwrap_or("pending");
            let activate_plan = matches!(status, "active" | "trialing");

            let mut tx = state.pool.begin().await
                .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            if activate_plan {
                sqlx::query(
                    "UPDATE workspaces SET plan = $1, stripe_customer_id = COALESCE($3, stripe_customer_id) WHERE id = $2"
                )
                .bind(&plan_tier)
                .bind(workspace_id)
                .bind(Some(customer_id))
                .execute(&mut *tx)
                .await
                .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
            }

            sqlx::query(
                r#"
                INSERT INTO billing_subscriptions (
                    workspace_id,
                    stripe_customer_id,
                    stripe_subscription_id,
                    plan_tier,
                    status,
                    updated_at
                )
                VALUES ($1, $2, $3, $4, $5, NOW())
                ON CONFLICT (workspace_id)
                DO UPDATE SET
                    stripe_customer_id = EXCLUDED.stripe_customer_id,
                    stripe_subscription_id = EXCLUDED.stripe_subscription_id,
                    plan_tier = EXCLUDED.plan_tier,
                    status = EXCLUDED.status,
                    updated_at = NOW()
                "#,
            )
            .bind(workspace_id)
            .bind(customer_id)
            .bind(subscription_id)
            .bind(&plan_tier)
            .bind(status)
            .execute(&mut *tx)
            .await
            .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            tx.commit().await
                .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            // Automatically generate first API key for Pro users on successful subscription
            if activate_plan && plan_tier == "pro" {
                let (key_prefix, _full_key, key_hash) = generate_api_key();
                let now = chrono::Utc::now();
                
                // Try to insert the first API key, but don't fail the webhook if this fails
                let _ = sqlx::query(
                    r#"
                    INSERT INTO api_keys (
                        id, workspace_id, key_prefix, key_hash, name, description,
                        is_active, created_at, scopes
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    ON CONFLICT DO NOTHING
                    "#,
                )
                .bind(uuid::Uuid::new_v4())
                .bind(workspace_id)
                .bind(&key_prefix)
                .bind(&key_hash)
                .bind("Default API Key")
                .bind(Some("Automatically generated on Pro plan upgrade"))
                .bind(true)
                .bind(now)
                .bind(serde_json::json!(["flows:read", "flows:write", "events:read"]))
                .execute(&state.pool)
                .await;
            }

            let payload = serde_json::json!({
                "id": uuid::Uuid::new_v4(),
                "tenant_id": workspace_id,
                "source": "stripe",
                "event_type": if activate_plan { "billing.subscription_activated" } else { "billing.subscription_pending" },
                "timestamp": chrono::Utc::now().to_rfc3339(),
                "data": {
                    "status": status,
                    "plan_tier": plan_tier,
                    "subscription_id": subscription_id,
                    "customer_id": customer_id,
                }
            });
            publish_workspace_stream_event(workspace_id, payload).await?;
        },
        "customer.subscription.updated" => {
            let workspace_id = resolve_workspace_id_for_subscription(&state, &event_object).await?;
            let subscription_id = event_object.get("id").and_then(|value| value.as_str());
            let customer_id = event_object.get("customer").and_then(|value| value.as_str());
            let plan_tier = stripe_subscription_plan_tier(&event_object);
            let status = event_object
                .get("status")
                .and_then(|value| value.as_str())
                .unwrap_or("active");
            let activate_plan = matches!(status, "active" | "trialing");

            let mut tx = state.pool.begin().await
                .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            if activate_plan {
                sqlx::query(
                    "UPDATE workspaces SET plan = $1, stripe_customer_id = COALESCE($3, stripe_customer_id) WHERE id = $2"
                )
                .bind(&plan_tier)
                .bind(workspace_id)
                .bind(customer_id)
                .execute(&mut *tx)
                .await
                .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
            }

            sqlx::query(
                r#"
                UPDATE billing_subscriptions
                SET plan_tier = $1,
                    status = $2,
                    stripe_customer_id = COALESCE($3, stripe_customer_id),
                    stripe_subscription_id = COALESCE($4, stripe_subscription_id),
                    updated_at = NOW()
                WHERE workspace_id = $5
                "#,
            )
            .bind(&plan_tier)
            .bind(status)
            .bind(customer_id)
            .bind(subscription_id)
            .bind(workspace_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            tx.commit().await
                .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            let payload = serde_json::json!({
                "id": uuid::Uuid::new_v4(),
                "tenant_id": workspace_id,
                "source": "stripe",
                "event_type": if activate_plan { "billing.subscription_activated" } else { "billing.subscription_pending" },
                "timestamp": chrono::Utc::now().to_rfc3339(),
                "data": {
                    "status": status,
                    "plan_tier": plan_tier,
                    "subscription_id": subscription_id,
                    "customer_id": customer_id,
                }
            });
            publish_workspace_stream_event(workspace_id, payload).await?;
        },
        "customer.subscription.deleted" => {
            let workspace_id = resolve_workspace_id_for_subscription(&state, &event_object).await?;
            let subscription_id = event_object.get("id").and_then(|value| value.as_str());
            let customer_id = event_object.get("customer").and_then(|value| value.as_str());

            let mut tx = state.pool.begin().await
                .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            sqlx::query(
                "UPDATE workspaces SET plan = 'free', stripe_customer_id = COALESCE($2, stripe_customer_id) WHERE id = $1"
            )
            .bind(workspace_id)
            .bind(customer_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            sqlx::query(
                r#"
                UPDATE billing_subscriptions
                SET status = 'canceled',
                    stripe_customer_id = COALESCE($1, stripe_customer_id),
                    stripe_subscription_id = COALESCE($2, stripe_subscription_id),
                    plan_tier = 'free',
                    updated_at = NOW()
                WHERE workspace_id = $3
                "#,
            )
            .bind(customer_id)
            .bind(subscription_id)
            .bind(workspace_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            tx.commit().await
                .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            let payload = serde_json::json!({
                "id": uuid::Uuid::new_v4(),
                "tenant_id": workspace_id,
                "source": "stripe",
                "event_type": "billing.subscription_canceled",
                "timestamp": chrono::Utc::now().to_rfc3339(),
                "data": {
                    "plan_tier": "free",
                    "subscription_id": subscription_id,
                    "customer_id": customer_id,
                }
            });
            publish_workspace_stream_event(workspace_id, payload).await?;
        },
        "invoice.payment_failed" => {
            let workspace_id = resolve_workspace_id_for_subscription(&state, &event_object).await?;
            let subscription_id = event_object.get("subscription").and_then(|value| value.as_str())
                .or_else(|| event_object.get("id").and_then(|value| value.as_str()));
            let customer_id = event_object.get("customer").and_then(|value| value.as_str());

            let payload = serde_json::json!({
                "id": uuid::Uuid::new_v4(),
                "tenant_id": workspace_id,
                "source": "stripe",
                "event_type": "billing.payment_failed",
                "timestamp": chrono::Utc::now().to_rfc3339(),
                "data": {
                    "message": "Stripe payment failed",
                    "invoice_id": event_object.get("id").and_then(|value| value.as_str()),
                    "subscription_id": subscription_id,
                    "customer_id": customer_id,
                    "plan_tier": event_object
                        .get("subscription_details")
                        .and_then(|details| details.get("plan"))
                        .and_then(|plan| plan.get("nickname"))
                        .and_then(|value| value.as_str())
                        .or_else(|| event_object.get("plan").and_then(|plan| plan.get("nickname")).and_then(|value| value.as_str())),
                }
            });

            publish_workspace_stream_event(workspace_id, payload).await?;
        },
        _ => {
            eprintln!("[Stripe webhook] Ignoring event type: {}", event_type);
        }
    }
    
    // Return success to acknowledge receipt
    Ok(Json(serde_json::json!({
        "received": true,
        "event_type": event_type
    })))
}

// BILLING: Usage metering endpoint - returns current month usage for a workspace
// Returns event and flow run counts used by Phase 1/2 billing enforcement.
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

async fn get_replay_events(
    Path(workspace_id): Path<uuid::Uuid>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    let limit = params
        .get("limit")
        .and_then(|value| value.parse::<isize>().ok())
        .unwrap_or(50)
        .clamp(1, 500);

    let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379/".to_string());
    let client = redis::Client::open(redis_url)
        .map_err(|error| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))?;
    let mut con = client
        .get_multiplexed_async_connection()
        .await
        .map_err(|error| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))?;

    let ring_buffer_key = format!("workspace:{}:events", workspace_id);
    let events: Vec<String> = redis::cmd("ZREVRANGE")
        .arg(&ring_buffer_key)
        .arg(0)
        .arg(limit - 1)
        .query_async(&mut con)
        .await
        .map_err(|error| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, error.to_string()))?;

    let parsed_events: Vec<serde_json::Value> = events
        .into_iter()
        .filter_map(|payload| serde_json::from_str::<serde_json::Value>(&payload).ok())
        .collect();

    Ok(Json(serde_json::json!({
        "workspace_id": workspace_id,
        "total": parsed_events.len(),
        "events": parsed_events,
    })))
}

// Generate a new API key: returns (key_prefix, full_key, key_hash)
fn generate_api_key() -> (String, String, String) {
    use sha2::{Sha256, Digest};
    use base64::Engine;
    
    // Generate 32 random bytes and encode as base64
    let random_bytes = uuid::Uuid::new_v4().as_bytes().to_vec();
    let random_bytes_extended = [
        random_bytes.as_slice(),
        uuid::Uuid::new_v4().as_bytes(),
    ].concat();
    
    let engine = base64::engine::general_purpose::STANDARD;
    let key_str = engine.encode(&random_bytes_extended);
    let full_key = format!("pk_live_{}", &key_str[..16]); // Prefix + first 16 chars
    let key_prefix = format!("pk_live_{}", &key_str[..8]); // Used as unique identifier
    
    // Hash the full key for storage
    let mut hasher = Sha256::new();
    hasher.update(full_key.as_bytes());
    let hash = format!("{:x}", hasher.finalize());
    
    (key_prefix, full_key, hash)
}

async fn create_api_key(
    State(state): State<AppState>,
    Path(workspace_id): Path<uuid::Uuid>,
    Json(payload): Json<models::CreateApiKeyRequest>,
) -> Result<Json<models::CreateApiKeyResponse>, (axum::http::StatusCode, String)> {
    // Generate new key
    let (key_prefix, full_key, key_hash) = generate_api_key();
    
    // Insert into database
    let scopes = payload.scopes.unwrap_or_default();
    let scopes_json = serde_json::to_value(&scopes)
        .unwrap_or_else(|_| serde_json::json!([]));
    
    let id = uuid::Uuid::new_v4();
    let now = chrono::Utc::now();
    
    sqlx::query(
        r#"
        INSERT INTO api_keys (
            id, workspace_id, key_prefix, key_hash, name, description, 
            is_active, created_at, expires_at, scopes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        "#,
    )
    .bind(id)
    .bind(workspace_id)
    .bind(&key_prefix)
    .bind(&key_hash)
    .bind(&payload.name)
    .bind(&payload.description)
    .bind(true) // is_active
    .bind(now)
    .bind(&payload.expires_at)
    .bind(&scopes_json)
    .execute(&state.pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    
    Ok(Json(models::CreateApiKeyResponse {
        id,
        name: payload.name,
        key_prefix,
        key: full_key,
        created_at: now,
    }))
}

async fn list_api_keys(
    State(state): State<AppState>,
    Path(workspace_id): Path<uuid::Uuid>,
) -> Result<Json<Vec<models::ApiKeyResponse>>, (axum::http::StatusCode, String)> {
    let keys = sqlx::query_as::<_, models::ApiKey>(
        r#"
        SELECT id, workspace_id, key_prefix, key_hash, name, description,
               is_active, created_at, last_used_at, expires_at, scopes
        FROM api_keys
        WHERE workspace_id = $1
        ORDER BY created_at DESC
        "#,
    )
    .bind(workspace_id)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    
    let responses = keys.into_iter().map(|key| {
        models::ApiKeyResponse {
            id: key.id,
            name: key.name,
            key_prefix: key.key_prefix,
            is_active: key.is_active,
            created_at: key.created_at,
            last_used_at: key.last_used_at,
            expires_at: key.expires_at,
            scopes: key.scopes,
        }
    }).collect();
    
    Ok(Json(responses))
}

async fn revoke_api_key(
    State(state): State<AppState>,
    Path((workspace_id, key_id)): Path<(uuid::Uuid, uuid::Uuid)>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    let result = sqlx::query(
        "UPDATE api_keys SET is_active = false WHERE id = $1 AND workspace_id = $2"
    )
    .bind(key_id)
    .bind(workspace_id)
    .execute(&state.pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    
    if result.rows_affected() == 0 {
        return Err((axum::http::StatusCode::NOT_FOUND, "API key not found".to_string()));
    }
    
    Ok(Json(serde_json::json!({ "status": "revoked" })))
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

// Approval step handlers
async fn approval_decision_handler(
    State(state): State<AppState>,
    Json(payload): Json<ApprovalDecisionRequest>,
) -> Result<Json<ApprovalDecisionResponse>, (axum::http::StatusCode, String)> {
    let approval_manager = ApprovalManager::new(state.pool.clone());

    // Get the approval by token
    let approval = approval_manager
        .get_approval_by_token(payload.token)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e))?
        .ok_or_else(|| {
            (
                axum::http::StatusCode::NOT_FOUND,
                "Approval not found".to_string(),
            )
        })?;

    // Check if already decided
    if approval.status != "pending" {
        return Err((
            axum::http::StatusCode::BAD_REQUEST,
            format!("Approval already {}", approval.status),
        ));
    }

    // Check if expired
    if approval.expires_at < chrono::Utc::now() {
        approval_manager
            .update_approval_decision(payload.token, "expired", None)
            .await
            .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e))?;

        return Err((
            axum::http::StatusCode::BAD_REQUEST,
            "Approval has expired".to_string(),
        ));
    }

    // Update approval status
    approval_manager
        .update_approval_decision(payload.token, &payload.decision, payload.reason.clone())
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e))?;

    // Update flow run status and resume if approved
    let decision_status = if payload.decision.eq_ignore_ascii_case("approved") {
        "pending_approval_approved"
    } else {
        "pending_approval_rejected"
    };

    sqlx::query(
        "UPDATE flow_runs SET status = $1, updated_at = NOW() WHERE id = $2"
    )
    .bind(decision_status)
    .bind(approval.flow_run_id)
    .execute(&state.pool)
    .await
    .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Store decision in Redis for fast retrieval during resume
    let redis_url = std::env::var("REDIS_URL")
        .unwrap_or_else(|_| "redis://127.0.0.1:6379/".to_string());
    
    if let Ok(client) = redis::Client::open(redis_url) {
        if let Ok(mut con) = client.get_multiplexed_async_connection().await {
            let cache_key = format!(
                "approval_decision:{}:{}",
                approval.flow_run_id, approval.step_id
            );
            let decision_data = serde_json::json!({
                "decision": payload.decision,
                "approver_id": payload.approver_id,
                "approver_email": payload.approver_email,
                "reason": payload.reason,
                "decided_at": chrono::Utc::now().to_rfc3339(),
            });

            let _: Result<(), _> = redis::AsyncCommands::set_ex(
                &mut con,
                &cache_key,
                serde_json::to_string(&decision_data).unwrap_or_default(),
                86400, // 24 hour cache
            )
            .await;
        }
    }

    Ok(Json(ApprovalDecisionResponse {
        success: true,
        flow_run_id: approval.flow_run_id,
        step_id: approval.step_id,
        decision: payload.decision,
        message: "Approval decision processed successfully".to_string(),
    }))
}

async fn get_pending_approvals(
    State(state): State<AppState>,
    Path(flow_run_id): Path<uuid::Uuid>,
) -> Result<Json<Vec<models::PendingApproval>>, (axum::http::StatusCode, String)> {
    let approval_manager = ApprovalManager::new(state.pool.clone());

    let approvals = approval_manager
        .get_pending_approvals(flow_run_id)
        .await
        .map_err(|e| (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e))?;

    Ok(Json(approvals))
}
