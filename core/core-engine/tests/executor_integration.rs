#[allow(dead_code)]
#[path = "../src/executor.rs"]
mod executor;
#[allow(dead_code)]
#[path = "../src/models.rs"]
mod models;

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
            script_language: None,
            code: None,
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
            script_language: None,
            code: None,
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
            script_language: None,
            code: None,
        },
    ];

    let order = executor.resolve_execution_order(&steps).unwrap();
    assert_eq!(order.len(), 2);
    assert_eq!(order[0], vec!["step1".to_string()]);
    assert_eq!(order[1].len(), 2);
    assert!(order[1].contains(&"step2".to_string()));
    assert!(order[1].contains(&"step3".to_string()));
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
        script_language: None,
        code: None,
    };

    let event = PulseEvent {
        id: Uuid::new_v4(),
        tenant_id: Uuid::new_v4(),
        source: Some("shopify".into()),
        event_type: "order.created".into(),
        data: json!({}),
    };

    let result = executor
        .execute_step(&step, json!({}), &HashMap::new(), &event)
        .await;
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

    let outputs = HashMap::from([("step1".to_string(), json!({"profile": {"name": "Imantha"}}))]);

    let result = executor
        .transform_data(
            "{{trigger.user.email | lowercase}}/{{step1.profile.name}}",
            &outputs,
            &event,
        )
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
            script_language: None,
            code: None,
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
            script_language: None,
            code: None,
        },
    ];

    let err = executor.resolve_execution_order(&steps).unwrap_err();
    assert!(err.contains("Cyclic"));
}

#[tokio::test]
async fn schedule_connector_step_returns_next_run() {
    let executor = FlowExecutor::new();
    let step = FlowStep {
        id: "schedule-step".into(),
        r#type: "action".into(),
        connector: Some("schedule".into()),
        action: Some("next_run".into()),
        input_mapping: Some(HashMap::from([
            ("cron".to_string(), "0/30 * * * * * *".to_string()),
            ("from".to_string(), "2026-01-01T00:00:00Z".to_string()),
        ])),
        depends_on: vec![],
        retry_policy: Default::default(),
        condition: None,
        script_language: None,
        code: None,
    };

    let event = PulseEvent {
        id: Uuid::new_v4(),
        tenant_id: Uuid::new_v4(),
        source: Some("schedule".into()),
        event_type: "tick".into(),
        data: json!({}),
    };

    let result = executor
        .execute_step(&step, json!({}), &HashMap::new(), &event)
        .await;
    assert_eq!(result.status, "success");
    assert!(result.output.get("output").is_some());
}

#[tokio::test]
async fn resend_connector_requires_api_key() {
    let executor = FlowExecutor::new();
    let step = FlowStep {
        id: "resend-step".into(),
        r#type: "action".into(),
        connector: Some("resend".into()),
        action: Some("send_email".into()),
        input_mapping: Some(HashMap::from([
            ("from".to_string(), "noreply@pulsegrid.dev".to_string()),
            ("to".to_string(), "user@example.com".to_string()),
            ("subject".to_string(), "Hello".to_string()),
            ("html".to_string(), "<b>Hi</b>".to_string()),
        ])),
        depends_on: vec![],
        retry_policy: Default::default(),
        condition: None,
        script_language: None,
        code: None,
    };

    let event = PulseEvent {
        id: Uuid::new_v4(),
        tenant_id: Uuid::new_v4(),
        source: Some("manual".into()),
        event_type: "trigger".into(),
        data: json!({}),
    };

    let result = executor
        .execute_step(&step, json!({}), &HashMap::new(), &event)
        .await;
    assert_eq!(result.status, "failed");
    assert!(
        result
            .error
            .unwrap_or_default()
            .contains("missing required input field: api_key")
    );
}

#[tokio::test]
async fn jira_connector_requires_access_token() {
    let executor = FlowExecutor::new();
    let step = FlowStep {
        id: "jira-step".into(),
        r#type: "action".into(),
        connector: Some("jira".into()),
        action: Some("create_issue".into()),
        input_mapping: Some(HashMap::from([
            ("domain".to_string(), "example.atlassian.net".to_string()),
            (
                "fields".to_string(),
                "{\"project\":{\"key\":\"PG\"},\"summary\":\"Bug\",\"issuetype\":{\"name\":\"Task\"}}".to_string(),
            ),
        ])),
        depends_on: vec![],
        retry_policy: Default::default(),
        condition: None,
        script_language: None,
        code: None,
    };

    let event = PulseEvent {
        id: Uuid::new_v4(),
        tenant_id: Uuid::new_v4(),
        source: Some("manual".into()),
        event_type: "trigger".into(),
        data: json!({}),
    };

    let result = executor
        .execute_step(&step, json!({}), &HashMap::new(), &event)
        .await;
    assert_eq!(result.status, "failed");
    assert!(
        result
            .error
            .unwrap_or_default()
            .contains("missing required input field: access_token")
    );
}

#[tokio::test]
async fn stripe_connector_requires_api_key() {
    let executor = FlowExecutor::new();
    let step = FlowStep {
        id: "stripe-step".into(),
        r#type: "action".into(),
        connector: Some("stripe".into()),
        action: Some("request".into()),
        input_mapping: Some(HashMap::from([(
            "endpoint_url".to_string(),
            "https://api.stripe.com/v1/customers".to_string(),
        )])),
        depends_on: vec![],
        retry_policy: Default::default(),
        condition: None,
        script_language: None,
        code: None,
    };

    let event = PulseEvent {
        id: Uuid::new_v4(),
        tenant_id: Uuid::new_v4(),
        source: Some("manual".into()),
        event_type: "trigger".into(),
        data: json!({}),
    };

    let result = executor
        .execute_step(&step, json!({}), &HashMap::new(), &event)
        .await;
    assert_eq!(result.status, "failed");
    assert!(
        result
            .error
            .unwrap_or_default()
            .contains("missing required input field: api_key")
    );
}

#[tokio::test]
async fn wat_script_step_executes_in_sandbox() {
    let executor = FlowExecutor::new();
    let step = FlowStep {
        id: "sandbox-step".into(),
        r#type: "script".into(),
        connector: None,
        action: None,
        input_mapping: None,
        depends_on: vec![],
        retry_policy: Default::default(),
        condition: None,
        script_language: Some("wat".into()),
                code: Some(
                        r#"
                        (module
                            (memory (export "memory") 1)
                            (global $heap (mut i32) (i32.const 1024))
                            (func (export "alloc") (param $size i32) (result i32)
                                (local $ptr i32)
                                global.get $heap
                                local.set $ptr
                                local.get $ptr
                                local.get $size
                                i32.add
                                global.set $heap
                                local.get $ptr)
                            (data (i32.const 4096) "42")
                            (func (export "run") (param $input_ptr i32) (param $input_len i32) (result i64)
                                i64.const 4096
                                i64.const 32
                                i64.shl
                                i64.const 2
                                i64.or))
                        "#
                        .trim()
                        .into()),
    };

    let event = PulseEvent {
        id: Uuid::new_v4(),
        tenant_id: Uuid::new_v4(),
        source: Some("manual".into()),
        event_type: "trigger".into(),
        data: json!({"payload": "hello"}),
    };

    let result = executor
        .execute_step(&step, json!({"value": 1}), &HashMap::new(), &event)
        .await;

    assert_eq!(result.status, "success");
    assert_eq!(result.output["output"], json!(42));
}

#[tokio::test]
async fn sendgrid_connector_requires_api_key() {
    let executor = FlowExecutor::new();
    let step = FlowStep {
        id: "sendgrid-step".into(),
        r#type: "action".into(),
        connector: Some("sendgrid".into()),
        action: Some("send_email".into()),
        input_mapping: Some(HashMap::from([
            ("from".to_string(), "noreply@pulsegrid.dev".to_string()),
            ("to".to_string(), "user@example.com".to_string()),
            ("subject".to_string(), "Hello".to_string()),
            ("content".to_string(), "Welcome".to_string()),
        ])),
        depends_on: vec![],
        retry_policy: Default::default(),
        condition: None,
        script_language: None,
        code: None,
    };

    let event = PulseEvent {
        id: Uuid::new_v4(),
        tenant_id: Uuid::new_v4(),
        source: Some("manual".into()),
        event_type: "trigger".into(),
        data: json!({}),
    };

    let result = executor
        .execute_step(&step, json!({}), &HashMap::new(), &event)
        .await;
    assert_eq!(result.status, "failed");
    assert!(
        result
            .error
            .unwrap_or_default()
            .contains("missing required input field: api_key")
    );
}

#[tokio::test]
async fn salesforce_connector_requires_access_token() {
    let executor = FlowExecutor::new();
    let step = FlowStep {
        id: "salesforce-step".into(),
        r#type: "action".into(),
        connector: Some("salesforce".into()),
        action: Some("create_record".into()),
        input_mapping: Some(HashMap::from([
            (
                "instance_url".to_string(),
                "https://example.my.salesforce.com".to_string(),
            ),
            ("object_api_name".to_string(), "Lead".to_string()),
            (
                "fields".to_string(),
                "{\"Company\":\"PulseGrid\"}".to_string(),
            ),
        ])),
        depends_on: vec![],
        retry_policy: Default::default(),
        condition: None,
        script_language: None,
        code: None,
    };

    let event = PulseEvent {
        id: Uuid::new_v4(),
        tenant_id: Uuid::new_v4(),
        source: Some("manual".into()),
        event_type: "trigger".into(),
        data: json!({}),
    };

    let result = executor
        .execute_step(&step, json!({}), &HashMap::new(), &event)
        .await;
    assert_eq!(result.status, "failed");
    assert!(
        result
            .error
            .unwrap_or_default()
            .contains("missing required input field: access_token")
    );
}

#[tokio::test]
async fn shopify_connector_requires_access_token() {
    let executor = FlowExecutor::new();
    let step = FlowStep {
        id: "shopify-step".into(),
        r#type: "action".into(),
        connector: Some("shopify".into()),
        action: Some("request".into()),
        input_mapping: Some(HashMap::from([
            (
                "store_domain".to_string(),
                "store.myshopify.com".to_string(),
            ),
            (
                "endpoint_path".to_string(),
                "/admin/api/2024-10/customers.json".to_string(),
            ),
        ])),
        depends_on: vec![],
        retry_policy: Default::default(),
        condition: None,
        script_language: None,
        code: None,
    };

    let event = PulseEvent {
        id: Uuid::new_v4(),
        tenant_id: Uuid::new_v4(),
        source: Some("manual".into()),
        event_type: "trigger".into(),
        data: json!({}),
    };

    let result = executor
        .execute_step(&step, json!({}), &HashMap::new(), &event)
        .await;
    assert_eq!(result.status, "failed");
    assert!(
        result
            .error
            .unwrap_or_default()
            .contains("missing required input field: access_token")
    );
}
