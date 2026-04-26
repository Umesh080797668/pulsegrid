use crate::models::WorkspaceSecret;
use core_proto::pulsecore::pulse_core_service_server::PulseCoreService;
use core_proto::pulsecore::{
    SetWorkspaceSecretRequest, SetWorkspaceSecretResponse, TriggerFlowRequest, TriggerFlowResponse,
    VerifyWebhookRequest, VerifyWebhookResponse,
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

        // Push event to Redis (assuming we want to simulate the gateway passing the flow trigger down)
        let redis_url = "redis://127.0.0.1:6379/";
        let client = redis::Client::open(redis_url)
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
        let secret_name = req.secret_name.trim().to_uppercase();
        if secret_name.is_empty() {
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

        let encrypted_secret = self
            .vault
            .encrypt(&req.secret_value)
            .map_err(|_| Status::internal("Encryption failed"))?;

        // Upsert the secret
        let res = sqlx::query!(
            r#"
            INSERT INTO workspace_secrets (workspace_id, secret_name, encrypted_secret)
            VALUES ($1, $2, $3)
            ON CONFLICT (workspace_id, secret_name) DO UPDATE SET encrypted_secret = EXCLUDED.encrypted_secret, updated_at = NOW()
            "#,
            ws_id,
            secret_name,
            encrypted_secret
        )
        .execute(&self.pg_pool)
        .await;

        match res {
            Ok(_) => Ok(Response::new(SetWorkspaceSecretResponse {
                success: true,
                message: format!("Secret {} configured successfully", secret_name),
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

        // Fetch encrypted secret, assuming WEBHOOK_SECRET is the name
        let row = sqlx::query_as::<_, WorkspaceSecret>(
            "SELECT id, workspace_id, secret_name, encrypted_secret, created_at, updated_at FROM workspace_secrets WHERE workspace_id = $1 AND secret_name = 'WEBHOOK_SECRET'"
        )
        .bind(ws_id)
        .fetch_optional(&self.pg_pool)
        .await;

        let secret = match row {
            Ok(Some(r)) => r.encrypted_secret,
            Ok(None) => return Ok(Response::new(VerifyWebhookResponse { is_valid: false })),
            Err(_) => return Err(Status::internal("DB error")),
        };

        let plain_secret = match self.vault.decrypt(&secret) {
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
