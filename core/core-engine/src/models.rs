use serde::{Serialize, Deserialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct PulseEvent {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub source: String,
    pub event_type: String,
    pub payload: serde_json::Value,
}
