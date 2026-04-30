use crate::models::WorkspaceSecret;
use core_proto::pulsecore::pulse_core_service_server::PulseCoreService;
use core_proto::pulsecore::{
    SetWorkspaceSecretRequest, SetWorkspaceSecretResponse, TriggerFlowRequest, TriggerFlowResponse,
    VerifyWebhookRequest, VerifyWebhookResponse, GenerateFlowRequest, GenerateFlowResponse,
    AnalyzeFailureRequest, AnalyzeFailureResponse, ListMarketTemplatesRequest,
    ListMarketTemplatesResponse, InstallTemplateRequest, InstallTemplateResponse, MarketTemplate,
    GetMarketTemplateRequest, GetMarketTemplateResponse, PublishMarketTemplateRequest,
    PublishMarketTemplateResponse, RateMarketTemplateRequest, RateMarketTemplateResponse,
    DetectPatternsRequest, DetectPatternsResponse, DetectedPattern,
    WorkspaceAnalyticsRequest, WorkspaceAnalyticsResponse, WorkspaceMetricsRequest,
    FlowMetricsResponse, FlowMetric, ConnectorMetricsResponse, ConnectorMetric,
    FlowRunStatsRequest, FlowRunStatsResponse, FlowRunStat, FlowRunStatistics,
    RecentErrorsRequest, RecentErrorsResponse, RecentError,
    EventMetricsRequest, EventMetricsResponse, EventMetricPoint
};
use core_vault::Vault;
use chrono::{DateTime, Duration, Utc};
use redis::AsyncCommands;
use sqlx::{PgPool, Row};
use tonic::{Request, Response, Status};
use uuid::Uuid;

#[derive(Clone)]
pub struct MyPulseCoreService {
    pg_pool: PgPool,
    vault: std::sync::Arc<Vault>,
}

impl MyPulseCoreService {
    pub fn new(pg_pool: sqlx::PgPool) -> Self {
        let master_key = std::env::var("PULSE_VAULT_MASTER_KEY")
            .unwrap_or_else(|_| "dev-only-master-key-change-me".to_string());
        let vault = std::sync::Arc::new(Vault::new(&master_key, std::env::var("PULSE_VAULT_SALT").unwrap_or_else(|_| "pulsegrid_salt".to_string()).as_bytes()));
        Self { pg_pool, vault }
    }

    async fn queue_market_review(&self, payload: serde_json::Value) -> Result<(), Status> {
        let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379/".to_string());
        let client = redis::Client::open(redis_url)
            .map_err(|e| Status::internal(format!("Failed to create Redis client: {}", e)))?;
        let mut con = client
            .get_multiplexed_async_connection()
            .await
            .map_err(|e| Status::internal(format!("Failed to connect Redis: {}", e)))?;

        let _: () = con
            .lpush("queue:market:review", payload.to_string())
            .await
            .map_err(|e| Status::internal(format!("Failed to queue market review: {}", e)))?;

        Ok(())
    }

    async fn fetch_flow_metrics(&self, ws_id: Uuid) -> Result<Vec<FlowMetric>, Status> {
        let rows = sqlx::query(
            r#"
            SELECT
                fr.flow_id,
                COALESCE(f.name, 'Unknown Flow') AS flow_name,
                COUNT(*)::BIGINT AS total_runs,
                COUNT(*) FILTER (WHERE fr.status = 'success')::BIGINT AS successful_runs,
                COUNT(*) FILTER (WHERE fr.status = 'failed')::BIGINT AS failed_runs,
                COALESCE(AVG(fr.duration_ms), 0)::FLOAT8 AS average_duration,
                MAX(fr.started_at) AS last_run
            FROM flow_runs fr
            LEFT JOIN flows f ON f.id = fr.flow_id
            WHERE fr.workspace_id = $1
            GROUP BY fr.flow_id, f.name
            ORDER BY total_runs DESC
            "#,
        )
        .bind(ws_id)
        .fetch_all(&self.pg_pool)
        .await
        .map_err(|e| Status::internal(format!("Database error: {}", e)))?;

        Ok(rows
            .into_iter()
            .map(|row| {
                let total_runs: i64 = row.get("total_runs");
                let successful_runs: i64 = row.get("successful_runs");
                let failed_runs: i64 = row.get("failed_runs");
                let success_rate = if total_runs > 0 {
                    (successful_runs as f64 / total_runs as f64) * 100.0
                } else {
                    0.0
                };

                let flow_id = row
                    .try_get::<Option<Uuid>, _>("flow_id")
                    .ok()
                    .flatten()
                    .map(|v| v.to_string())
                    .unwrap_or_default();

                let last_run = row
                    .try_get::<Option<DateTime<Utc>>, _>("last_run")
                    .ok()
                    .flatten()
                    .map(|v| v.to_rfc3339())
                    .unwrap_or_default();

                FlowMetric {
                    flow_id,
                    flow_name: row.get::<String, _>("flow_name"),
                    total_runs,
                    successful_runs,
                    failed_runs,
                    success_rate,
                    average_duration: row.get::<f64, _>("average_duration"),
                    last_run,
                }
            })
            .collect())
    }

    async fn fetch_recent_errors(&self, ws_id: Uuid, limit: i32) -> Result<Vec<RecentError>, Status> {
        let safe_limit = if limit <= 0 { 20 } else { limit.min(200) };
        let rows = sqlx::query(
            r#"
            SELECT
                flow_id,
                COALESCE(error_message, 'Flow execution failed') AS error,
                COALESCE(completed_at, started_at) AS ts
            FROM flow_runs
            WHERE workspace_id = $1
              AND status = 'failed'
            ORDER BY ts DESC
            LIMIT $2
            "#,
        )
        .bind(ws_id)
        .bind(safe_limit as i64)
        .fetch_all(&self.pg_pool)
        .await
        .map_err(|e| Status::internal(format!("Database error: {}", e)))?;

        Ok(rows
            .into_iter()
            .map(|row| {
                let flow_id = row
                    .try_get::<Option<Uuid>, _>("flow_id")
                    .ok()
                    .flatten()
                    .map(|v| v.to_string())
                    .unwrap_or_default();
                let ts: DateTime<Utc> = row.get("ts");
                RecentError {
                    flow_id,
                    error: row.get::<String, _>("error"),
                    timestamp: ts.to_rfc3339(),
                }
            })
            .collect())
    }
}

#[tonic::async_trait]
impl PulseCoreService for MyPulseCoreService {
    async fn get_workspace_analytics(
        &self,
        request: Request<WorkspaceAnalyticsRequest>,
    ) -> Result<Response<WorkspaceAnalyticsResponse>, Status> {
        let req = request.into_inner();
        let ws_id = Uuid::parse_str(&req.workspace_id)
            .map_err(|_| Status::invalid_argument("Invalid workspace ID"))?;

        let period = match req.period.trim() {
            "day" | "week" | "month" => req.period.trim().to_string(),
            _ => "week".to_string(),
        };

        let since = match period.as_str() {
            "day" => Utc::now() - Duration::days(1),
            "month" => Utc::now() - Duration::days(30),
            _ => Utc::now() - Duration::days(7),
        };

        let agg = sqlx::query(
            r#"
            SELECT
                COUNT(*)::BIGINT AS total_flow_runs,
                COUNT(*) FILTER (WHERE status = 'success')::BIGINT AS successful_flows,
                COUNT(*) FILTER (WHERE status = 'failed')::BIGINT AS failed_flows,
                COALESCE(AVG(duration_ms), 0)::FLOAT8 AS average_flow_duration
            FROM flow_runs
            WHERE workspace_id = $1 AND started_at >= $2
            "#,
        )
        .bind(ws_id)
        .bind(since)
        .fetch_one(&self.pg_pool)
        .await
        .map_err(|e| Status::internal(format!("Database error: {}", e)))?;

        let events_row = sqlx::query(
            r#"
            SELECT COALESCE(SUM(event_count), 0)::BIGINT AS total_events
            FROM usage_counters
            WHERE workspace_id = $1
              AND usage_month >= $2::date
            "#,
        )
        .bind(ws_id)
        .bind(since.date_naive())
        .fetch_one(&self.pg_pool)
        .await
        .map_err(|e| Status::internal(format!("Database error: {}", e)))?;

        let flow_metrics = self.fetch_flow_metrics(ws_id).await?;
        let recent_errors = self.fetch_recent_errors(ws_id, 10).await?;

        Ok(Response::new(WorkspaceAnalyticsResponse {
            workspace_id: req.workspace_id,
            period,
            total_events: events_row.get::<i64, _>("total_events"),
            total_flow_runs: agg.get::<i64, _>("total_flow_runs"),
            successful_flows: agg.get::<i64, _>("successful_flows"),
            failed_flows: agg.get::<i64, _>("failed_flows"),
            average_flow_duration: agg.get::<f64, _>("average_flow_duration"),
            connector_metrics: Vec::new(),
            flow_metrics,
            top_connectors: Vec::new(),
            recent_errors,
        }))
    }

    async fn get_flow_metrics(
        &self,
        request: Request<WorkspaceMetricsRequest>,
    ) -> Result<Response<FlowMetricsResponse>, Status> {
        let req = request.into_inner();
        let ws_id = Uuid::parse_str(&req.workspace_id)
            .map_err(|_| Status::invalid_argument("Invalid workspace ID"))?;

        Ok(Response::new(FlowMetricsResponse {
            metrics: self.fetch_flow_metrics(ws_id).await?,
        }))
    }

    async fn get_connector_metrics(
        &self,
        _request: Request<WorkspaceMetricsRequest>,
    ) -> Result<Response<ConnectorMetricsResponse>, Status> {
        Ok(Response::new(ConnectorMetricsResponse {
            metrics: Vec::<ConnectorMetric>::new(),
        }))
    }

    async fn get_flow_run_stats(
        &self,
        request: Request<FlowRunStatsRequest>,
    ) -> Result<Response<FlowRunStatsResponse>, Status> {
        let req = request.into_inner();
        let ws_id = Uuid::parse_str(&req.workspace_id)
            .map_err(|_| Status::invalid_argument("Invalid workspace ID"))?;
        let limit = if req.limit <= 0 { 10 } else { req.limit.min(200) } as i64;

        let flow_filter = if req.flow_id.trim().is_empty() {
            None
        } else {
            Some(
                Uuid::parse_str(req.flow_id.trim())
                    .map_err(|_| Status::invalid_argument("Invalid flow ID"))?,
            )
        };

        let rows = if let Some(flow_id) = flow_filter {
            sqlx::query(
                r#"
                SELECT id, flow_id, status, duration_ms, error_message, started_at, completed_at
                FROM flow_runs
                WHERE workspace_id = $1 AND flow_id = $2
                ORDER BY started_at DESC
                LIMIT $3
                "#,
            )
            .bind(ws_id)
            .bind(flow_id)
            .bind(limit)
            .fetch_all(&self.pg_pool)
            .await
            .map_err(|e| Status::internal(format!("Database error: {}", e)))?
        } else {
            sqlx::query(
                r#"
                SELECT id, flow_id, status, duration_ms, error_message, started_at, completed_at
                FROM flow_runs
                WHERE workspace_id = $1
                ORDER BY started_at DESC
                LIMIT $2
                "#,
            )
            .bind(ws_id)
            .bind(limit)
            .fetch_all(&self.pg_pool)
            .await
            .map_err(|e| Status::internal(format!("Database error: {}", e)))?
        };

        let runs: Vec<FlowRunStat> = rows
            .into_iter()
            .map(|row| {
                let started_at: DateTime<Utc> = row.get("started_at");
                let completed_at = row
                    .try_get::<Option<DateTime<Utc>>, _>("completed_at")
                    .ok()
                    .flatten()
                    .map(|v| v.to_rfc3339())
                    .unwrap_or_default();
                FlowRunStat {
                    run_id: row.get::<Uuid, _>("id").to_string(),
                    flow_id: row
                        .try_get::<Option<Uuid>, _>("flow_id")
                        .ok()
                        .flatten()
                        .map(|v| v.to_string())
                        .unwrap_or_default(),
                    status: row.get::<String, _>("status"),
                    duration_ms: row.try_get::<Option<i32>, _>("duration_ms").ok().flatten().unwrap_or(0),
                    error_message: row.try_get::<Option<String>, _>("error_message").ok().flatten().unwrap_or_default(),
                    started_at: started_at.to_rfc3339(),
                    completed_at,
                }
            })
            .collect();

        let stats_row = if let Some(flow_id) = flow_filter {
            sqlx::query(
                r#"
                SELECT
                    COUNT(*)::BIGINT AS total_runs,
                    COUNT(*) FILTER (WHERE status = 'success')::BIGINT AS successful_runs,
                    COUNT(*) FILTER (WHERE status = 'failed')::BIGINT AS failed_runs,
                    COALESCE(AVG(duration_ms), 0)::FLOAT8 AS average_duration_ms
                FROM flow_runs
                WHERE workspace_id = $1 AND flow_id = $2
                "#,
            )
            .bind(ws_id)
            .bind(flow_id)
            .fetch_one(&self.pg_pool)
            .await
            .map_err(|e| Status::internal(format!("Database error: {}", e)))?
        } else {
            sqlx::query(
                r#"
                SELECT
                    COUNT(*)::BIGINT AS total_runs,
                    COUNT(*) FILTER (WHERE status = 'success')::BIGINT AS successful_runs,
                    COUNT(*) FILTER (WHERE status = 'failed')::BIGINT AS failed_runs,
                    COALESCE(AVG(duration_ms), 0)::FLOAT8 AS average_duration_ms
                FROM flow_runs
                WHERE workspace_id = $1
                "#,
            )
            .bind(ws_id)
            .fetch_one(&self.pg_pool)
            .await
            .map_err(|e| Status::internal(format!("Database error: {}", e)))?
        };

        Ok(Response::new(FlowRunStatsResponse {
            runs,
            statistics: Some(FlowRunStatistics {
                total_runs: stats_row.get::<i64, _>("total_runs"),
                successful_runs: stats_row.get::<i64, _>("successful_runs"),
                failed_runs: stats_row.get::<i64, _>("failed_runs"),
                average_duration_ms: stats_row.get::<f64, _>("average_duration_ms"),
            }),
        }))
    }

    async fn get_recent_errors(
        &self,
        request: Request<RecentErrorsRequest>,
    ) -> Result<Response<RecentErrorsResponse>, Status> {
        let req = request.into_inner();
        let ws_id = Uuid::parse_str(&req.workspace_id)
            .map_err(|_| Status::invalid_argument("Invalid workspace ID"))?;

        Ok(Response::new(RecentErrorsResponse {
            errors: self.fetch_recent_errors(ws_id, req.limit).await?,
        }))
    }

    async fn get_event_metrics(
        &self,
        request: Request<EventMetricsRequest>,
    ) -> Result<Response<EventMetricsResponse>, Status> {
        let req = request.into_inner();
        let ws_id = Uuid::parse_str(&req.workspace_id)
            .map_err(|_| Status::invalid_argument("Invalid workspace ID"))?;
        let limit = if req.limit <= 0 { 30 } else { req.limit.min(365) } as i64;

        let rows = sqlx::query(
            r#"
            SELECT usage_month, event_count
            FROM usage_counters
            WHERE workspace_id = $1
            ORDER BY usage_month DESC
            LIMIT $2
            "#,
        )
        .bind(ws_id)
        .bind(limit)
        .fetch_all(&self.pg_pool)
        .await
        .map_err(|e| Status::internal(format!("Database error: {}", e)))?;

        let data = rows
            .into_iter()
            .map(|row| EventMetricPoint {
                bucket: row.get::<chrono::NaiveDate, _>("usage_month").to_string(),
                count: row.get::<i64, _>("event_count"),
            })
            .collect();

        Ok(Response::new(EventMetricsResponse { data }))
    }

    async fn generate_flow_from_prompt(
        &self,
        request: Request<GenerateFlowRequest>,
    ) -> Result<Response<GenerateFlowResponse>, Status> {
        let req = request.into_inner();
        
        match core_ai::flow_builder::generate_flow_from_prompt(&req.prompt).await {
            Ok(flow_json) => {
                Ok(Response::new(GenerateFlowResponse {
                    flow_json: flow_json.to_string(),
                    success: true,
                    error_message: String::new(),
                }))
            },
            Err(e) => {
                Ok(Response::new(GenerateFlowResponse {
                    flow_json: String::new(),
                    success: false,
                    error_message: e.to_string(),
                }))
            }
        }
    }

    async fn analyze_failure(
        &self,
        request: Request<AnalyzeFailureRequest>,
    ) -> Result<Response<AnalyzeFailureResponse>, Status> {
        let req = request.into_inner();
        
        match core_ai::failure_analysis::analyze_failure(&req.error_log).await {
            Ok(analysis) => {
                Ok(Response::new(AnalyzeFailureResponse {
                    success: true,
                    analysis: analysis,
                }))
            },
            Err(e) => {
                Ok(Response::new(AnalyzeFailureResponse {
                    success: false,
                    analysis: e.to_string(),
                }))
            }
        }
    }

    async fn list_market_templates(
        &self,
        request: Request<ListMarketTemplatesRequest>,
    ) -> Result<Response<ListMarketTemplatesResponse>, Status> {
        let req = request.into_inner();
        let category = req.category.trim();
        
        let templates = if category.is_empty() {
             let rows = sqlx::query!(
                 "SELECT id, title, description, price_cents FROM market_templates WHERE published = TRUE ORDER BY created_at DESC LIMIT 50"
             ).fetch_all(&self.pg_pool).await.map_err(|e| Status::internal(format!("Database error: {}", e)))?;
             rows.into_iter().map(|row| MarketTemplate {
                 id: row.id.to_string(),
                 title: row.title,
                 description: row.description.unwrap_or_default(),
                 price_cents: row.price_cents as i32,
             }).collect::<Vec<_>>()
        } else {
             let rows = sqlx::query!(
                 "SELECT id, title, description, price_cents FROM market_templates WHERE published = TRUE AND category = $1 ORDER BY created_at DESC LIMIT 50",
                 category
             ).fetch_all(&self.pg_pool).await.map_err(|e| Status::internal(format!("Database error: {}", e)))?;
             rows.into_iter().map(|row| MarketTemplate {
                 id: row.id.to_string(),
                 title: row.title,
                 description: row.description.unwrap_or_default(),
                 price_cents: row.price_cents as i32,
             }).collect::<Vec<_>>()
        };
        
        Ok(Response::new(ListMarketTemplatesResponse { templates }))
    }

    async fn get_market_template(
        &self,
        request: Request<GetMarketTemplateRequest>,
    ) -> Result<Response<GetMarketTemplateResponse>, Status> {
        let req = request.into_inner();
        let template_id = Uuid::parse_str(req.template_id.trim())
            .map_err(|_| Status::invalid_argument("Invalid template ID"))?;

        let row = sqlx::query(
            r#"
            SELECT id, creator_workspace_id, title, description, flow_definition, price_cents, category, published, rating_avg
            FROM market_templates
            WHERE id = $1
            "#,
        )
        .bind(template_id)
        .fetch_optional(&self.pg_pool)
        .await
        .map_err(|e| Status::internal(format!("Database error: {}", e)))?;

        let Some(row) = row else {
            return Err(Status::not_found("Template not found"));
        };

        let flow_definition: serde_json::Value = row.get("flow_definition");
        let rating_avg = row.try_get::<Option<f64>, _>("rating_avg").ok().flatten().unwrap_or(0.0);

        Ok(Response::new(GetMarketTemplateResponse {
            id: row.get::<Uuid, _>("id").to_string(),
            creator_workspace_id: row
                .try_get::<Option<Uuid>, _>("creator_workspace_id")
                .ok()
                .flatten()
                .map(|value| value.to_string())
                .unwrap_or_default(),
            title: row.get::<String, _>("title"),
            description: row.try_get::<Option<String>, _>("description").ok().flatten().unwrap_or_default(),
            flow_definition_json: flow_definition.to_string(),
            price_cents: row.get::<i32, _>("price_cents"),
            category: row.try_get::<Option<String>, _>("category").ok().flatten().unwrap_or_default(),
            published: row.get::<bool, _>("published"),
            rating_avg,
        }))
    }

    async fn publish_market_template(
        &self,
        request: Request<PublishMarketTemplateRequest>,
    ) -> Result<Response<PublishMarketTemplateResponse>, Status> {
        let req = request.into_inner();
        let creator_workspace_id = if req.creator_workspace_id.trim().is_empty() {
            None
        } else {
            Some(
                Uuid::parse_str(req.creator_workspace_id.trim())
                    .map_err(|_| Status::invalid_argument("Invalid creator workspace ID"))?,
            )
        };

        let title = req.title.trim();
        if title.is_empty() {
            return Err(Status::invalid_argument("Title is required"));
        }

        let flow_definition: serde_json::Value = serde_json::from_str(req.flow_definition_json.trim())
            .map_err(|_| Status::invalid_argument("flow_definition_json must be valid JSON"))?;

        let template_id = Uuid::new_v4();
        let category = req.category.trim();
        let description = if req.description.trim().is_empty() { None } else { Some(req.description.trim().to_string()) };

        sqlx::query(
            r#"
            INSERT INTO market_templates (
                id,
                creator_workspace_id,
                title,
                description,
                flow_definition,
                price_cents,
                category,
                published
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE)
            "#,
        )
        .bind(template_id)
        .bind(creator_workspace_id)
        .bind(title)
        .bind(description)
        .bind(flow_definition)
        .bind(req.price_cents)
        .bind(if category.is_empty() { None::<String> } else { Some(category.to_string()) })
        .execute(&self.pg_pool)
        .await
        .map_err(|e| Status::internal(format!("Database error: {}", e)))?;

        let review_payload = serde_json::json!({
            "template_id": template_id,
            "creator_workspace_id": creator_workspace_id,
            "title": title,
            "price_cents": req.price_cents,
            "category": if category.is_empty() { serde_json::Value::Null } else { serde_json::Value::String(category.to_string()) },
            "queue": "market_template_review",
            "submitted_at": Utc::now().to_rfc3339(),
        });
        let _ = self.queue_market_review(review_payload).await;

        Ok(Response::new(PublishMarketTemplateResponse {
            success: true,
            template_id: template_id.to_string(),
            queued_for_review: true,
            message: "Template submitted for review".to_string(),
        }))
    }

    async fn rate_market_template(
        &self,
        request: Request<RateMarketTemplateRequest>,
    ) -> Result<Response<RateMarketTemplateResponse>, Status> {
        let req = request.into_inner();
        let template_id = Uuid::parse_str(req.template_id.trim())
            .map_err(|_| Status::invalid_argument("Invalid template ID"))?;
        let user_id = Uuid::parse_str(req.user_id.trim())
            .map_err(|_| Status::invalid_argument("Invalid user ID"))?;

        if !(1..=5).contains(&req.rating) {
            return Err(Status::invalid_argument("Rating must be between 1 and 5"));
        }

        let mut tx = self.pg_pool.begin().await
            .map_err(|e| Status::internal(format!("Database error: {}", e)))?;

        sqlx::query(
            r#"
            INSERT INTO template_reviews (template_id, user_id, rating, review_text)
            VALUES ($1, $2, $3, $4)
            "#,
        )
        .bind(template_id)
        .bind(user_id)
        .bind(req.rating)
        .bind(if req.review_text.trim().is_empty() { None::<String> } else { Some(req.review_text.trim().to_string()) })
        .execute(&mut *tx)
        .await
        .map_err(|e| Status::internal(format!("Database error: {}", e)))?;

        let row = sqlx::query(
            r#"
            SELECT COALESCE(AVG(rating)::FLOAT8, 0) AS rating_avg, COUNT(*)::BIGINT AS review_count
            FROM template_reviews
            WHERE template_id = $1
            "#,
        )
        .bind(template_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| Status::internal(format!("Database error: {}", e)))?;

        let rating_avg = row.get::<f64, _>("rating_avg");
        let review_count = row.get::<i64, _>("review_count");

        sqlx::query(
            r#"
            UPDATE market_templates
            SET rating_avg = $1
            WHERE id = $2
            "#,
        )
        .bind(rating_avg)
        .bind(template_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| Status::internal(format!("Database error: {}", e)))?;

        tx.commit().await.map_err(|e| Status::internal(format!("Database error: {}", e)))?;

        Ok(Response::new(RateMarketTemplateResponse {
            success: true,
            template_id: template_id.to_string(),
            rating_avg,
            review_count: review_count as i32,
        }))
    }

    async fn install_template(
        &self,
        request: Request<InstallTemplateRequest>,
    ) -> Result<Response<InstallTemplateResponse>, Status> {
        let req = request.into_inner();
        
        let workspace_id = Uuid::parse_str(&req.workspace_id)
            .map_err(|_| Status::invalid_argument("Invalid workspace ID"))?;
            
        let template_id = Uuid::parse_str(&req.template_id)
            .map_err(|_| Status::invalid_argument("Invalid template ID"))?;
            
        let template = sqlx::query!(
            "SELECT title, description, flow_definition FROM market_templates WHERE id = $1 AND published = TRUE",
            template_id
        )
        .fetch_optional(&self.pg_pool)
        .await
        .map_err(|e| Status::internal(format!("DB Error: {}", e)))?;
        
        let template = match template {
            Some(t) => t,
            None => return Err(Status::not_found("Template not found")),
        };
        
        let new_flow_id = Uuid::new_v4();
        
        sqlx::query!(
            "INSERT INTO flows (id, workspace_id, name, description, definition, enabled) VALUES ($1, $2, $3, $4, $5, false)",
            new_flow_id, workspace_id, template.title, template.description, template.flow_definition
        )
        .execute(&self.pg_pool)
        .await
        .map_err(|e| Status::internal(format!("DB insertion error: {}", e)))?;
        
        let _ = sqlx::query!("UPDATE market_templates SET install_count = install_count + 1 WHERE id = $1", template_id)
            .execute(&self.pg_pool)
            .await;

        Ok(Response::new(InstallTemplateResponse {
            success: true,
            new_flow_id: Uuid::new_v4().to_string(),
            message: format!("Template installed successfully (Stub)"),
        }))
    }

    async fn trigger_flow(
        &self,
        request: Request<TriggerFlowRequest>,
    ) -> Result<Response<TriggerFlowResponse>, Status> {
        let req = request.into_inner();
        println!(
            "📩 gRPC TriggerFlow called for workspace: {}, flow: {}",
            req.workspace_id, req.flow_id
        );

        let run_id = Uuid::new_v4().to_string();

        let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379/".to_string());
        let client = redis::Client::open(redis_url.clone())
            .map_err(|_| Status::internal("Failed to create Redis client"))?;
        let mut con = client
            .get_multiplexed_async_connection()
            .await
            .map_err(|_| Status::internal("Failed to connect Redis"))?;

        let payload = serde_json::json!({
            "id": run_id,
            "tenant_id": req.workspace_id,
            "event_type": "api_trigger",
            "timestamp": "2024-01-01T00:00:00Z",
            "schema_version": "1.0",
            "data": req.payload_json
        });

        let _: () = con
            .xadd(
                "stream:events:global",
                "*",
                &[("payload", payload.to_string())],
            )
            .await
            .map_err(|_| Status::internal("Failed to publish event"))?;

        Ok(Response::new(TriggerFlowResponse {
            success: true,
            run_id,
            message: "Flow dispatched to global stream".into(),
        }))
    }

    async fn set_workspace_secret(
        &self,
        request: Request<SetWorkspaceSecretRequest>,
    ) -> Result<Response<SetWorkspaceSecretResponse>, Status> {
        let req = request.into_inner();
        let ws_id = Uuid::parse_str(&req.workspace_id)
            .map_err(|_| Status::invalid_argument("Invalid workspace ID"))?;
        let connector_id = req.secret_name.trim().to_uppercase();
        if connector_id.is_empty() {
            return Err(Status::invalid_argument("Secret name is required"));
        }

        let workspace_exists = sqlx::query_scalar!(
            "SELECT EXISTS (SELECT 1 FROM workspaces WHERE id = $1) AS \"exists!\"",
            ws_id
        )
        .fetch_one(&self.pg_pool)
        .await
        .map_err(|_| Status::internal("Database read failed"))?;

        if !workspace_exists {
            return Err(Status::not_found("Workspace not found"));
        }

        let (encrypted_blob, nonce) = self.vault.encrypt(&req.secret_value).map_err(|e| {
            Status::internal(format!("Encryption error: {:?}", e))
        })?;

        let res = sqlx::query!(
            r#"
            INSERT INTO credentials (workspace_id, connector_id, encrypted_blob, nonce)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (workspace_id, connector_id) DO UPDATE SET encrypted_blob = EXCLUDED.encrypted_blob, nonce = EXCLUDED.nonce, updated_at = NOW()
            "#,
            ws_id,
            connector_id,
            encrypted_blob,
            nonce
        )
        .execute(&self.pg_pool)
        .await;

        match res {
            Ok(_) => Ok(Response::new(SetWorkspaceSecretResponse {
                success: true,
                message: format!("Secret {} configured successfully", connector_id),
            })),
            Err(e) => {
                println!("DB ERROR: {:?}", e);
                Err(Status::internal("Database insert failed"))
            }
        }
    }

    async fn verify_webhook_signature(
        &self,
        request: Request<VerifyWebhookRequest>,
    ) -> Result<Response<VerifyWebhookResponse>, Status> {
        let req = request.into_inner();

        let ws_id = Uuid::parse_str(&req.workspace_id)
            .map_err(|_| Status::invalid_argument("Invalid workspace ID"))?;

        let row = sqlx::query_as::<_, WorkspaceSecret>(
            "SELECT id, workspace_id, connector_id, encrypted_blob, nonce, created_at, updated_at FROM credentials WHERE workspace_id = $1 AND connector_id = 'WEBHOOK_SECRET'"
        )
        .bind(ws_id)
        .fetch_optional(&self.pg_pool)
        .await;

        let row = match row {
            Ok(Some(r)) => r,
            Ok(None) => return Ok(Response::new(VerifyWebhookResponse { is_valid: false })),
            Err(_) => return Err(Status::internal("DB error")),
        };

        let plain_secret = match self.vault.decrypt(&row.encrypted_blob, &row.nonce) {
            Ok(s) => s,
            Err(_) => return Err(Status::internal("Decryption error")),
        };

        let is_valid = self.vault.verify_webhook_signature(
            &req.raw_payload,
            &req.provided_signature,
            &plain_secret,
        );

        Ok(Response::new(VerifyWebhookResponse { is_valid }))
    }

    async fn detect_patterns(
        &self,
        request: Request<DetectPatternsRequest>,
    ) -> Result<Response<DetectPatternsResponse>, Status> {
        let req = request.into_inner();
        
        // STUB: Pattern detection RPC - Phase 3 will implement actual detection
        // For now, return empty patterns from database if they exist
        let ws_id = Uuid::parse_str(&req.workspace_id)
            .map_err(|_| Status::invalid_argument("Invalid workspace ID"))?;

        let rows = sqlx::query(
            r#"
            SELECT id, workspace_id, pattern_type, description, confidence, frequency,
                   events_involved, suggested_trigger, suggested_actions, suggested_flow, detected_at
            FROM ai_detected_patterns
            WHERE workspace_id = $1
            ORDER BY detected_at DESC
            LIMIT 50
            "#,
        )
        .bind(ws_id)
        .fetch_all(&self.pg_pool)
        .await
        .map_err(|e| Status::internal(format!("Database error: {}", e)))?;

        let patterns = rows.iter().map(|row| {
            let detected_at: chrono::DateTime<chrono::Utc> = row.get("detected_at");
            DetectedPattern {
                id: row.get::<String, _>("id"),
                workspace_id: row.get::<uuid::Uuid, _>("workspace_id").to_string(),
                pattern_type: row.get::<String, _>("pattern_type"),
                description: row.get::<String, _>("description"),
                confidence: row.get::<f32, _>("confidence"),
                frequency: row.get::<String, _>("frequency"),
                suggested_trigger: row.get::<Option<String>, _>("suggested_trigger").unwrap_or_default(),
                suggested_actions_json: row.get::<serde_json::Value, _>("suggested_actions").to_string(),
                suggested_flow_json: row.get::<serde_json::Value, _>("suggested_flow").to_string(),
                detected_at_unix: detected_at.timestamp(),
            }
        }).collect();

        Ok(Response::new(DetectPatternsResponse {
            success: true,
            patterns,
            error_message: String::new(),
        }))
    }
}
