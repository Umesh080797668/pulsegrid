use crate::models::{ApprovalRule, ApprovalStepConfig, PendingApproval};
use chrono::{DateTime, Duration, Utc};
use redis::AsyncCommands;
use serde_json::{json, Value};
use sqlx::PgPool;
use std::collections::HashMap;
use uuid::Uuid;
pub struct ApprovalManager {
    pub pool: PgPool,
}

#[allow(dead_code)]
impl ApprovalManager {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Create a new approval request and store in database
    pub async fn create_approval(
        &self,
        flow_run_id: Uuid,
        step_id: String,
        config: &ApprovalStepConfig,
        step_outputs: &HashMap<String, Value>,
        event_data: &Value,
    ) -> Result<PendingApproval, String> {
        let approval_token = Uuid::new_v4();
        let expires_at = Utc::now() + Duration::hours(config.timeout_hours as i64);

        // Build context with current step outputs and event data
        let mut context = json!({
            "step_id": step_id,
            "flow_run_id": flow_run_id,
            "created_at": Utc::now().to_rfc3339(),
            "expires_at": expires_at.to_rfc3339(),
            "step_outputs": step_outputs,
            "event_data": event_data,
        });

        if let Some(custom_context) = &config.context_data {
            if let Value::Object(map) = &mut context {
                if let Value::Object(custom_map) = custom_context {
                    for (k, v) in custom_map {
                        map.insert(k.clone(), v.clone());
                    }
                }
            }
        }

        let query = sqlx::query_as::<_, PendingApproval>(
            r#"
            INSERT INTO pending_approvals 
            (flow_run_id, step_id, approval_token, context_json, expires_at, status, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, 'pending', NOW(), NOW())
            RETURNING *
            "#,
        )
        .bind(flow_run_id)
        .bind(&step_id)
        .bind(approval_token)
        .bind(context);

        query
            .fetch_one(&self.pool)
            .await
            .map_err(|e| format!("Failed to create approval: {}", e))
    }

    /// Get approval by token
    pub async fn get_approval_by_token(&self, token: Uuid) -> Result<Option<PendingApproval>, String> {
        sqlx::query_as::<_, PendingApproval>(
            "SELECT * FROM pending_approvals WHERE approval_token = $1"
        )
        .bind(token)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| format!("Failed to fetch approval: {}", e))
    }

    /// Update approval decision
    pub async fn update_approval_decision(
        &self,
        token: Uuid,
        decision: &str,
        reason: Option<String>,
    ) -> Result<PendingApproval, String> {
        let status = if decision.eq_ignore_ascii_case("approved") {
            "approved"
        } else {
            "rejected"
        };
        let context_update = json!({
            "decision": decision,
            "reason": reason,
            "decided_at": Utc::now().to_rfc3339(),
        });

        let query = sqlx::query_as::<_, PendingApproval>(
            r#"
            UPDATE pending_approvals
            SET status = $1, 
                context_json = jsonb_set(context_json, '{decision_info}', $2),
                updated_at = NOW()
            WHERE approval_token = $3
            RETURNING *
            "#,
        )
        .bind(status)
        .bind(context_update)
        .bind(token);

        query
            .fetch_one(&self.pool)
            .await
            .map_err(|e| format!("Failed to update approval: {}", e))
    }

    /// Get pending approvals for a flow run
    pub async fn get_pending_approvals(
        &self,
        flow_run_id: Uuid,
    ) -> Result<Vec<PendingApproval>, String> {
        sqlx::query_as::<_, PendingApproval>(
            "SELECT * FROM pending_approvals WHERE flow_run_id = $1 AND status = 'pending' ORDER BY created_at DESC"
        )
        .bind(flow_run_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| format!("Failed to fetch pending approvals: {}", e))
    }

    /// Mark approvals as expired
    pub async fn expire_old_approvals(&self) -> Result<u64, String> {
        let result = sqlx::query(
            r#"
            UPDATE pending_approvals
            SET status = 'expired', updated_at = NOW()
            WHERE status = 'pending' AND expires_at < NOW()
            "#,
        )
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to expire approvals: {}", e))?;

        Ok(result.rows_affected())
    }

    /// Store approval context in Redis for fast resume
    pub async fn cache_approval_context(
        &self,
        flow_run_id: Uuid,
        step_id: &str,
        context: &Value,
    ) -> Result<(), String> {
        let redis_url = std::env::var("REDIS_URL")
            .unwrap_or_else(|_| "redis://127.0.0.1:6379/".to_string());
        
        if let Ok(client) = redis::Client::open(redis_url) {
            if let Ok(mut con) = client.get_multiplexed_async_connection().await {
                let cache_key = format!("approval:{}:{}", flow_run_id, step_id);
                let context_json = serde_json::to_string(context)
                    .map_err(|e| format!("Failed to serialize context: {}", e))?;
                
                // Cache for 24 hours (86400 seconds)
                con.set_ex::<_, _, ()>(&cache_key, context_json, 86400)
                    .await
                    .map_err(|e| format!("Failed to cache approval context: {}", e))?;
            }
        }
        Ok(())
    }

    /// Get approval context from Redis
     #[allow(dead_code)]
    pub async fn get_approval_context(
        &self,
        flow_run_id: Uuid,
        step_id: &str,
    ) -> Result<Option<Value>, String> {
        let redis_url = std::env::var("REDIS_URL")
            .unwrap_or_else(|_| "redis://127.0.0.1:6379/".to_string());
        
        if let Ok(client) = redis::Client::open(redis_url) {
            if let Ok(mut con) = client.get_multiplexed_async_connection().await {
                let cache_key = format!("approval:{}:{}", flow_run_id, step_id);

                let context_json: Option<String> = con
                    .get(&cache_key)
                    .await
                    .map_err(|e| format!("Failed to fetch approval context from Redis: {e}"))?;

                if let Some(context_json) = context_json {
                    let context = serde_json::from_str::<Value>(&context_json)
                        .map_err(|e| format!("Failed to parse cached context: {}", e))?;
                    return Ok(Some(context));
                }
            }
        }
        Ok(None)
    }

    /// Evaluate routing rules to determine required approvers
     #[allow(dead_code)]
    pub fn evaluate_routing_rules(
        config: &ApprovalStepConfig,
        step_outputs: &HashMap<String, Value>,
        event_data: &Value,
    ) -> Result<Vec<ApprovalRule>, String> {
        let mut matching_rules = Vec::new();

        for rule in &config.approval_rules {
            let matches = if let Some(condition) = &rule.condition {
                Self::evaluate_condition(condition, step_outputs, event_data)?
            } else {
                true // No condition means always match
            };

            if matches {
                matching_rules.push(rule.clone());
            }
        }

        Ok(matching_rules)
    }

    /// Simple condition evaluator for approval routing
    fn evaluate_condition(
        condition: &str,
        step_outputs: &HashMap<String, Value>,
        event_data: &Value,
    ) -> Result<bool, String> {
        // Parse simple expressions like "{{trigger.data.amount}} > 10000"
        let mut expr = condition.to_string();

        // Replace template expressions
        loop {
            let Some(start) = expr.find("{{") else { break };
            let Some(end_rel) = expr[start + 2..].find("}}") else { break };
            let end = start + 2 + end_rel;
            let path = expr[start + 2..end].trim();

            let value = if let Some(field) = path.strip_prefix("trigger.data.") {
                Self::get_field_value(event_data, field)
                    .and_then(|v| v.as_f64())
                    .unwrap_or(0.0)
            } else if let Some((step_id, field)) = path.split_once('.') {
                step_outputs
                    .get(step_id)
                    .and_then(|v| Self::get_field_value(v, field))
                    .and_then(|v| v.as_f64())
                    .unwrap_or(0.0)
            } else {
                0.0
            };

            expr.replace_range(start..end + 2, &value.to_string());
        }

        // Simple evaluation of basic expressions
        if expr.contains('>') {
            if let Some((left, right)) = expr.split_once('>') {
                let l = left.trim().parse::<f64>().unwrap_or(0.0);
                let r = right.trim().parse::<f64>().unwrap_or(0.0);
                return Ok(l > r);
            }
        }

        if expr.contains('<') {
            if let Some((left, right)) = expr.split_once('<') {
                let l = left.trim().parse::<f64>().unwrap_or(0.0);
                let r = right.trim().parse::<f64>().unwrap_or(0.0);
                return Ok(l < r);
            }
        }

        if expr.contains(">=") {
            if let Some((left, right)) = expr.split_once(">=") {
                let l = left.trim().parse::<f64>().unwrap_or(0.0);
                let r = right.trim().parse::<f64>().unwrap_or(0.0);
                return Ok(l >= r);
            }
        }

        if expr.contains("<=") {
            if let Some((left, right)) = expr.split_once("<=") {
                let l = left.trim().parse::<f64>().unwrap_or(0.0);
                let r = right.trim().parse::<f64>().unwrap_or(0.0);
                return Ok(l <= r);
            }
        }

        if expr.contains("==") {
            if let Some((left, right)) = expr.split_once("==") {
                return Ok(left.trim() == right.trim());
            }
        }

        Ok(false)
    }

    fn get_field_value(data: &Value, path: &str) -> Option<Value> {
        let mut current = data;

        for segment in path.split('.') {
            match current.get(segment) {
                Some(next) => current = next,
                None => return None,
            }
        }

        Some(current.clone())
    }
}

/// Generate approval notification content
#[allow(dead_code)]
pub fn generate_approval_notification(
    approval: &PendingApproval,
    config: &ApprovalStepConfig,
    approval_url: &str,
) -> ApprovalNotification {
    let title = &config.title;
    let description = config.description.as_deref().unwrap_or("Approval required");

    ApprovalNotification {
        title: title.to_string(),
        description: description.to_string(),
        approval_url: approval_url.to_string(),
        context: approval.context_json.clone(),
        expires_at: approval.expires_at,
        token: approval.approval_token.to_string(),
    }
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct ApprovalNotification {
    pub title: String,
    pub description: String,
    pub approval_url: String,
    pub context: Value,
    pub expires_at: DateTime<Utc>,
    pub token: String,
}
