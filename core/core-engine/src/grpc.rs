use core_proto::pulsecore::pulse_core_service_server::PulseCoreService;
use core_proto::pulsecore::{TriggerFlowRequest, TriggerFlowResponse};
use tonic::{Request, Response, Status};
use redis::AsyncCommands;
use uuid::Uuid;

#[derive(Clone)]
pub struct MyPulseCoreService {
    #[allow(dead_code)]
    pg_pool: sqlx::PgPool,
}

impl MyPulseCoreService {
    pub fn new(pg_pool: sqlx::PgPool) -> Self {
        Self { pg_pool }
    }
}

#[tonic::async_trait]
impl PulseCoreService for MyPulseCoreService {
    async fn trigger_flow(
        &self,
        request: Request<TriggerFlowRequest>,
    ) -> Result<Response<TriggerFlowResponse>, Status> {
        let req = request.into_inner();
        println!("📩 gRPC TriggerFlow called for workspace: {}, flow: {}", req.workspace_id, req.flow_id);
        
        let run_id = Uuid::new_v4().to_string();
        
        // Push event to Redis (assuming we want to simulate the gateway passing the flow trigger down)
        let redis_url = "redis://127.0.0.1:6379/";
        let client = redis::Client::open(redis_url).unwrap();
        let mut con = client.get_multiplexed_async_connection().await.unwrap();
        
        let payload = serde_json::json!({
            "id": run_id,
            "tenant_id": req.workspace_id,
            "event_type": "api_trigger",
            "timestamp": "2024-01-01T00:00:00Z",
            "schema_version": "1.0",
            "data": req.payload_json
        });
        
        let _: () = con.xadd(
            "stream:events:global",
            "*",
            &[("payload", payload.to_string())]
        ).await.unwrap();

        Ok(Response::new(TriggerFlowResponse {
            success: true,
            run_id,
            message: "Flow dispatched to global stream".into(),
        }))
    }
}
