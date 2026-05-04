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
    #[serde(default)]
    pub sub_flow_depth: Option<i32>,
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
    pub r#type: String, // "action", "condition", "loop", "parallel", "parallel_split", "merge", "sub_flow", "delay", "filter", "transform", "fork", etc.
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
    // Approval step configuration
    pub approval_config: Option<ApprovalStepConfig>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ApprovalStepConfig {
    pub title: String,
    pub description: Option<String>,
    pub timeout_hours: i32, // Auto-reject after N hours
    pub notification_channels: Vec<String>, // "slack", "email", "push"
    pub slack_channel: Option<String>,
    pub notify_emails: Option<Vec<String>>,
    pub approval_rules: Vec<ApprovalRule>,
    pub context_data: Option<Value>, // Custom data to include in approval request
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ApprovalRule {
    pub name: String,
    pub condition: Option<String>, // Rhai expression: e.g., "{{trigger.data.amount}} > 10000"
    pub required_approvers: i32,
    pub required_roles: Option<Vec<String>>, // e.g., ["CFO", "CEO"]
    pub fallback_email: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct RetryPolicy {
    pub max_retries: i32,
    pub initial_backoff_ms: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
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
    pub status: String, // "success", "failed", "skipped", "waiting"
    pub output: Value,
    pub error: Option<String>,
    pub duration_ms: i32,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct ApiKey {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub key_prefix: String,
    pub key_hash: String,
    pub name: String,
    pub description: Option<String>,
    pub is_active: bool,
    pub created_at: Option<DateTime<Utc>>,
    pub last_used_at: Option<DateTime<Utc>>,
    pub expires_at: Option<DateTime<Utc>>,
    pub scopes: Value, // JSON array of permission strings
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateApiKeyRequest {
    pub name: String,
    pub description: Option<String>,
    pub expires_at: Option<DateTime<Utc>>,
    pub scopes: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateApiKeyResponse {
    pub id: Uuid,
    pub name: String,
    pub key_prefix: String,
    pub key: String, // Full key (only returned on creation)
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ApiKeyResponse {
    pub id: Uuid,
    pub name: String,
    pub key_prefix: String,
    pub is_active: bool,
    pub created_at: Option<DateTime<Utc>>,
    pub last_used_at: Option<DateTime<Utc>>,
    pub expires_at: Option<DateTime<Utc>>,
    pub scopes: Value,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CredentialDependentFlow {
    pub flow_id: Uuid,
    pub flow_name: String,
    pub status: String, // "active" or "paused"
    pub created_at: Option<DateTime<Utc>>,
    pub last_executed_at: Option<DateTime<Utc>>,
    pub execution_count: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CredentialDependentsResponse {
    pub credential_id: Uuid,
    pub connector_id: String,
    pub total_flows: i64,
    pub active_flows: i64,
    pub flows: Vec<CredentialDependentFlow>,
}

#[derive(Debug, Serialize, Deserialize, Clone, FromRow)]
pub struct PendingApproval {
    pub id: Uuid,
    pub flow_run_id: Uuid,
    pub step_id: String,
    pub approval_token: Uuid,
    pub context_json: Value,
    pub expires_at: DateTime<Utc>,
    pub status: String, // "pending", "approved", "rejected", "expired"
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ApprovalDecisionRequest {
    pub token: Uuid,
    pub decision: String, // "approved" or "rejected"
    pub approver_id: Option<String>,
    pub approver_email: Option<String>,
    pub reason: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ApprovalDecisionResponse {
    pub success: bool,
    pub flow_run_id: Uuid,
    pub step_id: String,
    pub decision: String,
    pub message: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pulse_event_serialization() {
        let event = PulseEvent {
            id: Uuid::new_v4(),
            tenant_id: Uuid::new_v4(),
            source: Some("shopify".to_string()),
            event_type: "order.created".to_string(),
            data: serde_json::json!({"order_id": "123", "total": 99.99}),
            sub_flow_depth: None,
        };

        let json = serde_json::to_string(&event).unwrap();
        let deserialized: PulseEvent = serde_json::from_str(&json).unwrap();
        
        assert_eq!(event.event_type, deserialized.event_type);
        assert_eq!(event.source, deserialized.source);
    }

    #[test]
    fn test_trigger_definition_with_filters() {
        let trigger = TriggerDefinition {
            connector: "shopify".to_string(),
            event: "order.created".to_string(),
            filters: vec![
                FilterCondition {
                    field: "order.total".to_string(),
                    op: "gt".to_string(),
                    value: serde_json::json!(100),
                },
            ],
        };

        let json = serde_json::to_string(&trigger).unwrap();
        let deserialized: TriggerDefinition = serde_json::from_str(&json).unwrap();
        
        assert_eq!(deserialized.connector, "shopify");
        assert_eq!(deserialized.filters.len(), 1);
    }

    #[test]
    fn test_flow_step_creation() {
        let step = FlowStep {
            id: "step1".to_string(),
            r#type: "action".to_string(),
            connector: Some("slack".to_string()),
            action: Some("send_message".to_string()),
            input_mapping: Some(
                [
                    ("webhook_url".to_string(), "{{secrets.slack_webhook}}".to_string()),
                    ("text".to_string(), "Hello {{trigger.data.name}}".to_string()),
                ]
                .iter()
                .cloned()
                .collect(),
            ),
            depends_on: vec![],
            retry_policy: RetryPolicy {
                max_retries: 3,
                initial_backoff_ms: 1000,
            },
            condition: None,
            script_language: None,
            code: None,
            loop_items: None,
            loop_variable_name: None,
            max_iterations: None,
            loop_condition: None,
            parallel_steps: None,
            sub_flow_id: None,
            sub_flow_input: None,
            filter_condition: None,
            transform_expr: None,
            delay_ms: None,
            approval_config: None,
        };

        assert_eq!(step.r#type, "action");
        assert_eq!(step.connector, Some("slack".to_string()));
        assert_eq!(step.retry_policy.max_retries, 3);
    }

    #[test]
    fn test_error_policy_defaults() {
        let policy = ErrorPolicy::default();
        assert_eq!(policy.on_failure, "");
        assert_eq!(policy.notify_email, None);
    }

    #[test]
    fn test_step_execution_result() {
        let result = StepExecutionResult {
            step_id: "step1".to_string(),
            status: "success".to_string(),
            output: serde_json::json!({"message_id": "abc123"}),
            error: None,
            duration_ms: 245,
        };

        assert_eq!(result.status, "success");
        assert_eq!(result.duration_ms, 245);
    }
}