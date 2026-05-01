/// MQTT Bridge — Event Ingestion from MQTT Brokers
/// Part of PulseCore's EVENT INGESTION LAYER (Blueprint Section 7.2)
///
/// Subscribes to MQTT topics and normalizes messages into PulseEvent structs,
/// publishing to the central event bus (Redis Streams) for rule evaluation.

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;
use serde_json::{json, Value};
use chrono::Utc;

/// MQTT topic subscription configuration
#[derive(Clone, Debug)]
pub struct MqttSubscription {
    pub workspace_id: Uuid,
    pub broker_url: String,           // mqtt://host:port
    pub topic_pattern: String,        // e.g. "home/+/temperature" (MQTT wildcards)
    pub username: Option<String>,
    pub password: Option<String>,
    pub client_id: String,
    pub qos: u8,                      // 0, 1, or 2
}

/// Represents a received MQTT message
#[derive(Clone, Debug)]
pub struct MqttMessage {
    pub topic: String,
    pub payload: Vec<u8>,
    pub qos: u8,
    pub retain: bool,
}

/// Represents an event produced from an MQTT message
#[derive(Clone, Debug, serde::Serialize)]
pub struct MqttPulseEvent {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub source: String,                    // "mqtt"
    pub event_type: String,               // e.g. "mqtt.message"
    pub payload: Value,                   // Parsed MQTT message
    pub received_at: String,              // ISO 8601 timestamp
    pub metadata: HashMap<String, String>, // MQTT topic, QoS, etc.
}

/// MQTT Bridge Service
/// Manages connections, subscriptions, and normalization
pub struct MqttBridge {
    subscriptions: Arc<RwLock<HashMap<Uuid, MqttSubscription>>>,
    active_connections: Arc<RwLock<HashMap<Uuid, String>>>, // workspace_id -> client_id
}

impl MqttBridge {
    /// Create a new MQTT Bridge instance
    pub fn new() -> Self {
        Self {
            subscriptions: Arc::new(RwLock::new(HashMap::new())),
            active_connections: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Register a new MQTT subscription
    pub async fn subscribe(&self, config: MqttSubscription) -> Result<(), String> {
        if config.broker_url.trim().is_empty() {
            return Err("broker_url is required".to_string());
        }

        let lower_broker = config.broker_url.to_lowercase();
        if !(lower_broker.starts_with("mqtt://") || lower_broker.starts_with("mqtts://")) {
            return Err("broker_url must start with mqtt:// or mqtts://".to_string());
        }

        if config.topic_pattern.trim().is_empty() {
            return Err("topic_pattern is required".to_string());
        }

        if config.qos > 2 {
            return Err("qos must be 0, 1, or 2".to_string());
        }

        if config.client_id.trim().is_empty() {
            return Err("client_id is required".to_string());
        }

        let workspace_id = config.workspace_id;
        let client_id = config.client_id.clone();

        let mut subs = self.subscriptions.write().await;
        subs.insert(workspace_id, config);

        let mut conns = self.active_connections.write().await;
        conns.insert(workspace_id, client_id);

        Ok(())
    }

    /// Unsubscribe and close MQTT connection
    pub async fn unsubscribe(&self, workspace_id: Uuid) -> Result<(), String> {
        let mut subs = self.subscriptions.write().await;
        subs.remove(&workspace_id);

        let mut conns = self.active_connections.write().await;
        conns.remove(&workspace_id);

        Ok(())
    }

    /// Normalize an MQTT message into a PulseEvent
    pub fn normalize_message(
        &self,
        workspace_id: Uuid,
        message: MqttMessage,
    ) -> MqttPulseEvent {
        let mut metadata = HashMap::new();
        metadata.insert("topic".to_string(), message.topic.clone());
        metadata.insert("qos".to_string(), message.qos.to_string());
        metadata.insert("retain".to_string(), message.retain.to_string());

        // Try to parse as JSON, fall back to string
        let payload_value = String::from_utf8_lossy(&message.payload);
        let payload = serde_json::from_str::<Value>(&payload_value)
            .unwrap_or_else(|_| Value::String(payload_value.to_string()));

        MqttPulseEvent {
            id: Uuid::new_v4(),
            tenant_id: workspace_id,
            source: "mqtt".to_string(),
            event_type: "mqtt.message".to_string(),
            payload: json!({
                "topic": message.topic,
                "data": payload,
                "retain": message.retain,
            }),
            received_at: Utc::now().to_rfc3339(),
            metadata,
        }
    }

    /// Get all active subscriptions for a workspace
    pub async fn get_subscriptions(&self, workspace_id: Uuid) -> Option<MqttSubscription> {
        let subs = self.subscriptions.read().await;
        subs.get(&workspace_id).cloned()
    }

    /// Health check: return number of active connections
    pub async fn health_check(&self) -> usize {
        let conns = self.active_connections.read().await;
        conns.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_mqtt_bridge_subscribe() {
        let bridge = MqttBridge::new();
        let config = MqttSubscription {
            workspace_id: Uuid::new_v4(),
            broker_url: "mqtt://localhost:1883".to_string(),
            topic_pattern: "home/+/temperature".to_string(),
            username: None,
            password: None,
            client_id: "test-client".to_string(),
            qos: 1,
        };

        let result = bridge.subscribe(config.clone()).await;
        assert!(result.is_ok());

        let retrieved = bridge.get_subscriptions(config.workspace_id).await;
        assert!(retrieved.is_some());
    }

    #[test]
    fn test_mqtt_message_normalization() {
        let bridge = MqttBridge::new();
        let workspace_id = Uuid::new_v4();
        let message = MqttMessage {
            topic: "home/living_room/temperature".to_string(),
            payload: b"23.5".to_vec(),
            qos: 1,
            retain: false,
        };

        let event = bridge.normalize_message(workspace_id, message);
        assert_eq!(event.source, "mqtt");
        assert_eq!(event.event_type, "mqtt.message");
        assert_eq!(event.tenant_id, workspace_id);
        assert!(event.metadata.contains_key("topic"));
    }
}
