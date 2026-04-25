use crate::models::{
    FilterCondition, FlowStep, PulseEvent, StepExecutionResult, TriggerDefinition,
};
use rhai::{Dynamic, Engine};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

#[derive(Clone)]
pub struct FlowExecutor {
    engine: Arc<Engine>,
}

impl FlowExecutor {
    pub fn new() -> Self {
        Self {
            engine: Arc::new(Engine::new()),
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
            "gt" => current.as_f64().zip(filter.value.as_f64()).is_some_and(|(a, b)| a > b),
            "gte" => current.as_f64().zip(filter.value.as_f64()).is_some_and(|(a, b)| a >= b),
            "lt" => current.as_f64().zip(filter.value.as_f64()).is_some_and(|(a, b)| a < b),
            "lte" => current.as_f64().zip(filter.value.as_f64()).is_some_and(|(a, b)| a <= b),
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
        let step_map: HashMap<&str, &FlowStep> = steps.iter().map(|step| (step.id.as_str(), step)).collect();
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
            let Some(start) = rendered.find("{{") else { break; };
            let Some(end_rel) = rendered[start + 2..].find("}}") else { break; };
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
            "lowercase" => Ok(Value::String(value.as_str().unwrap_or_default().to_lowercase())),
            "uppercase" => Ok(Value::String(value.as_str().unwrap_or_default().to_uppercase())),
            "trim" => Ok(Value::String(value.as_str().unwrap_or_default().trim().to_string())),
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
            "action" => json!({
                "step_id": step.id,
                "connector": step.connector,
                "action": step.action,
                "input": self.render_input_mapping(step, step_outputs, event),
                "status": "executed"
            }),
            "condition" => json!({
                "result": step.condition.as_deref().map(|condition| self.evaluate_condition(condition, step_outputs, event)).unwrap_or(false)
            }),
            "script" => json!({"status": "script_executed"}),
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

        self.engine.eval_with_scope::<bool>(&mut scope, condition).unwrap_or(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    fn matches_trigger_with_filters() {
        let executor = FlowExecutor::new();
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

    #[test]
    fn resolve_execution_order_groups_parallel_steps() {
        let executor = FlowExecutor::new();
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
            },
        ];

        let groups = executor.resolve_execution_order(&steps).unwrap();
        assert_eq!(groups.len(), 2);
        assert_eq!(groups[0], vec!["step1"]);
        assert_eq!(groups[1].len(), 2);
    }

    #[test]
    fn transform_data_replaces_template_values() {
        let executor = FlowExecutor::new();
        let event = PulseEvent {
            id: Uuid::new_v4(),
            tenant_id: Uuid::new_v4(),
            source: Some("github".into()),
            event_type: "push".into(),
            data: json!({"user": {"email": "TEST@EXAMPLE.COM"}}),
        };
        let outputs = HashMap::from([("step1".to_string(), json!({"profile": {"name": "Imantha"}}))]);

        let result = executor
            .transform_data("{{trigger.user.email | lowercase}}/{{step1.profile.name}}", &outputs, &event)
            .unwrap();

        assert_eq!(result, Value::String("test@example.com/Imantha".to_string()));
    }
}
