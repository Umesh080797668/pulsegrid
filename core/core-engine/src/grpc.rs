use crate::models::WorkspaceSecret;
use core_proto::pulsecore::pulse_core_service_server::PulseCoreService;
use core_proto::pulsecore::{
    SetWorkspaceSecretRequest, SetWorkspaceSecretResponse, TriggerFlowRequest, TriggerFlowResponse,
    VerifyWebhookRequest, VerifyWebhookResponse, GenerateFlowRequest, GenerateFlowResponse,
    AnalyzeFailureRequest, AnalyzeFailureResponse, ListMarketTemplatesRequest,
    ListMarketTemplatesResponse, InstallTemplateRequest, InstallTemplateResponse, MarketTemplate
};
use core_vault::Vault;
use redis::AsyncCommands;
use sqlx::PgPool;
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
        let vault = std::sync::Arc::new(Vault::new(&master_key));
        Self { pg_pool, vault }
    }
}

#[tonic::async_trait]
impl PulseCoreService for MyPulseCoreService {
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
}
