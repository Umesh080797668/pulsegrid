use serde::{Serialize, Deserialize};
use serde_json::Value;
use sqlx::FromRow;
use uuid::Uuid;

use chrono::{DateTime, Utc};

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct WorkspaceSecret {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub secret_name: String,
    pub encrypted_secret: String,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PulseEvent {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub source: Option<String>,
    pub event_type: String,
    pub data: Value,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateFlowRequest {
    pub workspace_id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub definition: Value, // This is the Pipeline JSON
    pub created_by: Option<Uuid>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FlowResponse {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub definition: Value,
    pub enabled: bool,
    pub run_count: i64,
}
