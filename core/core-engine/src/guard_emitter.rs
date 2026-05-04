use core_proto::guard::guard_stream_server::GuardStream;
use core_proto::guard::{GuardSignal, StreamGuardEventsRequest};
use futures_util::Stream;
use redis::AsyncCommands;
use std::collections::HashMap;
use std::pin::Pin;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::{broadcast, mpsc};
use tokio_stream::wrappers::ReceiverStream;
use tonic::{Request, Response, Status};
use tracing::{Event, Level, Subscriber};
use tracing_subscriber::layer::{Context, Layer};
use tracing_subscriber::prelude::*;
use tracing_subscriber::registry::LookupSpan;
use tracing_subscriber::{EnvFilter, Registry};
use uuid::Uuid;

#[derive(Clone)]
pub struct GuardEventPublisher {
    redis_url: String,
    deployment_sha: String,
    signal_tx: broadcast::Sender<GuardSignal>,
}

impl GuardEventPublisher {
    pub fn new(signal_tx: broadcast::Sender<GuardSignal>) -> Self {
        Self {
            redis_url: std::env::var("REDIS_URL")
                .unwrap_or_else(|_| "redis://127.0.0.1:6379/".to_string()),
            deployment_sha: std::env::var("DEPLOYMENT_SHA").unwrap_or_else(|_| "unknown".to_string()),
            signal_tx,
        }
    }

    pub fn publish_from_log(
        &self,
        level: Level,
        target: &str,
        message: String,
        mut metadata: HashMap<String, String>,
    ) {
        let category = classify_category(&message);
        let severity = classify_severity(level, &category);

        if !should_emit(level, &category) {
            return;
        }

        metadata.entry("target".to_string()).or_insert_with(|| target.to_string());

        let tenant_id = metadata
            .get("tenant_id")
            .cloned()
            .unwrap_or_else(|| Uuid::nil().to_string());
        let affected_connector = metadata
            .get("connector")
            .cloned()
            .or_else(|| metadata.get("affected_connector").cloned())
            .unwrap_or_default();

        let signal = GuardSignal {
            id: Uuid::new_v4().to_string(),
            tenant_id,
            source: "pulsecore".to_string(),
            severity,
            category,
            message,
            stack_trace: metadata.get("stack_trace").cloned().unwrap_or_default(),
            affected_connector,
            affected_flow_ids: vec![],
            deployment_sha: self.deployment_sha.clone(),
            observed_at_unix_ms: now_unix_ms(),
            metadata,
        };

        self.publish(signal);
    }

    pub fn publish_panic(&self, panic_message: String) {
        let mut metadata = HashMap::new();
        metadata.insert("panic_hook".to_string(), "true".to_string());

        let signal = GuardSignal {
            id: Uuid::new_v4().to_string(),
            tenant_id: Uuid::nil().to_string(),
            source: "pulsecore".to_string(),
            severity: "critical".to_string(),
            category: classify_category(&panic_message),
            message: panic_message,
            stack_trace: String::new(),
            affected_connector: String::new(),
            affected_flow_ids: vec![],
            deployment_sha: self.deployment_sha.clone(),
            observed_at_unix_ms: now_unix_ms(),
            metadata,
        };

        self.publish(signal);
    }

    fn publish(&self, signal: GuardSignal) {
        let _ = self.signal_tx.send(signal.clone());

        let redis_url = self.redis_url.clone();
        tokio::spawn(async move {
            if let Ok(payload) = serde_json::to_string(&to_guard_ingest_payload(&signal)) {
                let _ = publish_to_guard_stream(&redis_url, payload).await;
            }
        });
    }
}

async fn publish_to_guard_stream(redis_url: &str, payload: String) -> Result<(), redis::RedisError> {
    let client = redis::Client::open(redis_url)?;
    let mut conn = client.get_multiplexed_async_connection().await?;
    let _: () = conn
        .xadd("guard:events", "*", &[("payload", payload)])
        .await?;
    Ok(())
}

fn to_guard_ingest_payload(signal: &GuardSignal) -> serde_json::Value {
    serde_json::json!({
        "id": signal.id,
        "tenant_id": signal.tenant_id,
        "source": signal.source,
        "severity": signal.severity,
        "category": signal.category,
        "message": signal.message,
        "stack_trace": if signal.stack_trace.is_empty() { serde_json::Value::Null } else { serde_json::Value::String(signal.stack_trace.clone()) },
        "surrounding_logs": [],
        "affected_connector": if signal.affected_connector.is_empty() { serde_json::Value::Null } else { serde_json::Value::String(signal.affected_connector.clone()) },
        "affected_flow_ids": signal.affected_flow_ids,
        "deployment_sha": signal.deployment_sha,
        "received_at": chrono::Utc::now().to_rfc3339(),
        "metadata": signal.metadata,
    })
}

fn classify_category(message: &str) -> String {
    let lower = message.to_lowercase();
    if lower.contains("out of memory") || lower.contains("oom") || lower.contains("memory allocation") {
        "OOM".to_string()
    } else if lower.contains("timeout") || lower.contains("timed out") {
        "Timeout".to_string()
    } else if lower.contains("panic") {
        "Panic".to_string()
    } else {
        "UnhandledException".to_string()
    }
}

fn classify_severity(level: Level, category: &str) -> String {
    if matches!(category, "OOM" | "Panic") {
        "critical".to_string()
    } else if level == Level::ERROR {
        "error".to_string()
    } else {
        "warning".to_string()
    }
}

fn should_emit(level: Level, category: &str) -> bool {
    level == Level::ERROR || matches!(category, "Panic" | "OOM")
}

fn now_unix_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub struct GuardEventLayer {
    publisher: Arc<GuardEventPublisher>,
}

impl GuardEventLayer {
    pub fn new(publisher: Arc<GuardEventPublisher>) -> Self {
        Self { publisher }
    }
}

impl<S> Layer<S> for GuardEventLayer
where
    S: Subscriber + for<'a> LookupSpan<'a>,
{
    fn on_event(&self, event: &Event<'_>, _ctx: Context<'_, S>) {
        let metadata = event.metadata();
        let mut visitor = GuardEventVisitor::default();
        event.record(&mut visitor);

        let message = visitor
            .fields
            .get("message")
            .cloned()
            .or_else(|| visitor.fields.get("error").cloned())
            .unwrap_or_else(|| metadata.name().to_string());

        self.publisher.publish_from_log(
            *metadata.level(),
            metadata.target(),
            message,
            visitor.fields,
        );
    }
}

#[derive(Default)]
struct GuardEventVisitor {
    fields: HashMap<String, String>,
}

impl tracing::field::Visit for GuardEventVisitor {
    fn record_debug(&mut self, field: &tracing::field::Field, value: &dyn std::fmt::Debug) {
        self.fields
            .insert(field.name().to_string(), format!("{:?}", value));
    }

    fn record_str(&mut self, field: &tracing::field::Field, value: &str) {
        self.fields
            .insert(field.name().to_string(), value.to_string());
    }

    fn record_i64(&mut self, field: &tracing::field::Field, value: i64) {
        self.fields
            .insert(field.name().to_string(), value.to_string());
    }

    fn record_u64(&mut self, field: &tracing::field::Field, value: u64) {
        self.fields
            .insert(field.name().to_string(), value.to_string());
    }

    fn record_bool(&mut self, field: &tracing::field::Field, value: bool) {
        self.fields
            .insert(field.name().to_string(), value.to_string());
    }
}

pub fn install_guard_event_pipeline(
    publisher: Arc<GuardEventPublisher>,
) -> Result<(), Box<dyn std::error::Error>> {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    let subscriber = Registry::default()
        .with(filter)
        .with(tracing_subscriber::fmt::layer())
        .with(GuardEventLayer::new(publisher.clone()));

    tracing::subscriber::set_global_default(subscriber)?;

    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |panic_info| {
        let payload = panic_info
            .payload()
            .downcast_ref::<&str>()
            .map(|s| s.to_string())
            .or_else(|| panic_info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "panic occurred".to_string());

        let location = panic_info
            .location()
            .map(|loc| format!("{}:{}", loc.file(), loc.line()))
            .unwrap_or_else(|| "unknown".to_string());

        let panic_message = format!("panic: {} @ {}", payload, location);
        publisher.publish_panic(panic_message);
        default_hook(panic_info);
    }));

    Ok(())
}

#[derive(Clone)]
pub struct GuardStreamService {
    signal_tx: broadcast::Sender<GuardSignal>,
}

impl GuardStreamService {
    pub fn new(signal_tx: broadcast::Sender<GuardSignal>) -> Self {
        Self { signal_tx }
    }
}

#[tonic::async_trait]
impl GuardStream for GuardStreamService {
    type StreamGuardEventsStream =
        Pin<Box<dyn Stream<Item = Result<GuardSignal, Status>> + Send + 'static>>;

    async fn stream_guard_events(
        &self,
        request: Request<StreamGuardEventsRequest>,
    ) -> Result<Response<Self::StreamGuardEventsStream>, Status> {
        let req = request.into_inner();
        let tenant_filter = if req.tenant_id.trim().is_empty() {
            None
        } else {
            Some(req.tenant_id)
        };

        let categories: Vec<String> = req
            .categories
            .into_iter()
            .map(|c| c.to_lowercase())
            .collect();

        let mut rx = self.signal_tx.subscribe();
        let (tx, out_rx) = mpsc::channel::<Result<GuardSignal, Status>>(256);

        tokio::spawn(async move {
            loop {
                match rx.recv().await {
                    Ok(signal) => {
                        if let Some(ref tenant) = tenant_filter {
                            if signal.tenant_id != *tenant {
                                continue;
                            }
                        }

                        if !categories.is_empty()
                            && !categories
                                .iter()
                                .any(|c| signal.category.to_lowercase().contains(c))
                        {
                            continue;
                        }

                        if tx.send(Ok(signal)).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Closed) => break,
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                }
            }
        });

        Ok(Response::new(Box::pin(ReceiverStream::new(out_rx))))
    }
}
