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

    /// Add approvers to an approval request
    pub async fn add_approvers(
        &self,
        approval_id: Uuid,
        approvers: Vec<(Uuid, String)>, // (user_id, email)
    ) -> Result<(), String> {
        for (user_id, email) in approvers {
            sqlx::query(
                r#"
                INSERT INTO approval_approvers 
                (approval_id, approver_id, approver_email, status, created_at, updated_at)
                VALUES ($1, $2, $3, 'pending', NOW(), NOW())
                ON CONFLICT DO NOTHING
                "#,
            )
            .bind(approval_id)
            .bind(user_id)
            .bind(email)
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to add approver: {}", e))?;
        }
        Ok(())
    }

    /// Get all approvers for an approval
    pub async fn get_approvers(
        &self,
        approval_id: Uuid,
    ) -> Result<Vec<(Uuid, String, String)>, String> { // (user_id, email, status)
        sqlx::query_as::<_, (Uuid, String, String)>(
            "SELECT approver_id, approver_email, status FROM approval_approvers WHERE approval_id = $1 ORDER BY created_at"
        )
        .bind(approval_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| format!("Failed to fetch approvers: {}", e))
    }

    /// Record an approver's decision
    pub async fn record_approver_decision(
        &self,
        approval_id: Uuid,
        approver_id: Uuid,
        decision: &str,
        comment: Option<String>,
    ) -> Result<(), String> {
        let status = if decision.eq_ignore_ascii_case("approved") {
            "approved"
        } else {
            "rejected"
        };

        sqlx::query(
            r#"
            UPDATE approval_approvers
            SET status = $1, approved_at = NOW(), decision_comment = $2, updated_at = NOW()
            WHERE approval_id = $3 AND approver_id = $4
            "#,
        )
        .bind(status)
        .bind(comment)
        .bind(approval_id)
        .bind(approver_id)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to record approval decision: {}", e))?;

        Ok(())
    }

    /// Check if all required approvers have approved
    pub async fn check_all_approved(
        &self,
        approval_id: Uuid,
    ) -> Result<bool, String> {
        let result = sqlx::query_scalar::<_, bool>(
            r#"
            SELECT COUNT(*) = SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END)
            FROM approval_approvers
            WHERE approval_id = $1
            "#,
        )
        .bind(approval_id)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| format!("Failed to check approval status: {}", e))?;

        Ok(result)
    }

    /// Check if any approver has rejected
    pub async fn check_any_rejected(
        &self,
        approval_id: Uuid,
    ) -> Result<bool, String> {
        let result = sqlx::query_scalar::<_, bool>(
            r#"
            SELECT EXISTS(
                SELECT 1 FROM approval_approvers
                WHERE approval_id = $1 AND status = 'rejected'
            )
            "#,
        )
        .bind(approval_id)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| format!("Failed to check rejection status: {}", e))?;

        Ok(result)
    }

    /// Get approval status summary
    pub async fn get_approval_status_summary(
        &self,
        approval_id: Uuid,
    ) -> Result<(i64, i64, i64), String> { // (total, approved, rejected)
        let result = sqlx::query_as::<_, (i64, i64, i64)>(
            r#"
            SELECT 
                COUNT(*) as total,
                COALESCE(SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END), 0) as approved,
                COALESCE(SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END), 0) as rejected
            FROM approval_approvers
            WHERE approval_id = $1
            "#,
        )
        .bind(approval_id)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| format!("Failed to get approval summary: {}", e))?;

        Ok(result)
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

    /// Send notifications to configured channels
    pub async fn send_notifications(
        approval: &PendingApproval,
        config: &ApprovalStepConfig,
        approval_url: &str,
    ) -> Result<(), String> {
        for channel in &config.notification_channels {
            match channel.as_str() {
                "slack" => {
                    if let Err(e) = Self::send_slack_notification(approval, config, approval_url).await {
                        eprintln!("Failed to send Slack notification: {}", e);
                    }
                }
                "email" => {
                    if let Err(e) = Self::send_email_notification(approval, config, approval_url).await {
                        eprintln!("Failed to send email notification: {}", e);
                    }
                }
                "push" => {
                    if let Err(e) = Self::send_push_notification(approval, config, approval_url).await {
                        eprintln!("Failed to send push notification: {}", e);
                    }
                }
                _ => {}
            }
        }
        Ok(())
    }

    /// Send Slack notification with approve/reject buttons
    async fn send_slack_notification(
        _approval: &PendingApproval,
        config: &ApprovalStepConfig,
        approval_url: &str,
    ) -> Result<(), String> {
        let webhook_url = if let Some(ref channel) = config.slack_channel {
            // If channel is configured, use it as the webhook URL or construct one
            if channel.starts_with("http") {
                channel.clone()
            } else {
                // Assume it's a channel name, try to get webhook from env
                std::env::var("SLACK_WEBHOOK_URL")
                    .map_err(|_| "SLACK_WEBHOOK_URL not configured".to_string())?
            }
        } else {
            std::env::var("SLACK_WEBHOOK_URL")
                .map_err(|_| "No Slack webhook configured".to_string())?
        };

        let title = &config.title;
        let description = config.description.as_deref().unwrap_or("Approval required");
        let expires_in_hours = (_approval.expires_at.timestamp() - Utc::now().timestamp()) / 3600;

        let payload = json!({
            "text": format!("🔔 {}: {}", title, description),
            "blocks": [
                {
                    "type": "header",
                    "text": {
                        "type": "plain_text",
                        "text": format!("🔔 {}", title),
                        "emoji": true
                    }
                },
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": format!("*{}*\n\n{}\n\n_Expires in ~{} hours_", title, description, expires_in_hours)
                    }
                },
                {
                    "type": "actions",
                    "elements": [
                        {
                            "type": "button",
                            "text": {
                                "type": "plain_text",
                                "text": "✅ Approve",
                                "emoji": true
                            },
                            "value": "approve",
                            "url": format!("{}?token={}&decision=approved", approval_url, _approval.approval_token),
                            "style": "primary"
                        },
                        {
                            "type": "button",
                            "text": {
                                "type": "plain_text",
                                "text": "❌ Reject",
                                "emoji": true
                            },
                            "value": "reject",
                            "url": format!("{}?token={}&decision=rejected", approval_url, _approval.approval_token),
                            "style": "danger"
                        }
                    ]
                }
            ]
        });

        let client = reqwest::Client::new();
        let response = client
            .post(&webhook_url)
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Slack request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Slack webhook returned {}", response.status()));
        }

        Ok(())
    }

    /// Send email notification with approval link
    async fn send_email_notification(
        approval: &PendingApproval,
        config: &ApprovalStepConfig,
        approval_url: &str,
    ) -> Result<(), String> {
        let resend_api_key = match std::env::var("RESEND_API_KEY") {
            Ok(key) => key,
            Err(_) => {
                eprintln!("RESEND_API_KEY not configured, skipping email notification");
                return Ok(());
            }
        };

        let emails = config.notify_emails.as_ref().ok_or("No email addresses configured")?;
        if emails.is_empty() {
            return Ok(());
        }

        let from_email = std::env::var("RESEND_FROM_EMAIL")
            .unwrap_or_else(|_| "approvals@pulsegrid.local".to_string());

        let title = &config.title;
        let description = config.description.as_deref().unwrap_or("Approval required");
        let expires_at = approval.expires_at.format("%Y-%m-%d %H:%M UTC").to_string();

        let html = format!(
            r#"
            <html>
                <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h1 style="color: #333;">🔔 {}</h1>
                    <p style="color: #666; font-size: 16px;">{}</p>
                    
                    <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <p><strong>Approval Token:</strong></p>
                        <code style="background-color: #e0e0e0; padding: 5px 10px; border-radius: 4px;">{}</code>
                    </div>

                    <div style="margin: 20px 0;">
                        <a href="{}" style="display: inline-block; padding: 12px 24px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 4px; margin-right: 10px;">
                            ✅ Approve
                        </a>
                        <a href="{}" style="display: inline-block; padding: 12px 24px; background-color: #f44336; color: white; text-decoration: none; border-radius: 4px;">
                            ❌ Reject
                        </a>
                    </div>

                    <p style="color: #999; font-size: 12px; margin-top: 20px;">
                        This approval will expire at {}.
                    </p>
                </body>
            </html>
            "#,
            title,
            description,
            approval.approval_token,
            format!("{}?token={}&decision=approved", approval_url, approval.approval_token),
            format!("{}?token={}&decision=rejected", approval_url, approval.approval_token),
            expires_at
        );

        let client = reqwest::Client::new();

        for email in emails {
            let payload = json!({
                "from": from_email,
                "to": email,
                "subject": format!("🔔 {}", title),
                "html": html
            });

            let response = client
                .post("https://api.resend.com/emails")
                .header("Authorization", format!("Bearer {}", resend_api_key))
                .json(&payload)
                .send()
                .await
                .map_err(|e| format!("Email request failed: {}", e))?;

            if !response.status().is_success() {
                eprintln!("Failed to send email to {}: {}", email, response.status());
            }
        }

        Ok(())
    }

    /// Send push notification
    async fn send_push_notification(
        _approval: &PendingApproval,
        _config: &ApprovalStepConfig,
        _approval_url: &str,
    ) -> Result<(), String> {
        // Push notifications require device tokens stored in the database
        // This is a placeholder for future implementation with mobile app integration
        
        let title = "Approval";
        let description = "Approval required";

        // Query for user devices that have opted into push notifications
        // This would typically be done via a separate devices table
        eprintln!(
            "Push notification support not yet implemented. Title: '{}', Description: '{}', URL: '{}'",
            title, description, _approval_url
        );

        Ok(())
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
