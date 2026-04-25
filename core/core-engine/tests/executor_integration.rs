#[path = "../src/models.rs"]
mod models;
#[path = "../src/executor.rs"]
mod executor;

use executor::FlowExecutor;
use models::{FilterCondition, FlowStep, PulseEvent, TriggerDefinition};
use serde_json::json;
use std::collections::HashMap;
use uuid::Uuid;

#[test]
fn multi_step_flow_execution_order_groups_parallel_steps() {
    let executor = FlowExecutor::new();
    let steps = vec![
        FlowStep {
            id: "step1".into(),
            r#type: "action".into(),
            connector: Some("slack".into()),
            action: Some("send_message".into()),
            input_mapping: None,
            depends_on: vec![],
            retry_policy: Default::default(),
            condition: None,
        },
        FlowStep {
            id: "step2".into(),
            r#type: "action".into(),
            connector: Some("gmail".into()),
            action: Some("send_email".into()),
            input_mapping: None,
            depends_on: vec!["step1".into()],
            retry_policy: Default::default(),
            condition: None,
        },
        FlowStep {
            id: "step3".into(),
            r#type: "action".into(),
            connector: Some("notion".into()),
            action: Some("create_page".into()),
            input_mapping: None,
            depends_on: vec!["step1".into()],
            retry_policy: Default::default(),
            condition: None,
        },
    ];

    let order = executor.resolve_execution_order(&steps).unwrap();
    assert_eq!(order, vec![vec!["step1".to_string()], vec!["step2".to_string(), "step3".to_string()]]);
}

#[test]
fn trigger_condition_matching_works() {
    let executor = FlowExecutor::new();
    let trigger = TriggerDefinition {
        connector: "shopify".into(),
        event: "order.created".into(),
        filters: vec![FilterCondition {
            field: "order.total_price".into(),
            op: "gt".into(),
            value: json!(50),
        }],
    };

    let event = PulseEvent {
        id: Uuid::new_v4(),
        tenant_id: Uuid::new_v4(),
        source: Some("shopify".into()),
        event_type: "order.created".into(),
        data: json!({"order": {"total_price": 120}}),
    };

    assert!(executor.matches_trigger(&trigger, &event));
}

#[tokio::test]
async fn step_condition_can_skip_execution() {
    let executor = FlowExecutor::new();
    let step = FlowStep {
        id: "conditional-step".into(),
        r#type: "action".into(),
        connector: Some("slack".into()),
        action: Some("send_message".into()),
        input_mapping: None,
        depends_on: vec![],
        retry_policy: Default::default(),
        condition: Some("event_type == \"something_else\"".into()),
    };

    let event = PulseEvent {
        id: Uuid::new_v4(),
        tenant_id: Uuid::new_v4(),
        source: Some("shopify".into()),
        event_type: "order.created".into(),
        data: json!({}),
    };

    let result = executor.execute_step(&step, json!({}), &HashMap::new(), &event).await;
    assert_eq!(result.status, "skipped");
}

#[test]
fn data_transformation_resolves_templates() {
    let executor = FlowExecutor::new();
    let event = PulseEvent {
        id: Uuid::new_v4(),
        tenant_id: Uuid::new_v4(),
        source: Some("github".into()),
        event_type: "push".into(),
        data: json!({"user": {"email": "TEST@EXAMPLE.COM"}}),
    };

    let outputs = HashMap::from([(
        "step1".to_string(),
        json!({"profile": {"name": "Imantha"}}),
    )]);

    let result = executor
        .transform_data("{{trigger.user.email | lowercase}}/{{step1.profile.name}}", &outputs, &event)
        .unwrap();

    assert_eq!(result, json!("test@example.com/Imantha"));
}

#[test]
fn cyclic_dependencies_return_error() {
    let executor = FlowExecutor::new();
    let steps = vec![
        FlowStep {
            id: "a".into(),
            r#type: "action".into(),
            connector: None,
            action: None,
            input_mapping: None,
            depends_on: vec!["b".into()],
            retry_policy: Default::default(),
            condition: None,
        },
        FlowStep {
            id: "b".into(),
            r#type: "action".into(),
            connector: None,
            action: None,
            input_mapping: None,
            depends_on: vec!["a".into()],
            retry_policy: Default::default(),
            condition: None,
        },
    ];

    let err = executor.resolve_execution_order(&steps).unwrap_err();
    assert!(err.contains("Cyclic"));
}
