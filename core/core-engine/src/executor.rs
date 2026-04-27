use crate::models::{
    FilterCondition, FlowStep, PulseEvent, StepExecutionResult, TriggerDefinition,
};
use core_connectors::{
    Connectors, CustomConnectorConfig, DiscordConfig, GithubIssueConfig, GmailSendConfig,
    GoogleSheetsAppendConfig, HttpConfig, NotionCreatePageConfig, TelegramConfig,
};
use core_vm::CoreVm;
use rhai::{Dynamic, Engine};
use serde_json::{Value, json};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

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

                let exec_result = self
                    .dispatch_connector_action(&connectors, &connector_name, &action_name, &input)
                    .await;

                match exec_result {
                    Ok(value) => json!({
                        "step_id": step.id,
                        "connector": step.connector,
                        "action": step.action,
                        "input": input,
                        "output": value,
                        "status": "executed"
                    }),
                    Err(err) => {
                        return StepExecutionResult {
                            step_id: step.id.clone(),
                            status: "failed".to_string(),
                            output: Value::Null,
                            error: Some(err),
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
            other => {
                return StepExecutionResult {
                    step_id: step.id.clone(),
                    status: "failed".to_string(),
                    output: Value::Null,
                    error: Some(format!("Unknown step type: {other}")),
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

        let get_optional = |key: &str| -> Option<String> {
            input
                .get(key)
                .and_then(Value::as_str)
                .map(ToString::to_string)
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
            "resend" => {
                let cfg = CustomConnectorConfig {
                    endpoint_url: "https://api.resend.com/emails".to_string(),
                    method: "POST".to_string(),
                    body: Some(json!({
                        "from": get_required("from")?,
                        "to": [get_required("to")?],
                        "subject": get_required("subject")?,
                        "html": get_required("html")?
                    })),
                    headers: None,
                    bearer_token: Some(get_required("api_key")?),
                    api_key_header: None,
                    api_key_value: None,
                };

                connectors
                    .execute_custom_connector(&cfg)
                    .await
                    .map_err(|e| e.to_string())
            }
            "openai" => {
                let cfg = CustomConnectorConfig {
                    endpoint_url: get_optional("endpoint_url").unwrap_or_else(|| {
                        "https://api.openai.com/v1/chat/completions".to_string()
                    }),
                    method: "POST".to_string(),
                    body: Some(json!({
                        "model": input.get("model").cloned().unwrap_or(json!("gpt-4o-mini")),
                        "messages": input.get("messages").cloned().unwrap_or(json!([])),
                        "temperature": input.get("temperature").cloned().unwrap_or(json!(0.2))
                    })),
                    headers: None,
                    bearer_token: Some(get_required("api_key")?),
                    api_key_header: None,
                    api_key_value: None,
                };

                connectors
                    .execute_custom_connector(&cfg)
                    .await
                    .map_err(|e| e.to_string())
            }
            "anthropic" => {
                let cfg = CustomConnectorConfig {
                    endpoint_url: get_optional("endpoint_url")
                        .unwrap_or_else(|| "https://api.anthropic.com/v1/messages".to_string()),
                    method: "POST".to_string(),
                    body: Some(json!({
                        "model": input.get("model").cloned().unwrap_or(json!("claude-3-5-sonnet-latest")),
                        "max_tokens": input.get("max_tokens").cloned().unwrap_or(json!(512)),
                        "messages": input.get("messages").cloned().unwrap_or(json!([])),
                    })),
                    headers: Some(std::collections::HashMap::from([(
                        "anthropic-version".to_string(),
                        "2023-06-01".to_string(),
                    )])),
                    bearer_token: None,
                    api_key_header: Some("x-api-key".to_string()),
                    api_key_value: Some(get_required("api_key")?),
                };

                connectors
                    .execute_custom_connector(&cfg)
                    .await
                    .map_err(|e| e.to_string())
            }
            "airtable" => {
                let base_id = get_required("base_id")?;
                let table = get_required("table")?;
                let cfg = CustomConnectorConfig {
                    endpoint_url: format!("https://api.airtable.com/v0/{base_id}/{table}"),
                    method: "POST".to_string(),
                    body: Some(json!({
                        "records": [
                            {
                                "fields": input.get("fields").cloned().unwrap_or(json!({}))
                            }
                        ]
                    })),
                    headers: None,
                    bearer_token: Some(get_required("api_key")?),
                    api_key_header: None,
                    api_key_value: None,
                };

                connectors
                    .execute_custom_connector(&cfg)
                    .await
                    .map_err(|e| e.to_string())
            }
            "hubspot" => {
                let cfg = CustomConnectorConfig {
                    endpoint_url: "https://api.hubapi.com/crm/v3/objects/contacts".to_string(),
                    method: "POST".to_string(),
                    body: Some(json!({
                        "properties": input.get("properties").cloned().unwrap_or(json!({}))
                    })),
                    headers: None,
                    bearer_token: Some(get_required("access_token")?),
                    api_key_header: None,
                    api_key_value: None,
                };

                connectors
                    .execute_custom_connector(&cfg)
                    .await
                    .map_err(|e| e.to_string())
            }
            "jira" => {
                let domain = get_required("domain")?;
                let cfg = CustomConnectorConfig {
                    endpoint_url: format!("https://{domain}/rest/api/3/issue"),
                    method: "POST".to_string(),
                    body: Some(json!({
                        "fields": input.get("fields").cloned().unwrap_or(json!({}))
                    })),
                    headers: Some(std::collections::HashMap::from([(
                        "Accept".to_string(),
                        "application/json".to_string(),
                    )])),
                    bearer_token: Some(get_required("access_token")?),
                    api_key_header: None,
                    api_key_value: None,
                };

                connectors
                    .execute_custom_connector(&cfg)
                    .await
                    .map_err(|e| e.to_string())
            }
            "linear" => {
                let cfg = CustomConnectorConfig {
                    endpoint_url: "https://api.linear.app/graphql".to_string(),
                    method: "POST".to_string(),
                    body: Some(json!({
                        "query": input.get("query").cloned().unwrap_or(json!("mutation IssueCreate($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier title } } }")),
                        "variables": input.get("variables").cloned().unwrap_or(json!({}))
                    })),
                    headers: None,
                    bearer_token: Some(get_required("api_key")?),
                    api_key_header: None,
                    api_key_value: None,
                };

                connectors
                    .execute_custom_connector(&cfg)
                    .await
                    .map_err(|e| e.to_string())
            }
            "asana" => {
                let cfg = CustomConnectorConfig {
                    endpoint_url: "https://app.asana.com/api/1.0/tasks".to_string(),
                    method: "POST".to_string(),
                    body: Some(json!({
                        "data": input.get("data").cloned().unwrap_or(json!({}))
                    })),
                    headers: None,
                    bearer_token: Some(get_required("access_token")?),
                    api_key_header: None,
                    api_key_value: None,
                };

                connectors
                    .execute_custom_connector(&cfg)
                    .await
                    .map_err(|e| e.to_string())
            }
            "clickup" => {
                let list_id = get_required("list_id")?;
                let cfg = CustomConnectorConfig {
                    endpoint_url: format!("https://api.clickup.com/api/v2/list/{list_id}/task"),
                    method: "POST".to_string(),
                    body: Some(json!({
                        "name": get_required("name")?,
                        "description": input.get("description").cloned().unwrap_or(json!("")),
                        "assignees": input.get("assignees").cloned().unwrap_or(json!([])),
                        "tags": input.get("tags").cloned().unwrap_or(json!([]))
                    })),
                    headers: None,
                    bearer_token: None,
                    api_key_header: Some("Authorization".to_string()),
                    api_key_value: Some(get_required("api_key")?),
                };

                connectors
                    .execute_custom_connector(&cfg)
                    .await
                    .map_err(|e| e.to_string())
            }
            "trello" => {
                let key = get_required("key")?;
                let token = get_required("token")?;
                let list_id = get_required("list_id")?;
                let endpoint_url = format!(
                    "https://api.trello.com/1/cards?idList={list_id}&key={key}&token={token}"
                );
                let cfg = CustomConnectorConfig {
                    endpoint_url,
                    method: "POST".to_string(),
                    body: Some(json!({
                        "name": get_required("name")?,
                        "desc": input.get("desc").cloned().unwrap_or(json!(""))
                    })),
                    headers: None,
                    bearer_token: None,
                    api_key_header: None,
                    api_key_value: None,
                };

                connectors
                    .execute_custom_connector(&cfg)
                    .await
                    .map_err(|e| e.to_string())
            }
            "zendesk" => {
                let subdomain = get_required("subdomain")?;
                let cfg = CustomConnectorConfig {
                    endpoint_url: format!("https://{subdomain}.zendesk.com/api/v2/tickets.json"),
                    method: "POST".to_string(),
                    body: Some(json!({
                        "ticket": input.get("ticket").cloned().unwrap_or(json!({}))
                    })),
                    headers: None,
                    bearer_token: Some(get_required("access_token")?),
                    api_key_header: None,
                    api_key_value: None,
                };

                connectors
                    .execute_custom_connector(&cfg)
                    .await
                    .map_err(|e| e.to_string())
            }
            "pagerduty" => {
                let headers = std::collections::HashMap::from([(
                    "Content-Type".to_string(),
                    "application/json".to_string(),
                )]);
                let cfg = CustomConnectorConfig {
                    endpoint_url: "https://events.pagerduty.com/v2/enqueue".to_string(),
                    method: "POST".to_string(),
                    body: Some(json!({
                        "routing_key": get_required("routing_key")?,
                        "event_action": input.get("event_action").cloned().unwrap_or(json!("trigger")),
                        "payload": input.get("payload").cloned().unwrap_or(json!({}))
                    })),
                    headers: Some(headers),
                    bearer_token: None,
                    api_key_header: None,
                    api_key_value: None,
                };

                connectors
                    .execute_custom_connector(&cfg)
                    .await
                    .map_err(|e| e.to_string())
            }
            "stripe" => {
                let cfg = CustomConnectorConfig {
                    endpoint_url: get_optional("endpoint_url")
                        .unwrap_or_else(|| "https://api.stripe.com/v1/customers".to_string()),
                    method: get_optional("method").unwrap_or_else(|| "POST".to_string()),
                    body: Some(input.get("body").cloned().unwrap_or(json!({}))),
                    headers: to_headers(input.get("headers").and_then(Value::as_object)),
                    bearer_token: None,
                    api_key_header: Some("Authorization".to_string()),
                    api_key_value: Some(format!("Bearer {}", get_required("api_key")?)),
                };

                connectors
                    .execute_custom_connector(&cfg)
                    .await
                    .map_err(|e| e.to_string())
            }
            "sendgrid" => {
                let cfg = CustomConnectorConfig {
                    endpoint_url: "https://api.sendgrid.com/v3/mail/send".to_string(),
                    method: "POST".to_string(),
                    body: Some(json!({
                        "from": { "email": get_required("from")? },
                        "personalizations": [{
                            "to": [{ "email": get_required("to")? }],
                            "subject": get_required("subject")?
                        }],
                        "content": [{
                            "type": input.get("content_type").cloned().unwrap_or(json!("text/plain")),
                            "value": get_required("content")?
                        }]
                    })),
                    headers: None,
                    bearer_token: Some(get_required("api_key")?),
                    api_key_header: None,
                    api_key_value: None,
                };

                connectors
                    .execute_custom_connector(&cfg)
                    .await
                    .map_err(|e| e.to_string())
            }
            "salesforce" => {
                let instance_url = get_required("instance_url")?;
                let object_api_name = get_required("object_api_name")?;
                let api_version =
                    get_optional("api_version").unwrap_or_else(|| "v61.0".to_string());
                let cfg = CustomConnectorConfig {
                    endpoint_url: format!(
                        "{}/services/data/{}/sobjects/{}/",
                        instance_url.trim_end_matches('/'),
                        api_version,
                        object_api_name,
                    ),
                    method: "POST".to_string(),
                    body: Some(input.get("fields").cloned().unwrap_or(json!({}))),
                    headers: Some(std::collections::HashMap::from([(
                        "Content-Type".to_string(),
                        "application/json".to_string(),
                    )])),
                    bearer_token: Some(get_required("access_token")?),
                    api_key_header: None,
                    api_key_value: None,
                };

                connectors
                    .execute_custom_connector(&cfg)
                    .await
                    .map_err(|e| e.to_string())
            }
            "shopify" => {
                let store_domain = get_required("store_domain")?;
                let endpoint_path = get_optional("endpoint_path")
                    .unwrap_or_else(|| "/admin/api/2024-10/customers.json".to_string());
                let normalized_path = if endpoint_path.starts_with('/') {
                    endpoint_path
                } else {
                    format!("/{endpoint_path}")
                };
                let cfg = CustomConnectorConfig {
                    endpoint_url: format!(
                        "https://{}{}",
                        store_domain.trim_end_matches('/'),
                        normalized_path
                    ),
                    method: get_optional("method").unwrap_or_else(|| "POST".to_string()),
                    body: Some(input.get("body").cloned().unwrap_or(json!({}))),
                    headers: to_headers(input.get("headers").and_then(Value::as_object)),
                    bearer_token: None,
                    api_key_header: Some("X-Shopify-Access-Token".to_string()),
                    api_key_value: Some(get_required("access_token")?),
                };

                connectors
                    .execute_custom_connector(&cfg)
                    .await
                    .map_err(|e| e.to_string())
            }
            "gitlab" => {
                let project_id = get_required("project_id")?;
                let cfg = CustomConnectorConfig {
                    endpoint_url: format!("https://gitlab.com/api/v4/projects/{project_id}/issues"),
                    method: "POST".to_string(),
                    body: Some(json!({
                        "title": get_required("title")?,
                        "description": get_optional("description").unwrap_or_default(),
                        "labels": get_optional("labels").unwrap_or_default(),
                        "assignee_ids": input.get("assignee_ids").cloned().unwrap_or(json!([]))
                    })),
                    headers: None,
                    bearer_token: Some(get_required("access_token")?),
                    api_key_header: None,
                    api_key_value: None,
                };

                connectors
                    .execute_custom_connector(&cfg)
                    .await
                    .map_err(|e| e.to_string())
            }
            "monday" => {
                let cfg = CustomConnectorConfig {
                    endpoint_url: "https://api.monday.com/v2".to_string(),
                    method: "POST".to_string(),
                    body: Some(json!({
                        "query": get_required("query")?,
                        "variables": input.get("variables").cloned().unwrap_or(json!({}))
                    })),
                    headers: Some(std::collections::HashMap::from([(
                        "Content-Type".to_string(),
                        "application/json".to_string(),
                    )])),
                    bearer_token: None,
                    api_key_header: Some("Authorization".to_string()),
                    api_key_value: Some(get_required("api_key")?),
                };

                connectors
                    .execute_custom_connector(&cfg)
                    .await
                    .map_err(|e| e.to_string())
            }
            "brevo" => {
                let cfg = CustomConnectorConfig {
                    endpoint_url: "https://api.brevo.com/v3/smtp/email".to_string(),
                    method: "POST".to_string(),
                    body: Some(json!({
                        "sender": { "email": get_required("from")? },
                        "to": [{ "email": get_required("to")? }],
                        "subject": get_required("subject")?,
                        "htmlContent": get_required("html_content")?,
                        "replyTo": get_optional("reply_to").map(|email| json!({"email": email})).unwrap_or(json!(null))
                    })),
                    headers: Some(std::collections::HashMap::from([(
                        "accept".to_string(),
                        "application/json".to_string(),
                    )])),
                    bearer_token: None,
                    api_key_header: Some("api-key".to_string()),
                    api_key_value: Some(get_required("api_key")?),
                };

                connectors
                    .execute_custom_connector(&cfg)
                    .await
                    .map_err(|e| e.to_string())
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
