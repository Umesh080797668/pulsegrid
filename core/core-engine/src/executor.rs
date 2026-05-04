use crate::models::{
    FilterCondition, FlowStep, PulseEvent, StepExecutionResult, TriggerDefinition, FlowDefinition, LoopConcurrency,
};
use futures_util::future::join_all;
use core_connectors::{
    Connectors, CustomConnectorConfig, DiscordConfig, GithubIssueConfig, GmailSendConfig,
    GoogleSheetsAppendConfig, HttpConfig, NotionCreatePageConfig, TelegramConfig, Credentials,
    OAuthRefreshConfig,
};
use core_vm::CoreVm;
use rhai::{Array as RhaiArray, Dynamic, Engine, Map as RhaiMap};
use serde_json::{Value, json};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::Duration;
use tokio::time::sleep;
use base64::Engine as Base64Engine;
use sqlx::Row;

#[derive(Clone)]
pub struct FlowExecutor {
    engine: Arc<Engine>,
    sandbox: Arc<CoreVm>,
    pub connectors: Arc<core_connectors::Connectors>,
    pub pool: sqlx::PgPool,
    pub vault: Arc<core_vault::Vault>,
}

impl FlowExecutor {
    pub fn new(pool: sqlx::PgPool, vault: Arc<core_vault::Vault>) -> Self {
        Self {
            engine: Arc::new(Engine::new()),
            sandbox: Arc::new(CoreVm::new()),
            connectors: Arc::new(core_connectors::Connectors::new()),
            pool,
            vault,
        }
    }

    /// Check if an event with the same idempotency key has been processed
    /// Returns true if this is a duplicate, false if it's a new event
    #[allow(dead_code)]
    pub async fn check_idempotency(&self, workspace_id: uuid::Uuid, idempotency_key: &str) -> Result<bool, String> {
        // Check Redis cache first (24h TTL)
        let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://localhost:6379/".to_string());
        if let Ok(client) = redis::Client::open(redis_url) {
            if let Ok(mut con) = client.get_multiplexed_async_connection().await {
                let cache_key = format!("idempotency:{}:{}", workspace_id, idempotency_key);
                
                // Check if key exists
                let exists: bool = redis::cmd("EXISTS")
                    .arg(&cache_key)
                    .query_async(&mut con)
                    .await
                    .unwrap_or(false);
                
                if exists {
                    return Ok(true); // Duplicate
                }
                
                // Set the key with 24h TTL using redis async CommandsConnectionFuture
                use redis::AsyncCommands;
                let _ = con.set_ex::<_, _, String>(&cache_key, "1", 86400).await;
            }
        }
        
        Ok(false) // Not a duplicate
    }

    /// Track connector call for health monitoring
    async fn track_connector_call(&self, connector: &str) -> Result<(), String> {
        let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://localhost:6379/".to_string());
        if let Ok(client) = redis::Client::open(redis_url) {
            if let Ok(mut con) = client.get_multiplexed_async_connection().await {
                let window = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs() / 300; // 5-minute window
                
                let calls_key = format!("connector:calls:{}:{}", connector, window);
                use redis::AsyncCommands;
                let _: () = con.incr(&calls_key, 1).await.unwrap_or_default();
                let _: () = con.expire(&calls_key, 600).await.unwrap_or_default();
            }
        }
        Ok(())
    }

    /// Track connector error for health monitoring
    async fn track_connector_error(&self, connector: &str) -> Result<(), String> {
        let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://localhost:6379/".to_string());
        if let Ok(client) = redis::Client::open(redis_url) {
            if let Ok(mut con) = client.get_multiplexed_async_connection().await {
                let window = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs() / 300; // 5-minute window
                
                let errors_key = format!("connector:errors:{}:{}", connector, window);
                use redis::AsyncCommands;
                let _: () = con.incr(&errors_key, 1).await.unwrap_or_default();
                let _: () = con.expire(&errors_key, 600).await.unwrap_or_default();
            }
        }
        Ok(())
    }

    /// Check if connector circuit breaker is open (error rate > 50%)
    async fn is_circuit_open(&self, connector: &str) -> Result<bool, String> {
        let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://localhost:6379/".to_string());
        if let Ok(client) = redis::Client::open(redis_url) {
            if let Ok(mut con) = client.get_multiplexed_async_connection().await {
                let window = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs() / 300; // 5-minute window
                
                let calls_key = format!("connector:calls:{}:{}", connector, window);
                let errors_key = format!("connector:errors:{}:{}", connector, window);
                
                use redis::AsyncCommands;
                let calls_count: i32 = con.get(&calls_key).await.unwrap_or(0);
                let errors_count: i32 = con.get(&errors_key).await.unwrap_or(0);
                
                if calls_count > 0 {
                    let error_rate = errors_count as f64 / calls_count as f64;
                    return Ok(error_rate > 0.5); // Circuit open if error rate > 50%
                }
            }
        }
        Ok(false)
    }

    /// Update connector health metrics in database
    #[allow(dead_code)]
    async fn update_connector_health(
        &self,
        connector_id: &str,
        workspace_id: uuid::Uuid,
        success: bool,
        latency_ms: i32,
    ) -> Result<(), String> {
        let status = if success { "healthy" } else { "degraded" };

        sqlx::query(
            r#"
            INSERT INTO connector_health 
            (connector_id, workspace_id, status, last_error_at, p95_latency_ms, updated_at)
            VALUES ($1, $2, $3, CASE WHEN $4::boolean THEN NULL ELSE NOW() END, $5, NOW())
            ON CONFLICT (connector_id, workspace_id)
            DO UPDATE SET 
                status = $3,
                last_error_at = CASE WHEN NOT $4::boolean THEN NOW() ELSE connector_health.last_error_at END,
                p95_latency_ms = $5,
                updated_at = NOW()
            "#,
        )
        .bind(connector_id)
        .bind(workspace_id)
        .bind(status)
        .bind(success)
        .bind(latency_ms)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to update connector health: {}", e))?;

        Ok(())
    }

    /// Record connector call latency for metrics
    #[allow(dead_code)]
    async fn record_connector_latency(
        &self,
        connector_id: &str,
        workspace_id: uuid::Uuid,
        flow_run_id: uuid::Uuid,
        latency_ms: i32,
        success: bool,
        error_code: Option<&str>,
    ) -> Result<(), String> {
        sqlx::query(
            r#"
            INSERT INTO connector_call_latencies 
            (connector_id, workspace_id, flow_run_id, latency_ms, success, error_code, recorded_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            "#,
        )
        .bind(connector_id)
        .bind(workspace_id)
        .bind(flow_run_id)
        .bind(latency_ms)
        .bind(success)
        .bind(error_code)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to record connector latency: {}", e))?;

        Ok(())
    }

    /// Check if connector is healthy and close circuit if so
    #[allow(dead_code)]
    pub async fn check_connector_health(&self, _connector_id: &str, _workspace_id: uuid::Uuid) -> Result<bool, String> {
        // This would perform a test call to the connector
        // For now, just return true (implementation depends on specific connector)
        Ok(true)
    }

    /// Mark flows as paused due to circuit open
    #[allow(dead_code)]
    async fn pause_flows_for_circuit(
        &self,
        connector_id: &str,
        workspace_id: uuid::Uuid,
    ) -> Result<(), String> {
        sqlx::query(
            r#"
            UPDATE flow_runs
            SET approval_state = 'paused_circuit_open', 
                paused_at = NOW(),
                paused_reason = $1,
                updated_at = NOW()
            WHERE status = 'running' 
            AND flow_id IN (
                SELECT DISTINCT flow_id FROM flow_connector_impact
                WHERE connector_id = $2 AND workspace_id = $3
            )
            "#,
        )
        .bind(format!("Circuit breaker open for connector: {}", connector_id))
        .bind(connector_id)
        .bind(workspace_id)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to pause flows: {}", e))?;

        Ok(())
    }

    /// Resume flows when circuit closes
    #[allow(dead_code)]
    async fn resume_flows_for_circuit(
        &self,
        connector_id: &str,
        workspace_id: uuid::Uuid,
    ) -> Result<(), String> {
        sqlx::query(
            r#"
            UPDATE flow_runs
            SET approval_state = 'none', 
                paused_at = NULL,
                paused_reason = NULL,
                updated_at = NOW()
            WHERE paused_reason LIKE $1
            AND flow_id IN (
                SELECT DISTINCT flow_id FROM flow_connector_impact
                WHERE connector_id = $2 AND workspace_id = $3
            )
            "#,
        )
        .bind(format!("Circuit breaker open for connector: {}", connector_id))
        .bind(connector_id)
        .bind(workspace_id)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to resume flows: {}", e))?;

        Ok(())
    }

    /// Handle approval step execution
    #[allow(dead_code)]
    pub async fn execute_approval_step(
        &self,
        step: &FlowStep,
        flow_run_id: uuid::Uuid,
        _workspace_id: uuid::Uuid,
        step_outputs: &HashMap<String, Value>,
        event: &PulseEvent,
    ) -> Result<Value, String> {
        // Get approval config from step
        let approval_config = step.approval_config.as_ref()
            .ok_or("Approval step missing configuration")?;

        // Store approval in database and return token for client to track
        let approval_record = sqlx::query(
            r#"
            INSERT INTO pending_approvals 
            (flow_run_id, step_id, context_json, expires_at, status, created_at, updated_at)
            VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour' * $4, 'pending', NOW(), NOW())
            RETURNING approval_token, id, expires_at
            "#,
        )
        .bind(flow_run_id)
        .bind(&step.id)
            .bind(&json!({
            "step_id": &step.id,
            "title": &approval_config.title,
            "description": &approval_config.description,
            "step_outputs": step_outputs,
            "event_data": &event.data,
            }))
        .bind(approval_config.timeout_hours)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| format!("Failed to create approval: {}", e))?;

        let token: uuid::Uuid = approval_record.get("approval_token");
        let approval_id: uuid::Uuid = approval_record.get("id");
        let expires_at: chrono::DateTime<chrono::Utc> = approval_record.get("expires_at");

        // Send notifications through configured channels
        // Send to Slack if configured
        if approval_config.notification_channels.contains(&"slack".to_string()) {
            let _ = Self::send_slack_approval_message(
                &approval_config.title,
                &approval_config.description.as_deref().unwrap_or("Approval required"),
                &token,
            ).await;
        }

        Ok(json!({
            "approval_token": token.to_string(),
            "approval_id": approval_id.to_string(),
            "status": "pending",
            "expires_at": expires_at.to_rfc3339(),
            "message": format!("Approval required for step: {}", step.id)
        }))
    }

    /// Send Slack approval message
    #[allow(dead_code)]
    async fn send_slack_approval_message(
        title: &str,
        description: &str,
        token: &uuid::Uuid,
    ) -> Result<(), String> {
        let webhook_url = std::env::var("SLACK_WEBHOOK_URL")
            .unwrap_or_else(|_| String::new());
        
        if webhook_url.is_empty() {
            return Ok(()); // Slack not configured
        }

        let payload = json!({
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
                        "text": description
                    }
                },
                {
                    "type": "actions",
                    "elements": [
                        {
                            "type": "button",
                            "text": {
                                "type": "plain_text",
                                "text": "✅ Approve"
                            },
                            "value": "approve",
                            "action_id": format!("approval_approve_{}", token),
                            "style": "primary"
                        },
                        {
                            "type": "button",
                            "text": {
                                "type": "plain_text",
                                "text": "❌ Reject"
                            },
                            "value": "reject",
                            "action_id": format!("approval_reject_{}", token),
                            "style": "danger"
                        }
                    ]
                }
            ]
        });

        let client = reqwest::Client::new();
        let _ = client.post(&webhook_url).json(&payload).send().await;
        
        Ok(())
    }

    /// Resume flow execution from approval
    #[allow(dead_code)]
    pub async fn resume_from_approval(
        &self,
        flow_run_id: uuid::Uuid,
        approval_status: &str,
    ) -> Result<Value, String> {
        // Update flow_runs to mark as ready to resume
        sqlx::query(
            r#"
            UPDATE flow_runs
            SET approval_state = 'none',
                paused_at = NULL,
                paused_reason = NULL,
                updated_at = NOW()
            WHERE id = $1
            "#,
        )
        .bind(flow_run_id)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to resume flow: {}", e))?;

        Ok(json!({
            "flow_run_id": flow_run_id.to_string(),
            "approval_status": approval_status,
            "status": "resumed"
        }))
    }

    pub fn matches_trigger(&self, trigger: &TriggerDefinition, event: &PulseEvent) -> bool {
        if !trigger.connector.is_empty() {
            match event.source.as_deref() {
                Some(source) if source.eq_ignore_ascii_case(&trigger.connector) => {}
                _ => return false,
            }
        }

        if !trigger.event.is_empty() && event.event_type != trigger.event {
            return false;
        }

        trigger
            .filters
            .iter()
            .all(|filter| self.evaluate_filter(filter, &event.data))
    }

    fn evaluate_filter(&self, filter: &FilterCondition, data: &Value) -> bool {
        let current = self.get_field_value(data, &filter.field);

        match filter.op.as_str() {
            "eq" => current == filter.value,
            "neq" => current != filter.value,
            "gt" => current
                .as_f64()
                .zip(filter.value.as_f64())
                .is_some_and(|(a, b)| a > b),
            "gte" => current
                .as_f64()
                .zip(filter.value.as_f64())
                .is_some_and(|(a, b)| a >= b),
            "lt" => current
                .as_f64()
                .zip(filter.value.as_f64())
                .is_some_and(|(a, b)| a < b),
            "lte" => current
                .as_f64()
                .zip(filter.value.as_f64())
                .is_some_and(|(a, b)| a <= b),
            "contains" => current
                .as_str()
                .zip(filter.value.as_str())
                .is_some_and(|(a, b)| a.contains(b)),
            "in" => filter
                .value
                .as_array()
                .is_some_and(|arr| arr.iter().any(|value| value == &current)),
            _ => false,
        }
    }

    fn get_field_value(&self, data: &Value, path: &str) -> Value {
        let mut current = data;

        for segment in path.split('.') {
            match current.as_object().and_then(|obj| obj.get(segment)) {
                Some(next) => current = next,
                None => return Value::Null,
            }
        }

        current.clone()
    }

    pub fn resolve_execution_order(&self, steps: &[FlowStep]) -> Result<Vec<Vec<String>>, String> {
        let step_map: HashMap<&str, &FlowStep> =
            steps.iter().map(|step| (step.id.as_str(), step)).collect();
        let mut remaining: HashSet<String> = steps.iter().map(|step| step.id.clone()).collect();
        let mut completed: HashSet<String> = HashSet::new();
        let mut groups: Vec<Vec<String>> = Vec::new();

        while !remaining.is_empty() {
            let ready: Vec<String> = remaining
                .iter()
                .filter(|step_id| {
                    step_map
                        .get(step_id.as_str())
                        .map(|step| step.depends_on.iter().all(|dep| completed.contains(dep)))
                        .unwrap_or(false)
                })
                .cloned()
                .collect();

            if ready.is_empty() {
                return Err("Cyclic or unsatisfied step dependencies detected".to_string());
            }

            for id in &ready {
                remaining.remove(id);
                completed.insert(id.clone());
            }

            groups.push(ready);
        }

        Ok(groups)
    }

    pub async fn execute_flow(
        &self,
        flow_def: &FlowDefinition,
        event: &PulseEvent,
        depth: i32,
        initial_outputs: std::collections::HashMap<String, Value>,
    ) -> Result<std::collections::HashMap<String, Value>, String> {
        if depth > 3 {
            return Err("sub-flow depth exceeded".to_string());
        }

        let execution_order = self.resolve_execution_order(&flow_def.steps)?;
        let mut step_outputs: std::collections::HashMap<String, Value> = initial_outputs;
        let flow_def_snapshot = flow_def.clone();

        for group in execution_order {
            use std::pin::Pin;
            let mut futures_vec: Vec<Pin<Box<dyn std::future::Future<Output = StepExecutionResult> + '_>>> = Vec::new();
            let executor = self.clone();

            for step_id in &group {
                if let Some(step) = flow_def.steps.iter().find(|s| &s.id == step_id) {
                    let step_clone = step.clone();
                    let event_clone = event.clone();
                    let outputs_snapshot = step_outputs.clone();
                    let executor = executor.clone();
                    let flow_def_snapshot = flow_def_snapshot.clone();

                    let fut = Box::pin(async move {
                        if step_clone.r#type == "loop" {
                            let loop_result = executor
                                .execute_loop_step(
                                    &flow_def_snapshot,
                                    &step_clone,
                                    &outputs_snapshot,
                                    &event_clone,
                                    depth,
                                )
                                .await;

                            match loop_result {
                                Ok(output) => StepExecutionResult {
                                    step_id: step_clone.id.clone(),
                                    status: "success".to_string(),
                                    output,
                                    error: None,
                                    duration_ms: 0,
                                },
                                Err(error) => StepExecutionResult {
                                    step_id: step_clone.id.clone(),
                                    status: "failed".to_string(),
                                    output: Value::Null,
                                    error: Some(error),
                                    duration_ms: 0,
                                },
                            }
                        } else if step_clone.r#type == "sub_flow" {
                            let sub_flow_id = step_clone.sub_flow_id.clone().unwrap_or_default();
                            if sub_flow_id.is_empty() {
                                return StepExecutionResult {
                                    step_id: step_clone.id.clone(),
                                    status: "failed".to_string(),
                                    output: Value::Null,
                                    error: Some("sub_flow step missing id".to_string()),
                                    duration_ms: 0,
                                };
                            }

                            let sub_uuid = match uuid::Uuid::parse_str(&sub_flow_id) {
                                Ok(u) => u,
                                Err(e) => {
                                    return StepExecutionResult {
                                        step_id: step_clone.id.clone(),
                                        status: "failed".to_string(),
                                        output: Value::Null,
                                        error: Some(format!("invalid sub_flow_id: {}", e)),
                                        duration_ms: 0,
                                    };
                                }
                            };

                            let def_val: Option<serde_json::Value> = match sqlx::query_scalar("SELECT definition FROM flows WHERE id = $1 AND workspace_id = $2")
                                .bind(sub_uuid)
                                .bind(event_clone.tenant_id)
                                .fetch_optional(&executor.pool)
                                .await
                            {
                                Ok(v) => v,
                                Err(e) => {
                                    return StepExecutionResult {
                                        step_id: step_clone.id.clone(),
                                        status: "failed".to_string(),
                                        output: Value::Null,
                                        error: Some(e.to_string()),
                                        duration_ms: 0,
                                    };
                                }
                            };

                            let def_val = match def_val {
                                Some(v) => v,
                                None => {
                                    return StepExecutionResult {
                                        step_id: step_clone.id.clone(),
                                        status: "failed".to_string(),
                                        output: Value::Null,
                                        error: Some(format!("sub_flow not found: {}", sub_flow_id)),
                                        duration_ms: 0,
                                    };
                                }
                            };

                            let sub_def: FlowDefinition = match serde_json::from_value(def_val) {
                                Ok(d) => d,
                                Err(e) => {
                                    return StepExecutionResult {
                                        step_id: step_clone.id.clone(),
                                        status: "failed".to_string(),
                                        output: Value::Null,
                                        error: Some(format!("failed to parse sub_flow definition: {}", e)),
                                        duration_ms: 0,
                                    };
                                }
                            };

                            let current_depth = event_clone.sub_flow_depth.unwrap_or(0);
                            if current_depth + 1 > 3 {
                                return StepExecutionResult {
                                    step_id: step_clone.id.clone(),
                                    status: "failed".to_string(),
                                    output: Value::Null,
                                    error: Some("sub-flow max depth exceeded".to_string()),
                                    duration_ms: 0,
                                };
                            }

                            let nested_input = if let Some(template) = step_clone.sub_flow_input.as_deref() {
                                if template.trim().is_empty() {
                                    event_clone.data.clone()
                                } else {
                                    match executor.transform_data(template, &outputs_snapshot, &event_clone) {
                                        Ok(value) => value,
                                        Err(error) => {
                                            return StepExecutionResult {
                                                step_id: step_clone.id.clone(),
                                                status: "failed".to_string(),
                                                output: Value::Null,
                                                error: Some(format!("failed to render sub_flow_input: {}", error)),
                                                duration_ms: 0,
                                            };
                                        }
                                    }
                                }
                            } else {
                                event_clone.data.clone()
                            };

                            let mut nested_event = event_clone.clone();
                            nested_event.data = nested_input;
                            nested_event.sub_flow_depth = Some(current_depth + 1);

                            match executor
                                .execute_flow(&sub_def, &nested_event, current_depth + 1, HashMap::new())
                                .await
                            {
                                Ok(outputs) => StepExecutionResult {
                                    step_id: step_clone.id.clone(),
                                    status: "success".to_string(),
                                    output: Value::Object(serde_json::Map::from_iter(outputs.iter().map(|(k,v)| (k.clone(), v.clone())))),
                                    error: None,
                                    duration_ms: 0,
                                },
                                Err(e) => StepExecutionResult {
                                    step_id: step_clone.id.clone(),
                                    status: "failed".to_string(),
                                    output: Value::Null,
                                    error: Some(e),
                                    duration_ms: 0,
                                },
                            }
                        } else {
                            // normal step with retry
                            let input = executor.render_input_mapping(&step_clone, &outputs_snapshot, &event_clone);
                            let max_attempts = (step_clone.retry_policy.max_retries + 1).max(1) as usize;
                            let base_delay_ms = if step_clone.retry_policy.initial_backoff_ms > 0 {
                                step_clone.retry_policy.initial_backoff_ms as u64
                            } else { 500 };

                            let mut last_err: Option<String> = None;
                            for attempt in 0..max_attempts {
                                let res = executor.execute_step(&step_clone, input.clone(), &outputs_snapshot, &event_clone).await;
                                if res.status != "failed" {
                                    return res;
                                }
                                last_err = res.error.clone();
                                if attempt + 1 < max_attempts {
                                    let sleep_ms = base_delay_ms.saturating_mul(2u64.saturating_pow(attempt as u32));
                                    tokio::time::sleep(std::time::Duration::from_millis(sleep_ms)).await;
                                }
                            }

                            StepExecutionResult {
                                step_id: step_clone.id.clone(),
                                status: "failed".to_string(),
                                output: Value::Null,
                                error: last_err,
                                duration_ms: 0,
                            }
                        }
                    });

                    futures_vec.push(fut);
                }
            }

            // run the group concurrently within this task
            let results = join_all(futures_vec).await;

            for result in results {
                if result.status == "failed" {
                    return Err(result.error.unwrap_or_else(|| "step failed".to_string()));
                }
                if result.status == "waiting" {
                    step_outputs.insert(result.step_id.clone(), result.output.clone());
                    return Ok(step_outputs);
                }
                step_outputs.insert(result.step_id.clone(), result.output.clone());
            }
        }

        Ok(step_outputs)
    }

    pub fn transform_data(
        &self,
        template: &str,
        step_outputs: &HashMap<String, Value>,
        event: &PulseEvent,
    ) -> Result<Value, String> {
        let mut rendered = template.to_string();

        loop {
            let Some(start) = rendered.find("{{") else {
                break;
            };
            let Some(end_rel) = rendered[start + 2..].find("}}") else {
                break;
            };
            let end = start + 2 + end_rel;
            let expr = rendered[start + 2..end].trim();
            let value = self.evaluate_expression(expr, step_outputs, event)?;
            let replacement = match value {
                Value::String(text) => text,
                other => other.to_string(),
            };
            rendered.replace_range(start..end + 2, &replacement);
        }

        serde_json::from_str::<Value>(&rendered).or_else(|_| Ok(Value::String(rendered)))
    }

    fn evaluate_expression(
        &self,
        expr: &str,
        step_outputs: &HashMap<String, Value>,
        event: &PulseEvent,
    ) -> Result<Value, String> {
        let parts: Vec<&str> = expr.split('|').map(str::trim).collect();
        let mut value = self.resolve_variable(parts[0], step_outputs, event)?;

        for filter in parts.iter().skip(1) {
            value = self.apply_filter(filter, value)?;
        }

        Ok(value)
    }

    fn resolve_variable(
        &self,
        var: &str,
        step_outputs: &HashMap<String, Value>,
        event: &PulseEvent,
    ) -> Result<Value, String> {
        if let Some(path) = var.strip_prefix("trigger.") {
            return Ok(self.get_field_value(&event.data, path));
        }

        if let Some((step_id, path)) = var.split_once('.') {
            if let Some(output) = step_outputs.get(step_id) {
                return Ok(self.get_field_value(output, path));
            }
        }

        Err(format!("Unknown variable reference: {var}"))
    }

    fn apply_filter(&self, filter: &str, value: Value) -> Result<Value, String> {
        match filter {
            "lowercase" => Ok(Value::String(
                value.as_str().unwrap_or_default().to_lowercase(),
            )),
            "uppercase" => Ok(Value::String(
                value.as_str().unwrap_or_default().to_uppercase(),
            )),
            "trim" => Ok(Value::String(
                value.as_str().unwrap_or_default().trim().to_string(),
            )),
            "json" => {
                if let Some(text) = value.as_str() {
                    serde_json::from_str::<Value>(text).map_err(|e| e.to_string())
                } else {
                    Ok(value)
                }
            }
            "length" => Ok(json!(value.to_string().len())),
            other => Err(format!("Unknown filter: {other}")),
        }
    }

    pub async fn execute_step(
        &self,
        step: &FlowStep,
        _input_data: Value,
        step_outputs: &HashMap<String, Value>,
        event: &PulseEvent,
    ) -> StepExecutionResult {
        let started = std::time::Instant::now();
        let resolved_input = self
            .build_step_input(step, _input_data.clone(), step_outputs, event)
            .await;

        if let Some(condition) = &step.condition {
            if !self.evaluate_condition(condition, step_outputs, event) {
                return StepExecutionResult {
                    step_id: step.id.clone(),
                    status: "skipped".to_string(),
                    output: Value::Null,
                    error: None,
                    duration_ms: started.elapsed().as_millis() as i32,
                };
            }
        }

        let output = match step.r#type.as_str() {
            "action" => {
                let connector_name = step.connector.clone().unwrap_or_default().to_lowercase();
                let action_name = step.action.clone().unwrap_or_default().to_lowercase();
                let input_obj = resolved_input.as_object().cloned().unwrap_or_default();
                let input = serde_json::Value::Object(input_obj);
                let connectors = self.connectors.clone();
                let max_attempts = (step.retry_policy.max_retries + 1).max(1) as usize;
                let base_delay_ms = if step.retry_policy.initial_backoff_ms > 0 {
                    step.retry_policy.initial_backoff_ms as u64
                } else {
                    1000
                };

                let mut output_value: Option<Value> = None;
                let mut last_error: Option<String> = None;

                for attempt in 0..max_attempts {
                    let exec_result = self
                        .dispatch_connector_action(&connectors, &connector_name, &action_name, &input)
                        .await;

                    match exec_result {
                        Ok(value) => {
                            output_value = Some(value);
                            break;
                        }
                        Err(err) => {
                            last_error = Some(err);

                            if attempt + 1 < max_attempts {
                                let sleep_ms = base_delay_ms
                                    .saturating_mul(2u64.saturating_pow(attempt as u32));
                                sleep(Duration::from_millis(sleep_ms)).await;
                            }
                        }
                    }
                }

                match output_value {
                    Some(value) => json!({
                        "step_id": step.id,
                        "connector": step.connector,
                        "action": step.action,
                        "input": input,
                        "output": value,
                        "status": "executed"
                    }),
                    None => {
                        return StepExecutionResult {
                            step_id: step.id.clone(),
                            status: "failed".to_string(),
                            output: Value::Null,
                            error: last_error,
                            duration_ms: started.elapsed().as_millis() as i32,
                        };
                    }
                }
            }
            "condition" => json!({
                "result": step.condition.as_deref().map(|condition| self.evaluate_condition(condition, step_outputs, event)).unwrap_or(false)
            }),
            "script" => {
                let script_language = step.script_language.as_deref().unwrap_or("wat");
                let Some(code) = step.code.as_deref() else {
                    return StepExecutionResult {
                        step_id: step.id.clone(),
                        status: "failed".to_string(),
                        output: Value::Null,
                        error: Some("script step is missing code".to_string()),
                        duration_ms: started.elapsed().as_millis() as i32,
                    };
                };

                if !matches!(script_language, "wat" | "wasm") {
                    return StepExecutionResult {
                        step_id: step.id.clone(),
                        status: "failed".to_string(),
                        output: Value::Null,
                        error: Some(format!("unsupported script language: {script_language}")),
                        duration_ms: started.elapsed().as_millis() as i32,
                    };
                }

                let script_input = json!({
                    "step_id": step.id,
                    "script_language": script_language,
                    "input": resolved_input,
                    "event": event,
                    "step_outputs": step_outputs,
                });

                match self.sandbox.execute_wat_script(code, &script_input) {
                    Ok(output) => json!({
                        "status": "script_executed",
                        "language": script_language,
                        "output": output,
                    }),
                    Err(err) => {
                        return StepExecutionResult {
                            step_id: step.id.clone(),
                            status: "failed".to_string(),
                            output: Value::Null,
                            error: Some(match err {
                                core_vm::ExecutionError::ScriptError(message) => message,
                                core_vm::ExecutionError::SandboxError(message) => message,
                                core_vm::ExecutionError::UnknownKind(message) => message,
                            }),
                            duration_ms: started.elapsed().as_millis() as i32,
                        };
                    }
                }
            }
            "code" => {
                // user-provided compiled WASM (base64). Frontend compiles JS/Python -> wasm
                let Some(code_b64) = step.code.as_deref() else {
                    return StepExecutionResult {
                        step_id: step.id.clone(),
                        status: "failed".to_string(),
                        output: Value::Null,
                        error: Some("code step is missing base64 wasm in code field".to_string()),
                        duration_ms: started.elapsed().as_millis() as i32,
                    };
                };

                let wasm_bytes = match base64::engine::general_purpose::STANDARD.decode(code_b64) {
                    Ok(bytes) => bytes,
                    Err(e) => {
                        return StepExecutionResult {
                            step_id: step.id.clone(),
                            status: "failed".to_string(),
                            output: Value::Null,
                            error: Some(format!("failed to decode base64 wasm: {}", e)),
                            duration_ms: started.elapsed().as_millis() as i32,
                        };
                    }
                };

                let script_input = json!({
                    "step_id": step.id,
                    "language": step.script_language.clone().unwrap_or("wasm".to_string()),
                    "input": resolved_input,
                    "event": event,
                    "step_outputs": step_outputs,
                });

                match self.sandbox.execute_wasm_module(&wasm_bytes, &script_input, 100) {
                    Ok(output) => json!({
                        "status": "code_executed",
                        "language": step.script_language.clone().unwrap_or("wasm".to_string()),
                        "output": output,
                    }),
                    Err(err) => {
                        return StepExecutionResult {
                            step_id: step.id.clone(),
                            status: "failed".to_string(),
                            output: Value::Null,
                            error: Some(match err {
                                core_vm::ExecutionError::ScriptError(message) => message,
                                core_vm::ExecutionError::SandboxError(message) => message,
                                core_vm::ExecutionError::UnknownKind(message) => message,
                            }),
                            duration_ms: started.elapsed().as_millis() as i32,
                        };
                    }
                }
            }
            "loop" => json!({
                "status": "loop_deferred",
                "note": "Loop steps are executed by the flow executor so child steps can be resolved",
            }),
            "parallel" | "parallel_split" => {
                let default_steps = vec![];
                let step_ids = step.parallel_steps.as_ref().unwrap_or(&default_steps);
                json!({
                    "status": "parallel_scheduled",
                    "parallel_steps": step_ids,
                    "note": "Parallel split handled by the flow scheduler; branch steps run independently",
                })
            }
            "merge" => {
                json!({
                    "status": "merge_completed",
                    "depends_on": step.depends_on,
                    "note": "Merge node waits for all upstream branches before continuing",
                })
            }
            "sub_flow" => {
                let sub_flow_id = step.sub_flow_id.as_deref().unwrap_or("");
                if sub_flow_id.is_empty() {
                    return StepExecutionResult {
                        step_id: step.id.clone(),
                        status: "failed".to_string(),
                        output: Value::Null,
                        error: Some("sub_flow step requires sub_flow_id".to_string()),
                        duration_ms: started.elapsed().as_millis() as i32,
                    };
                }

                // parse uuid
                let sub_uuid = match uuid::Uuid::parse_str(sub_flow_id) {
                    Ok(u) => u,
                    Err(e) => {
                        return StepExecutionResult {
                            step_id: step.id.clone(),
                            status: "failed".to_string(),
                            output: Value::Null,
                            error: Some(format!("invalid sub_flow_id: {}", e)),
                            duration_ms: started.elapsed().as_millis() as i32,
                        };
                    }
                };

                // fetch definition from DB
                let def_val: Option<serde_json::Value> = match sqlx::query_scalar("SELECT definition FROM flows WHERE id = $1 AND workspace_id = $2")
                    .bind(sub_uuid)
                    .bind(event.tenant_id)
                    .fetch_optional(&self.pool)
                    .await
                    .map_err(|e| e.to_string()) {
                        Ok(v) => v,
                        Err(_) => {
                            return StepExecutionResult {
                                step_id: step.id.clone(),
                                status: "failed".to_string(),
                                output: Value::Null,
                                error: Some("db error fetching sub_flow".to_string()),
                                duration_ms: started.elapsed().as_millis() as i32,
                            };
                        }
                    };

                let def_val = match def_val {
                    Some(v) => v,
                    None => {
                        return StepExecutionResult {
                            step_id: step.id.clone(),
                            status: "failed".to_string(),
                            output: Value::Null,
                            error: Some(format!("sub_flow not found: {}", sub_flow_id)),
                            duration_ms: started.elapsed().as_millis() as i32,
                        };
                    }
                };

                let sub_def: FlowDefinition = match serde_json::from_value(def_val) {
                    Ok(d) => d,
                    Err(e) => {
                        return StepExecutionResult {
                            step_id: step.id.clone(),
                            status: "failed".to_string(),
                            output: Value::Null,
                            error: Some(format!("failed to parse sub_flow definition: {}", e)),
                            duration_ms: started.elapsed().as_millis() as i32,
                        };
                    }
                };

                // depth guard via event.sub_flow_depth
                let current_depth = event.sub_flow_depth.unwrap_or(0);
                if current_depth + 1 > 3 {
                    return StepExecutionResult {
                        step_id: step.id.clone(),
                        status: "failed".to_string(),
                        output: Value::Null,
                        error: Some("sub-flow max depth exceeded".to_string()),
                        duration_ms: started.elapsed().as_millis() as i32,
                    };
                }

                let nested_input = if let Some(template) = step.sub_flow_input.as_deref() {
                    if template.trim().is_empty() {
                        event.data.clone()
                    } else {
                        match self.transform_data(template, step_outputs, event) {
                            Ok(value) => value,
                            Err(error) => {
                                return StepExecutionResult {
                                    step_id: step.id.clone(),
                                    status: "failed".to_string(),
                                    output: Value::Null,
                                    error: Some(format!("failed to render sub_flow_input: {}", error)),
                                    duration_ms: started.elapsed().as_millis() as i32,
                                };
                            }
                        }
                    }
                } else {
                    event.data.clone()
                };

                let mut nested_event = event.clone();
                nested_event.data = nested_input;
                nested_event.sub_flow_depth = Some(current_depth + 1);

                match self.execute_flow(&sub_def, &nested_event, current_depth + 1, HashMap::new()).await {
                    Ok(outputs) => json!({
                        "status": "sub_flow_executed",
                        "sub_flow_id": sub_flow_id,
                        "outputs": outputs,
                    }),
                    Err(e) => {
                        return StepExecutionResult {
                            step_id: step.id.clone(),
                            status: "failed".to_string(),
                            output: Value::Null,
                            error: Some(e),
                            duration_ms: started.elapsed().as_millis() as i32,
                        };
                    }
                }
            }
            "filter" => {
                let filter_cond = step.filter_condition.as_deref().unwrap_or("");
                if filter_cond.is_empty() {
                    return StepExecutionResult {
                        step_id: step.id.clone(),
                        status: "failed".to_string(),
                        output: Value::Null,
                        error: Some("filter step requires filter_condition".to_string()),
                        duration_ms: started.elapsed().as_millis() as i32,
                    };
                }

                let passes = self.evaluate_condition(filter_cond, step_outputs, event);
                json!({
                    "status": "filter_evaluated",
                    "condition": filter_cond,
                    "passed": passes,
                    "input": resolved_input,
                })
            }
            "transform" => {
                let transform_expr = step.transform_expr.as_deref().unwrap_or("");
                if transform_expr.is_empty() {
                    return StepExecutionResult {
                        step_id: step.id.clone(),
                        status: "failed".to_string(),
                        output: Value::Null,
                        error: Some("transform step requires transform_expr".to_string()),
                        duration_ms: started.elapsed().as_millis() as i32,
                    };
                }

                match self.transform_data(transform_expr, step_outputs, event) {
                    Ok(transformed) => json!({
                        "status": "transform_completed",
                        "expression": transform_expr,
                        "result": transformed,
                    }),
                    Err(e) => {
                        return StepExecutionResult {
                            step_id: step.id.clone(),
                            status: "failed".to_string(),
                            output: Value::Null,
                            error: Some(format!("transform execution failed: {e}")),
                            duration_ms: started.elapsed().as_millis() as i32,
                        };
                    }
                }
            }
            "delay" => {
                let delay_ms = step.delay_ms.unwrap_or(1000) as u64;
                tokio::time::sleep(tokio::time::Duration::from_millis(delay_ms)).await;
                json!({
                    "status": "delay_completed",
                    "delay_ms": delay_ms,
                })
            }
            "wait_for_approval" => {
                // Validate that approval_config is present
                if let Some(approval_config) = &step.approval_config {
                    // In executor context, just return pending_approval status
                    // Actual approval request creation happens in main.rs event loop
                    // (which has access to flow_run_id and full flow context)
                    json!({
                        "status": "pending_approval",
                        "step_id": step.id,
                        "title": approval_config.title,
                        "description": approval_config.description,
                        "message": "Flow paused, awaiting approval",
                    })
                } else {
                    return StepExecutionResult {
                        step_id: step.id.clone(),
                        status: "failed".to_string(),
                        output: Value::Null,
                        error: Some("wait_for_approval step requires approval_config".to_string()),
                        duration_ms: started.elapsed().as_millis() as i32,
                    };
                }
            }
            "fork" => {
                let fork_condition = step.condition.as_deref().unwrap_or("");
                if fork_condition.is_empty() {
                    return StepExecutionResult {
                        step_id: step.id.clone(),
                        status: "failed".to_string(),
                        output: Value::Null,
                        error: Some("fork step requires condition".to_string()),
                        duration_ms: started.elapsed().as_millis() as i32,
                    };
                }

                let takes_branch = self.evaluate_condition(fork_condition, step_outputs, event);
                json!({
                    "status": "fork_evaluated",
                    "condition": fork_condition,
                    "branch_taken": takes_branch,
                    "note": "Use depends_on to select which branch executes next",
                })
            }
            other => {
                return StepExecutionResult {
                    step_id: step.id.clone(),
                    status: "failed".to_string(),
                    output: Value::Null,
                    error: Some(format!("Unknown or unimplemented step type: {other}. Supported types: action, condition, script, code, loop, parallel, parallel_split, merge, sub_flow, filter, transform, delay, fork, wait_for_approval")),
                    duration_ms: started.elapsed().as_millis() as i32,
                };
            }
        };

        StepExecutionResult {
            step_id: step.id.clone(),
            status: "success".to_string(),
            output,
            error: None,
            duration_ms: started.elapsed().as_millis() as i32,
        }
    }

    pub async fn build_step_input(
        &self,
        step: &FlowStep,
        input_data: Value,
        step_outputs: &HashMap<String, Value>,
        event: &PulseEvent,
    ) -> Value {
        if step.r#type != "action" {
            return input_data;
        }

        let connector_name = step.connector.clone().unwrap_or_default().to_lowercase();
        let upper_connector = connector_name.to_uppercase();
        let mut input_obj = self.render_input_mapping(step, step_outputs, event).as_object().cloned().unwrap_or_default();

        if let Ok(row) = sqlx::query!(
            "SELECT encrypted_blob, nonce FROM credentials WHERE workspace_id = $1 AND connector_id = $2",
            event.tenant_id,
            upper_connector
        )
        .fetch_one(&self.pool)
        .await
        {
            if let Ok(decrypted) = self.vault.decrypt(&row.encrypted_blob, &row.nonce) {
                if let Ok(secret_json) = serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(&decrypted) {
                    for (k, v) in secret_json {
                        input_obj.entry(k).or_insert(v);
                    }
                } else {
                    input_obj
                        .entry("access_token".to_string())
                        .or_insert(serde_json::Value::String(decrypted.clone()));
                    input_obj
                        .entry("bot_token".to_string())
                        .or_insert(serde_json::Value::String(decrypted));
                }
            }
        }

        serde_json::Value::Object(input_obj)
    }

    async fn execute_loop_step(
        &self,
        flow_def: &FlowDefinition,
        step: &FlowStep,
        step_outputs: &HashMap<String, Value>,
        event: &PulseEvent,
        depth: i32,
    ) -> Result<Value, String> {
        let (array_path, variable_name, child_step_ids, concurrency_mode, max_iterations, break_condition) =
            if let Some(config) = &step.loop_config {
                (
                    config.array_path.clone(),
                    config.variable_name.clone(),
                    config.child_steps.clone(),
                    config.concurrency.clone(),
                    config.max_iterations.unwrap_or(1000).max(1) as usize,
                    config.break_condition.clone(),
                )
            } else {
                (
                    step.loop_items.clone().unwrap_or_default(),
                    step.loop_variable_name.clone().unwrap_or_else(|| "item".to_string()),
                    Vec::new(),
                    LoopConcurrency::Sequential,
                    step.max_iterations.unwrap_or(100).max(1) as usize,
                    step.loop_condition.clone(),
                )
            };

        let items = self.resolve_loop_items(&array_path, step_outputs, event)?;
        let items_to_process: Vec<(usize, Value)> = items
            .into_iter()
            .take(max_iterations)
            .enumerate()
            .collect();

        let child_step_ids = if child_step_ids.is_empty() {
            flow_def
                .steps
                .iter()
                .filter(|candidate| candidate.depends_on.iter().any(|dep| dep == &step.id))
                .map(|candidate| candidate.id.clone())
                .collect::<Vec<_>>()
        } else {
            child_step_ids
        };

        let mut loop_results = Vec::new();

        match concurrency_mode {
            LoopConcurrency::Sequential => {
                for (idx, item) in items_to_process {
                    if let Some(expr) = &break_condition {
                        let loop_context = self.build_loop_context(step_outputs, &item, idx, &variable_name);
                        if self.evaluate_condition(expr, &loop_context, event) {
                            break;
                        }
                    }

                    let loop_context = self.build_loop_context(step_outputs, &item, idx, &variable_name);
                    let iteration_outputs = self
                        .execute_loop_iteration(flow_def, &child_step_ids, &loop_context, event, depth)
                        .await?;

                    loop_results.push(json!({
                        "index": idx,
                        "item": item,
                        "outputs": iteration_outputs,
                    }));
                }
            }
            LoopConcurrency::Parallel(max_workers) => {
                let max_concurrent = (max_workers as usize).max(1);
                for chunk in items_to_process.chunks(max_concurrent) {
                    let mut futures_vec = Vec::new();
                    let mut stop_after_chunk = false;

                    for (idx, item) in chunk.iter() {
                        if let Some(expr) = &break_condition {
                            let loop_context = self.build_loop_context(step_outputs, item, *idx, &variable_name);
                            if self.evaluate_condition(expr, &loop_context, event) {
                                stop_after_chunk = true;
                                break;
                            }
                        }

                        let idx_clone = *idx;
                        let item_for_result = item.clone();
                        let item_for_future = item.clone();
                        let child_ids = child_step_ids.clone();
                        let loop_context = self.build_loop_context(step_outputs, &item_for_future, idx_clone, &variable_name);
                        let event_clone = event.clone();
                        let flow_def_clone = flow_def.clone();
                        let executor = self.clone();

                        let fut = Box::pin(async move {
                            executor
                                .execute_loop_iteration(&flow_def_clone, &child_ids, &loop_context, &event_clone, depth)
                                .await
                        });

                        futures_vec.push((idx_clone, item_for_result, fut));
                    }

                    let results = join_all(futures_vec.into_iter().map(|(idx, item, fut)| async move {
                        (idx, item, fut.await)
                    }))
                    .await;

                    for (idx, item, result) in results {
                        let iteration_outputs = result?;
                        loop_results.push(json!({
                            "index": idx,
                            "item": item,
                            "outputs": iteration_outputs,
                        }));
                    }

                    if stop_after_chunk {
                        break;
                    }
                }
            }
        }

        Ok(json!({
            "status": "loop_completed",
            "items_processed": loop_results.len(),
            "results": loop_results,
            "loop_variable": variable_name,
            "loop_step_id": step.id,
        }))
    }

    async fn execute_loop_iteration(
        &self,
        flow_def: &FlowDefinition,
        child_step_ids: &[String],
        loop_context: &HashMap<String, Value>,
        event: &PulseEvent,
        depth: i32,
    ) -> Result<HashMap<String, Value>, String> {
        let child_steps: Vec<FlowStep> = flow_def
            .steps
            .iter()
            .filter(|candidate| child_step_ids.iter().any(|id| id == &candidate.id))
            .cloned()
            .collect();

        if child_step_ids.is_empty() || child_steps.is_empty() {
            return Ok(loop_context.clone());
        }

        let child_flow = FlowDefinition {
            id: format!("{}_loop_iteration", flow_def.id),
            name: format!("{} loop iteration", flow_def.name),
            trigger: flow_def.trigger.clone(),
            steps: child_steps,
            error_policy: flow_def.error_policy.clone(),
        };

        self.execute_flow(&child_flow, event, depth + 1, loop_context.clone()).await
    }

    fn resolve_loop_items(
        &self,
        array_path: &str,
        step_outputs: &HashMap<String, Value>,
        event: &PulseEvent,
    ) -> Result<Vec<Value>, String> {
        let value = if array_path.starts_with("$.") {
            self.resolve_json_path(&event.data, array_path)?
        } else if array_path.starts_with("{{") && array_path.ends_with("}}") {
            self.transform_data(array_path, step_outputs, event)?
        } else {
            self.transform_data(&format!("{{{{{}}}}}", array_path), step_outputs, event)?
        };

        match value {
            Value::Array(items) => Ok(items),
            Value::Null => Ok(vec![]),
            other => Ok(vec![other]),
        }
    }

    fn resolve_json_path(&self, data: &Value, path: &str) -> Result<Value, String> {
        let trimmed = path.strip_prefix("$.").unwrap_or(path.strip_prefix('$').unwrap_or(path));
        if trimmed.is_empty() {
            return Ok(data.clone());
        }

        let mut current = data;
        for segment in trimmed.split('.') {
            if segment.is_empty() {
                continue;
            }

            if let Ok(index) = segment.parse::<usize>() {
                current = current
                    .as_array()
                    .and_then(|array| array.get(index))
                    .ok_or_else(|| format!("JSONPath index not found: {index}"))?;
            } else {
                current = current
                    .as_object()
                    .and_then(|object| object.get(segment))
                    .ok_or_else(|| format!("JSONPath field not found: {segment}"))?;
            }
        }

        Ok(current.clone())
    }

    fn build_loop_context(
        &self,
        base_outputs: &HashMap<String, Value>,
        loop_item: &Value,
        loop_index: usize,
        variable_name: &str,
    ) -> HashMap<String, Value> {
        let mut context = base_outputs.clone();
        context.insert(
            "loop".to_string(),
            json!({
                "item": loop_item,
                "index": loop_index,
            }),
        );
        context.insert(variable_name.to_string(), loop_item.clone());
        context.insert("loop.item".to_string(), loop_item.clone());
        context.insert("loop.index".to_string(), json!(loop_index));
        context
    }

    fn json_to_dynamic(value: &Value) -> Dynamic {
        match value {
            Value::Null => Dynamic::UNIT,
            Value::Bool(flag) => Dynamic::from(*flag),
            Value::Number(number) => {
                if let Some(value) = number.as_i64() {
                    Dynamic::from(value)
                } else if let Some(value) = number.as_u64() {
                    Dynamic::from(value as i64)
                } else {
                    Dynamic::from(number.as_f64().unwrap_or_default())
                }
            }
            Value::String(text) => Dynamic::from(text.clone()),
            Value::Array(items) => {
                let array: RhaiArray = items.iter().map(Self::json_to_dynamic).collect();
                Dynamic::from_array(array)
            }
            Value::Object(object) => {
                let mut map = RhaiMap::new();
                for (key, value) in object {
                    map.insert(key.clone().into(), Self::json_to_dynamic(value));
                }
                Dynamic::from_map(map)
            }
        }
    }

    fn render_input_mapping(
        &self,
        step: &FlowStep,
        step_outputs: &HashMap<String, Value>,
        event: &PulseEvent,
    ) -> Value {
        let Some(mapping) = &step.input_mapping else {
            return Value::Null;
        };

        let mut rendered = serde_json::Map::new();
        for (key, template) in mapping {
            match self.transform_data(template, step_outputs, event) {
                Ok(value) => {
                    rendered.insert(key.clone(), value);
                }
                Err(err) => {
                    rendered.insert(key.clone(), json!({"error": err}));
                }
            }
        }

        Value::Object(rendered)
    }

    fn evaluate_condition(
        &self,
        condition: &str,
        step_outputs: &HashMap<String, Value>,
        event: &PulseEvent,
    ) -> bool {
        let mut scope = rhai::Scope::new();
        scope.push_dynamic("event_type", Dynamic::from(event.event_type.clone()));
        scope.push_dynamic("tenant_id", Dynamic::from(event.tenant_id.to_string()));
        scope.push_dynamic("trigger", Self::json_to_dynamic(&event.data));

        for (key, value) in step_outputs {
            scope.push_dynamic(key.as_str(), Self::json_to_dynamic(value));
        }

        self.engine
            .eval_with_scope::<bool>(&mut scope, condition)
            .unwrap_or(false)
    }

    pub async fn create_pending_approval(
        &self,
        flow_run_id: uuid::Uuid,
        step: &FlowStep,
        context_json: Value,
        expires_at: chrono::DateTime<chrono::Utc>,
    ) -> Result<String, String> {
        let approval_token = uuid::Uuid::new_v4().to_string();
        let query = sqlx::query(
            r#"
            INSERT INTO pending_approvals (
                flow_run_id,
                step_id,
                approval_token,
                context_json,
                expires_at,
                status
            ) VALUES ($1, $2, $3, $4, $5, 'pending')
            "#,
        )
        .bind(flow_run_id)
        .bind(&step.id)
        .bind(&approval_token)
        .bind(&context_json)
        .bind(expires_at)
        .execute(&self.pool)
        .await;

        if let Err(error) = query {
            return Err(error.to_string());
        }

        if let Err(error) = self.send_approval_notification(&approval_token, &context_json).await {
            eprintln!("failed to send approval notification: {}", error);
        }

        Ok(approval_token)
    }

    async fn send_approval_notification(
        &self,
        approval_token: &str,
        context_json: &Value,
    ) -> Result<(), String> {
        let approval_link_base = std::env::var("APPROVAL_LINK_BASE")
            .unwrap_or_else(|_| "pulsegrid://approvals".to_string());
        let approval_link = format!("{}/{}", approval_link_base.trim_end_matches('/'), approval_token);
        let flow_name = context_json
            .get("flow_name")
            .and_then(Value::as_str)
            .unwrap_or("Unknown flow");
        let step_name = context_json
            .get("step_name")
            .and_then(Value::as_str)
            .unwrap_or("Approval step");
        let message = context_json
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("Approval required");

        if let Ok(webhook_url) = std::env::var("APPROVAL_SLACK_WEBHOOK_URL") {
            let client = reqwest::Client::new();
            client
                .post(webhook_url)
                .json(&json!({
                    "text": format!(
                        "Approval required for {flow_name} / {step_name}: {message}\n{approval_link}"
                    )
                }))
                .send()
                .await
                .map_err(|error| error.to_string())?;
            return Ok(());
        }

        let resend_api_key = match std::env::var("RESEND_API_KEY") {
            Ok(value) => value,
            Err(_) => return Ok(()),
        };
        let approval_email_to = match std::env::var("APPROVAL_EMAIL_TO") {
            Ok(value) => value,
            Err(_) => return Ok(()),
        };
        let resend_from = std::env::var("RESEND_FROM_EMAIL").unwrap_or_else(|_| "noreply@pulsegrid.local".to_string());

        let client = reqwest::Client::new();
        client
            .post("https://api.resend.com/emails")
            .bearer_auth(resend_api_key)
            .json(&json!({
                "from": resend_from,
                "to": [approval_email_to],
                "subject": format!("Approval required: {flow_name}"),
                "html": format!(
                    "<p>{message}</p><p><strong>Step:</strong> {step_name}</p><p><a href=\"{approval_link}\">Open approval request</a></p>"
                ),
            }))
            .send()
            .await
            .map_err(|error| error.to_string())?;

        Ok(())
    }

    async fn dispatch_connector_action(
        &self,
        connectors: &Connectors,
        connector: &str,
        action: &str,
        input: &Value,
    ) -> Result<Value, String> {
        // Check circuit breaker before executing connector action
        if self.is_circuit_open(connector).await.unwrap_or(false) {
            self.track_connector_error(connector).await.ok();
            return Err(format!(
                "Circuit breaker open for connector '{}': error rate exceeded threshold",
                connector
            ));
        }

        // Track the call
        self.track_connector_call(connector).await.ok();

        let get_required = |key: &str| -> Result<String, String> {
            input
                .get(key)
                .and_then(Value::as_str)
                .map(ToString::to_string)
                .ok_or_else(|| format!("missing required input field: {key}"))
        };

        let to_headers = |headers_value: Option<&serde_json::Map<String, Value>>| {
            headers_value.map(|obj| {
                obj.iter()
                    .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                    .collect::<std::collections::HashMap<String, String>>()
            })
        };

        let parse_oauth_refresh = || -> Option<OAuthRefreshConfig> {
            let oauth = input.get("oauth_refresh")?.as_object()?;
            let token_url = oauth.get("token_url")?.as_str()?.trim().to_string();
            let refresh_token = oauth.get("refresh_token")?.as_str()?.trim().to_string();
            let client_id = oauth.get("client_id")?.as_str()?.trim().to_string();
            let client_secret = oauth.get("client_secret")?.as_str()?.trim().to_string();

            if token_url.is_empty()
                || refresh_token.is_empty()
                || client_id.is_empty()
                || client_secret.is_empty()
            {
                return None;
            }

            let scope = oauth
                .get("scope")
                .and_then(Value::as_str)
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty());

            Some(OAuthRefreshConfig {
                token_url,
                refresh_token,
                client_id,
                client_secret,
                scope,
            })
        };

        // Execute the connector action
        let result = match connector {
            "http" => {
                let method = input
                    .get("method")
                    .and_then(Value::as_str)
                    .unwrap_or("POST")
                    .to_string();
                let url = get_required("url")?;
                let json_body = input.get("json_body").cloned();
                let headers = input.get("headers").and_then(Value::as_object).map(|obj| {
                    obj.iter()
                        .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                        .collect::<std::collections::HashMap<String, String>>()
                });

                let cfg = HttpConfig {
                    url,
                    method,
                    json_body,
                    headers,
                    oauth_refresh: parse_oauth_refresh(),
                    oauth_access_token: input
                        .get("oauth_access_token")
                        .and_then(Value::as_str)
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty()),
                };
                connectors
                    .execute_http(&cfg)
                    .await
                    .map_err(|e| e.to_string())
            }
            "slack" => {
                let webhook_url = get_required("webhook_url")?;
                let text = get_required("text")?;
                connectors
                    .execute_slack(&webhook_url, &text)
                    .await
                    .map_err(|e| e.to_string())?;
                Ok(json!({"success": true}))
            }
            "gmail" => {
                let cfg = GmailSendConfig {
                    access_token: get_required("access_token")?,
                    from: get_required("from")?,
                    to: get_required("to")?,
                    subject: get_required("subject")?,
                    body: get_required("body")?,
                    oauth_refresh: parse_oauth_refresh(),
                };
                connectors
                    .execute_gmail_send(&cfg)
                    .await
                    .map_err(|e| e.to_string())
            }
            "github" => {
                let cfg = GithubIssueConfig {
                    access_token: get_required("access_token")?,
                    owner: get_required("owner")?,
                    repo: get_required("repo")?,
                    title: get_required("title")?,
                    body: input
                        .get("body")
                        .and_then(Value::as_str)
                        .map(ToString::to_string),
                };
                connectors
                    .execute_github_issue_create(&cfg)
                    .await
                    .map_err(|e| e.to_string())
            }
            "telegram" => {
                let cfg = TelegramConfig {
                    bot_token: get_required("bot_token")?,
                    chat_id: get_required("chat_id")?,
                    text: get_required("text")?,
                };
                connectors
                    .execute_telegram_send(&cfg)
                    .await
                    .map_err(|e| e.to_string())
            }
            "googlesheets" | "google_sheets" => {
                let values = input
                    .get("values")
                    .and_then(Value::as_array)
                    .ok_or_else(|| "missing required input field: values".to_string())?
                    .iter()
                    .map(|row| {
                        row.as_array()
                            .map(|cells| {
                                cells
                                    .iter()
                                    .map(|v| v.as_str().unwrap_or_default().to_string())
                                    .collect::<Vec<String>>()
                            })
                            .ok_or_else(|| "values must be a 2D array".to_string())
                    })
                    .collect::<Result<Vec<Vec<String>>, String>>()?;

                let cfg = GoogleSheetsAppendConfig {
                    access_token: get_required("access_token")?,
                    spreadsheet_id: get_required("spreadsheet_id")?,
                    range: get_required("range")?,
                    values,
                };
                connectors
                    .execute_google_sheets_append(&cfg)
                    .await
                    .map_err(|e| e.to_string())
            }
            "notion" => {
                let cfg = NotionCreatePageConfig {
                    access_token: get_required("access_token")?,
                    database_id: get_required("database_id")?,
                    properties: input
                        .get("properties")
                        .cloned()
                        .ok_or_else(|| "missing required input field: properties".to_string())?,
                };
                connectors
                    .execute_notion_create_page(&cfg)
                    .await
                    .map_err(|e| e.to_string())
            }
            "discord" => {
                let cfg = DiscordConfig {
                    webhook_url: get_required("webhook_url")?,
                    content: get_required("content")?,
                };
                connectors
                    .execute_discord_send(&cfg)
                    .await
                    .map_err(|e| e.to_string())
            }
            "custom" | "custom_app" => {
                let headers = to_headers(input.get("headers").and_then(Value::as_object));

                let cfg = CustomConnectorConfig {
                    endpoint_url: get_required("endpoint_url")?,
                    method: input
                        .get("method")
                        .and_then(Value::as_str)
                        .unwrap_or("POST")
                        .to_string(),
                    body: input.get("body").cloned(),
                    headers,
                    bearer_token: input
                        .get("bearer_token")
                        .and_then(Value::as_str)
                        .map(ToString::to_string),
                    api_key_header: input
                        .get("api_key_header")
                        .and_then(Value::as_str)
                        .map(ToString::to_string),
                    api_key_value: input
                        .get("api_key_value")
                        .and_then(Value::as_str)
                        .map(ToString::to_string),
                };

                connectors
                    .execute_custom_connector(&cfg)
                    .await
                    .map_err(|e| e.to_string())
            }
            "resend" | "openai" | "anthropic" | "airtable" | "hubspot" | "jira" | "linear"
            | "asana" | "clickup" | "trello" | "zendesk" | "pagerduty" | "stripe" | "sendgrid"
            | "salesforce" | "shopify" | "gitlab" | "monday" | "brevo" => {
                let required_secret = match connector {
                    "resend" | "stripe" | "sendgrid" | "monday" | "brevo" => Some("api_key"),
                    "jira" | "salesforce" | "shopify" | "gitlab" => Some("access_token"),
                    _ => None,
                };

                if let Some(key) = required_secret {
                    if input.get(key).and_then(Value::as_str).is_none() {
                        return Err(format!("missing required input field: {key}"));
                    }
                }

                // Use Connector trait for all 21 missing connectors
                if let Some(connector_impl) = connectors.get_connector(connector) {
                    connector_impl
                        .execute_action(&Credentials {
                            connector_id: connector.to_string(),
                            encrypted_blob: vec![],
                            nonce: vec![],
                            expires_at: None,
                        }, action, input.clone())
                        .await
                        .map_err(|e| e.to_string())
                } else {
                    Err(format!("connector not found: {}", connector))
                }
            }
            "webhook" => {
                let signature_valid = connectors
                    .verify_webhook_signature(&core_connectors::WebhookVerifyConfig {
                        secret: get_required("secret")?,
                        raw_payload: get_required("raw_payload")?,
                        provided_signature: get_required("provided_signature")?,
                    })
                    .map_err(|e| e.to_string())?;

                Ok(json!({ "is_valid": signature_valid }))
            }
            "schedule" => {
                let from = input
                    .get("from")
                    .and_then(Value::as_str)
                    .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                    .map(|dt| dt.with_timezone(&chrono::Utc))
                    .unwrap_or_else(chrono::Utc::now);
                let cron_expr = get_required("cron")?;
                let next = connectors
                    .schedule_next_run(&cron_expr, from)
                    .map_err(|e| e.to_string())?;
                Ok(json!({ "next_run_at": next.to_rfc3339() }))
            }
            _ => {
                if action == "noop" {
                    Ok(json!({"success": true}))
                } else {
                    Err(format!("unsupported connector: {connector}"))
                }
            }
        };

        // Track errors on failure and return result
        if result.is_err() {
            self.track_connector_error(connector).await.ok();
        }

        result
    }

    /// Get approval context from database by flow run and step
    #[allow(dead_code)]
    pub async fn get_approval_context_for_resume(
        &self,
        flow_run_id: uuid::Uuid,
        step_id: &str,
    ) -> Result<Option<crate::models::PendingApproval>, String> {
        sqlx::query_as::<_, crate::models::PendingApproval>(
            "SELECT * FROM pending_approvals WHERE flow_run_id = $1 AND step_id = $2 ORDER BY created_at DESC LIMIT 1"
        )
        .bind(flow_run_id)
        .bind(step_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| format!("Failed to fetch approval context: {}", e))
    }
}


#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[tokio::test]
    async fn matches_trigger_with_filters() {
        let executor = FlowExecutor::new(
            sqlx::PgPool::connect_lazy("postgres://postgres:postgres@localhost:5432/pulsegrid").unwrap(),
            std::sync::Arc::new(core_vault::Vault::new("test_password", b"test_salt"))
        );
        let trigger = TriggerDefinition {
            connector: "shopify".to_string(),
            event: "order.created".to_string(),
            filters: vec![FilterCondition {
                field: "order.total_price".to_string(),
                op: "gt".to_string(),
                value: json!(100),
            }],
        };

        let event = PulseEvent {
            id: Uuid::new_v4(),
            tenant_id: Uuid::new_v4(),
            source: Some("shopify".to_string()),
            event_type: "order.created".to_string(),
            data: json!({"order": {"total_price": 150}}),
            sub_flow_depth: None,
        };

        assert!(executor.matches_trigger(&trigger, &event));
    }

    #[tokio::test]
    async fn resolve_execution_order_groups_parallel_steps() {
        let executor = FlowExecutor::new(
            sqlx::PgPool::connect_lazy("postgres://postgres:1234@localhost:5432/pulsegrid").unwrap(),
            std::sync::Arc::new(core_vault::Vault::new("test_password", b"test_salt"))
        );
        let steps = vec![
            FlowStep {
                id: "split".into(),
                r#type: "parallel_split".into(),
                connector: None,
                action: None,
                input_mapping: None,
                depends_on: vec![],
                retry_policy: Default::default(),
                condition: None,
                script_language: None,
                code: None,
                loop_config: None,
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
            },
            FlowStep {
                id: "branch_a".into(),
                r#type: "action".into(),
                connector: None,
                action: None,
                input_mapping: None,
                depends_on: vec!["split".into()],
                retry_policy: Default::default(),
                condition: None,
                script_language: None,
                code: None,
                loop_config: None,
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
            },
            FlowStep {
                id: "branch_b".into(),
                r#type: "action".into(),
                connector: None,
                action: None,
                input_mapping: None,
                depends_on: vec!["split".into()],
                retry_policy: Default::default(),
                condition: None,
                script_language: None,
                code: None,
                loop_config: None,
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
            },
            FlowStep {
                id: "merge".into(),
                r#type: "merge".into(),
                connector: None,
                action: None,
                input_mapping: None,
                depends_on: vec!["branch_a".into(), "branch_b".into()],
                retry_policy: Default::default(),
                condition: None,
                script_language: None,
                code: None,
                loop_config: None,
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
            },
        ];

        let groups = executor.resolve_execution_order(&steps).unwrap();
        assert_eq!(groups.len(), 3);
        assert_eq!(groups[0], vec!["split"]);
        assert_eq!(groups[1].len(), 2);
        assert!(groups[1].contains(&"branch_a".to_string()));
        assert!(groups[1].contains(&"branch_b".to_string()));
        assert_eq!(groups[2], vec!["merge"]);
    }

    #[tokio::test]
    async fn transform_data_replaces_template_values() {
        let executor = FlowExecutor::new(
            sqlx::PgPool::connect_lazy("postgres://postgres:postgres@localhost:5432/pulsegrid").unwrap(),
            std::sync::Arc::new(core_vault::Vault::new("test_password", b"test_salt"))
        );
        let event = PulseEvent {
            id: Uuid::new_v4(),
            tenant_id: Uuid::new_v4(),
            source: Some("github".into()),
            event_type: "push".into(),
            data: json!({"user": {"email": "TEST@EXAMPLE.COM"}}),
            sub_flow_depth: None,
        };
        let outputs =
            HashMap::from([("step1".to_string(), json!({"profile": {"name": "Imantha"}}))]);

        let result = executor
            .transform_data(
                "{{trigger.user.email | lowercase}}/{{step1.profile.name}}",
                &outputs,
                &event,
            )
            .unwrap();

        assert_eq!(
            result,
            Value::String("test@example.com/Imantha".to_string())
        );
    }
}

pub async fn start_connector_health_check_worker(pg_pool: sqlx::PgPool) {
    let vault = Arc::new(core_vault::Vault::new("default_key", b"default_salt"));
    let executor = Arc::new(FlowExecutor::new(pg_pool.clone(), vault));
    let check_interval = std::env::var("HEALTH_CHECK_INTERVAL_SECONDS")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(30)
        .max(5);

    loop {
        tokio::time::sleep(Duration::from_secs(check_interval)).await;

        // Get all connectors with open circuits from connector_health table
        let open_circuits = sqlx::query!(
            r#"
            SELECT DISTINCT connector_id, workspace_id
            FROM connector_health
            WHERE status = 'circuit_open'
            "#
        )
        .fetch_all(&pg_pool)
        .await
        .unwrap_or_default();

        for circuit in open_circuits {
            // Try to perform a health check on the connector
            let health_ok = match check_connector_health(&executor, &circuit.connector_id, &circuit.workspace_id).await {
                Ok(true) => true,
                _ => false,
            };

            if health_ok {
                // Circuit has recovered - close it
                let _ = sqlx::query!(
                    r#"
                    UPDATE connector_health
                    SET status = 'healthy', circuit_open_at = NULL, healthy_check_passed_at = NOW()
                    WHERE connector_id = $1 AND workspace_id = $2
                    "#,
                    circuit.connector_id,
                    circuit.workspace_id
                )
                .execute(&pg_pool)
                .await;

                // Resume flows that were paused due to this connector
                let _ = sqlx::query!(
                    r#"
                    UPDATE flow_runs
                    SET paused_at = NULL, paused_reason = NULL
                    WHERE workspace_id = $1
                      AND paused_reason LIKE $2
                      AND status = 'running'
                    "#,
                    circuit.workspace_id,
                    format!("circuit_open:{}", circuit.connector_id)
                )
                .execute(&pg_pool)
                .await;

                println!("✅ Circuit breaker CLOSED for connector {} - flows resumed", circuit.connector_id);
            }
        }
    }
}

async fn check_connector_health(_executor: &Arc<FlowExecutor>, _connector_id: &str, _workspace_id: &uuid::Uuid) -> Result<bool, String> {
    // Build a minimal health check based on connector type
    // This is a stub - extend with actual health checks per connector
    match _connector_id.to_uppercase().as_str() {
        "SLACK" | "DISCORD" | "TELEGRAM" => {
            // These connectors typically don't need active health checks
            Ok(true)
        }
        "HTTP" | "WEBHOOK" => {
            // Could implement HTTP endpoint checks
            Ok(true)
        }
        "NOTION" | "GOOGLE_SHEETS" | "GITHUB" => {
            // Could implement OAuth token refresh checks
            Ok(true)
        }
        _ => {
            // Default: assume healthy unless we can prove otherwise
            Ok(true)
        }
    }
}
