use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::FromRow;
use std::collections::HashMap;
use uuid::Uuid;

use chrono::{DateTime, Utc};

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct WorkspaceSecret {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub connector_id: String,
    pub encrypted_blob: Vec<u8>,
    pub nonce: Vec<u8>,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpsertWorkspaceSecretRequest {
    pub name: String,
    pub value: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WorkspaceSecretSummary {
    pub name: String,
    pub updated_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FlowRunResponse {
    pub id: Uuid,
    pub flow_id: Option<Uuid>,
    pub workspace_id: Uuid,
    pub status: String,
    pub trigger_event_id: Option<Uuid>,
    pub started_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub duration_ms: Option<i32>,
    pub steps_log: Option<Value>,
    pub error_message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateWorkspaceRequest {
    pub name: String,
    pub slug: Option<String>,
    pub owner_user_id: Uuid,
    pub settings: Option<Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WorkspaceResponse {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub plan: String,
    pub owner_user_id: Uuid,
    pub settings: Value,
    pub created_at: Option<DateTime<Utc>>,
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
    pub r#type: String, // "action", "condition", "loop", "parallel", "sub_flow", "delay", "filter", "transform", "fork", etc.
    pub connector: Option<String>,
    pub action: Option<String>,
    pub input_mapping: Option<HashMap<String, String>>, // Template expressions like "{{trigger.data.email}}"
    pub depends_on: Vec<String>,                        // Step IDs this depends on
    #[serde(default)]
    pub retry_policy: RetryPolicy,
    pub condition: Option<String>, // Rhai expression for conditional execution
    pub script_language: Option<String>,
    pub code: Option<String>,
    // Loop configuration
    pub loop_items: Option<String>,          // Expression evaluating to array: "{{steps.previous.items}}"
    pub loop_variable_name: Option<String>,  // Variable name for each iteration (e.g., "item")
    pub max_iterations: Option<i32>,         // Safety limit to prevent infinite loops
    pub loop_condition: Option<String>,      // Optional condition to continue looping
    // Parallel configuration
    pub parallel_steps: Option<Vec<String>>, // Step IDs to execute in parallel
    // Sub-flow configuration
    pub sub_flow_id: Option<String>,         // Reference to another flow definition
    pub sub_flow_input: Option<String>,      // Expression for input to sub-flow
    // Filter/Transform/Fork/Delay configuration
    pub filter_condition: Option<String>,    // Condition for filter steps
    pub transform_expr: Option<String>,      // Expression for transform steps
    pub delay_ms: Option<i32>,               // Delay in milliseconds
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
pub struct UpdateFlowRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub definition: Option<Value>,
    pub enabled: Option<bool>,
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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StepExecutionResult {
    pub step_id: String,
    pub status: String, // "success", "failed", "skipped"
    pub output: Value,
    pub error: Option<String>,
    pub duration_ms: i32,
}
