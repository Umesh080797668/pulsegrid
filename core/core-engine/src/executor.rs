use crate::models::{
    FilterCondition, FlowStep, PulseEvent, StepExecutionResult, TriggerDefinition, FlowDefinition,
};
use futures_util::future::join_all;
use core_connectors::{
    Connectors, CustomConnectorConfig, DiscordConfig, GithubIssueConfig, GmailSendConfig,
    GoogleSheetsAppendConfig, HttpConfig, NotionCreatePageConfig, TelegramConfig, Credentials,
};
use core_vm::CoreVm;
use rhai::{Dynamic, Engine};
use serde_json::{Value, json};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::Duration;
use tokio::time::sleep;

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
        let redis_url = "redis://127.0.0.1:6379/";
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
    ) -> Result<std::collections::HashMap<String, Value>, String> {
        if depth > 3 {
            return Err("sub-flow depth exceeded".to_string());
        }

        let execution_order = self.resolve_execution_order(&flow_def.steps)?;
        let mut step_outputs: std::collections::HashMap<String, Value> = std::collections::HashMap::new();

        for group in execution_order {
            use std::pin::Pin;
            let mut futures_vec: Vec<Pin<Box<dyn std::future::Future<Output = StepExecutionResult> + '_>>> = Vec::new();

            for step_id in &group {
                if let Some(step) = flow_def.steps.iter().find(|s| &s.id == step_id) {
                    let step_clone = step.clone();
                    let event_clone = event.clone();
                    let outputs_snapshot = step_outputs.clone();

                    let fut = Box::pin(async move {
                        // sub_flow special-case
                        if step_clone.r#type == "sub_flow" {
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
                                .fetch_optional(&self.pool)
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

                            let mut nested_event = event_clone.clone();
                            nested_event.sub_flow_depth = Some(current_depth + 1);

                            match self.execute_flow(&sub_def, &nested_event, current_depth + 1).await {
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
                            let input = self.render_input_mapping(&step_clone, &outputs_snapshot, &event_clone);
                            let max_attempts = (step_clone.retry_policy.max_retries + 1).max(1) as usize;
                            let base_delay_ms = if step_clone.retry_policy.initial_backoff_ms > 0 {
                                step_clone.retry_policy.initial_backoff_ms as u64
                            } else { 500 };

                            let mut last_err: Option<String> = None;
                            for attempt in 0..max_attempts {
                                let res = self.execute_step(&step_clone, input.clone(), &outputs_snapshot, &event_clone).await;
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
                let input = self.render_input_mapping(step, step_outputs, event);
                let mut input_obj = input.as_object().cloned().unwrap_or_default();
                let upper_connector = connector_name.to_uppercase();
                if let Ok(row) = sqlx::query!("SELECT encrypted_blob, nonce FROM credentials WHERE workspace_id = $1 AND connector_id = $2", event.tenant_id, upper_connector)
                    .fetch_one(&self.pool)
                    .await
                {
                    if let Ok(decrypted) = self.vault.decrypt(&row.encrypted_blob, &row.nonce) {
                        if let Ok(secret_json) = serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(&decrypted) {
                            for (k, v) in secret_json {
                                input_obj.entry(k).or_insert(v);
                            }
                        } else {
                            input_obj.entry("access_token".to_string()).or_insert(serde_json::Value::String(decrypted.clone()));
                            input_obj.entry("bot_token".to_string()).or_insert(serde_json::Value::String(decrypted));
                        }
                    }
                }
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
                    "input": _input_data,
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
            "loop" => {
                let items_expr = step.loop_items.as_deref().unwrap_or("");
                let loop_var = step.loop_variable_name.as_deref().unwrap_or("item");
                let max_iters = step.max_iterations.unwrap_or(100) as usize;

                let items = match self.transform_data(items_expr, step_outputs, event) {
                    Ok(v) => v,
                    Err(e) => {
                        return StepExecutionResult {
                            step_id: step.id.clone(),
                            status: "failed".to_string(),
                            output: Value::Null,
                            error: Some(format!("loop items resolution failed: {e}")),
                            duration_ms: started.elapsed().as_millis() as i32,
                        };
                    }
                };

                let default_arr = vec![];
                let arr = items.as_array().unwrap_or(&default_arr);
                let mut loop_outputs = Vec::new();

                for (idx, item) in arr.iter().take(max_iters).enumerate() {
                    let mut loop_context = step_outputs.clone();
                    loop_context.insert(loop_var.to_string(), item.clone());
                    loop_context.insert("__index".to_string(), json!(idx));

                    if let Some(loop_cond) = &step.loop_condition {
                        if !self.evaluate_condition(loop_cond, &loop_context, event) {
                            break;
                        }
                    }

                    loop_outputs.push(item.clone());
                }

                json!({
                    "status": "loop_completed",
                    "items_processed": loop_outputs.len(),
                    "results": loop_outputs,
                    "loop_variable": loop_var,
                })
            }
            "parallel" => {
                let default_steps = vec![];
                let step_ids = step.parallel_steps.as_ref().unwrap_or(&default_steps);
                json!({
                    "status": "parallel_scheduled",
                    "parallel_steps": step_ids,
                    "note": "Parallel execution handled by main event loop; this is a marker step",
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

                let mut nested_event = event.clone();
                nested_event.sub_flow_depth = Some(current_depth + 1);

                match self.execute_flow(&sub_def, &nested_event, current_depth + 1).await {
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
                    "input": _input_data,
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
                    error: Some(format!("Unknown or unimplemented step type: {other}. Supported types: action, condition, script, loop, parallel, sub_flow, filter, transform, delay, fork")),
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

        for (key, value) in step_outputs {
            let dynamic = match value {
                Value::String(text) => Dynamic::from(text.clone()),
                Value::Bool(flag) => Dynamic::from(*flag),
                Value::Number(number) => Dynamic::from(number.as_f64().unwrap_or_default()),
                _ => Dynamic::from(value.to_string()),
            };
            scope.push_dynamic(key.as_str(), dynamic);
        }

        self.engine
            .eval_with_scope::<bool>(&mut scope, condition)
            .unwrap_or(false)
    }

    async fn dispatch_connector_action(
        &self,
        connectors: &Connectors,
        connector: &str,
        action: &str,
        input: &Value,
    ) -> Result<Value, String> {
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

        match connector {
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
        }
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
                id: "step1".into(),
                r#type: "action".into(),
                connector: None,
                action: None,
                input_mapping: None,
                depends_on: vec![],
                retry_policy: Default::default(),
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
            },
            FlowStep {
                id: "step2".into(),
                r#type: "action".into(),
                connector: None,
                action: None,
                input_mapping: None,
                depends_on: vec!["step1".into()],
                retry_policy: Default::default(),
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
            },
            FlowStep {
                id: "step3".into(),
                r#type: "action".into(),
                connector: None,
                action: None,
                input_mapping: None,
                depends_on: vec!["step1".into()],
                retry_policy: Default::default(),
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
            },
        ];

        let groups = executor.resolve_execution_order(&steps).unwrap();
        assert_eq!(groups.len(), 2);
        assert_eq!(groups[0], vec!["step1"]);
        assert_eq!(groups[1].len(), 2);
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
