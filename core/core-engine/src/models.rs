use serde::{Serialize, Deserialize};
use serde_json::Value;
use sqlx::FromRow;
use uuid::Uuid;
use std::collections::HashMap;

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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PulseEvent {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub source: Option<String>,
    pub event_type: String,
    pub data: Value,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TriggerDefinition {
    pub connector: String,
    pub event: String,
    #[serde(default)]
    pub filters: Vec<FilterCondition>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FilterCondition {
    pub field: String,
    pub op: String, // "eq", "gt", "lt", "contains", "regex", etc.
    pub value: Value,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FlowStep {
    pub id: String,
    pub r#type: String, // "action", "condition", "loop", etc.
    pub connector: Option<String>,
    pub action: Option<String>,
    pub input_mapping: Option<HashMap<String, String>>, // Template expressions like "{{trigger.data.email}}"
    pub depends_on: Vec<String>, // Step IDs this depends on
    #[serde(default)]
    pub retry_policy: RetryPolicy,
    pub condition: Option<String>, // Rhai expression for conditional execution
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct RetryPolicy {
    pub max_retries: i32,
    pub initial_backoff_ms: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FlowDefinition {
    pub id: String,
    pub name: String,
    pub trigger: TriggerDefinition,
    pub steps: Vec<FlowStep>,
    #[serde(default)]
    pub error_policy: ErrorPolicy,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ErrorPolicy {
    pub on_failure: String, // "notify_owner", "retry", "ignore"
    pub notify_email: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateFlowRequest {
    pub workspace_id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub definition: Value, // This is the FlowDefinition JSON
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

#[derive(Debug, Serialize, Deserialize)]
pub struct FlowRunLog {
    pub run_id: Uuid,
    pub flow_id: Uuid,
    pub workspace_id: Uuid,
    pub status: String, // "running", "success", "failed", "partial"
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub duration_ms: Option<i32>,
    pub steps_log: Value, // JSON array of step execution details
    pub error_message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StepExecutionResult {
    pub step_id: String,
    pub status: String, // "success", "failed", "skipped"
    pub output: Value,
    pub error: Option<String>,
    pub duration_ms: i32,
}
