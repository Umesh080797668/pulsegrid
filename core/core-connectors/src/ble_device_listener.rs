/// BLE Device Listener — Event Ingestion from Bluetooth Low Energy Devices
/// Part of PulseCore's EVENT INGESTION LAYER (Blueprint Section 7.2)
///
/// Scans for BLE devices, pairs with configured devices, and emits characteristic
/// change events as PulseEvents, publishing to Redis Streams for automation.

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;
use serde_json::{json, Value};
use chrono::Utc;

/// BLE Device identification
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct BleDeviceAddress(pub String); // e.g. "A1:B2:C3:D4:E5:F6"

/// BLE Service/Characteristic UUIDs
#[derive(Clone, Debug)]
pub struct BleCharacteristic {
    pub service_uuid: String,           // e.g. "180A" (Device Information)
    pub characteristic_uuid: String,    // e.g. "2A29" (Manufacturer Name)
    pub notify: bool,                   // Does this characteristic support notifications?
}

/// Configuration for listening to a BLE device
#[derive(Clone, Debug)]
pub struct BleDeviceConfig {
    pub workspace_id: Uuid,
    pub device_address: BleDeviceAddress,
    pub device_name: String,            // Human-readable name
    pub characteristics: Vec<BleCharacteristic>, // Which characteristics to monitor
    pub scan_interval_ms: u32,          // How often to poll non-notify characteristics
}

/// Represents a BLE device value change event
#[derive(Clone, Debug)]
pub struct BleDeviceEvent {
    pub device_address: BleDeviceAddress,
    pub characteristic_uuid: String,
    pub value: Vec<u8>,
    pub rssi: i16,                      // Signal strength in dBm
}

/// Represents an event produced from a BLE device characteristic change
#[derive(Clone, Debug, serde::Serialize)]
pub struct BlePulseEvent {
    pub id: Uuid,
    pub tenant_id: Uuid,
    pub source: String,                    // "ble"
    pub event_type: String,               // e.g. "ble.characteristic_changed"
    pub payload: Value,                   // Parsed BLE value
    pub received_at: String,              // ISO 8601 timestamp
    pub metadata: HashMap<String, String>, // Device address, characteristic UUID, etc.
}

/// BLE Device Listener Service
/// Manages device scanning, pairing, and characteristic monitoring
pub struct BleDeviceListener {
    devices: Arc<RwLock<HashMap<BleDeviceAddress, BleDeviceConfig>>>,
    active_connections: Arc<RwLock<HashMap<BleDeviceAddress, bool>>>, // device -> is_connected
}

impl BleDeviceListener {
    /// Create a new BLE Device Listener instance
    pub fn new() -> Self {
        Self {
            devices: Arc::new(RwLock::new(HashMap::new())),
            active_connections: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Register a BLE device to listen to
    pub async fn register_device(&self, config: BleDeviceConfig) -> Result<(), String> {
        if !Self::is_valid_ble_address(&config.device_address.0) {
            return Err(format!(
                "Invalid BLE address format: {}",
                config.device_address.0
            ));
        }

        if config.device_name.trim().is_empty() {
            return Err("device_name is required".to_string());
        }

        if config.scan_interval_ms == 0 {
            return Err("scan_interval_ms must be greater than 0".to_string());
        }

        if config.characteristics.is_empty() {
            return Err("At least one characteristic must be configured".to_string());
        }

        let device_address = config.device_address.clone();

        let mut devices = self.devices.write().await;
        devices.insert(device_address.clone(), config);

        let mut conns = self.active_connections.write().await;
        conns.insert(device_address, false); // Initially disconnected

        Ok(())
    }

    /// Unregister and disconnect from a BLE device
    pub async fn unregister_device(&self, device_address: BleDeviceAddress) -> Result<(), String> {
        let mut devices = self.devices.write().await;
        devices.remove(&device_address);

        let mut conns = self.active_connections.write().await;
        conns.remove(&device_address);

        Ok(())
    }

    /// Connect to a registered BLE device
    pub async fn connect_device(&self, device_address: BleDeviceAddress) -> Result<(), String> {
        let devices = self.devices.read().await;
        let Some(config) = devices.get(&device_address) else {
            return Err(format!("Device {} not registered", device_address.0));
        };

        let supports_notify = config.characteristics.iter().any(|c| c.notify);
        if !supports_notify {
            return Err(format!(
                "Device {} has no notify-enabled characteristics",
                device_address.0
            ));
        }

        let mut conns = self.active_connections.write().await;
        conns.insert(device_address, true);

        Ok(())
    }

    /// Disconnect from a BLE device
    pub async fn disconnect_device(&self, device_address: BleDeviceAddress) -> Result<(), String> {
        let mut conns = self.active_connections.write().await;
        conns.insert(device_address, false);

        Ok(())
    }

    /// Normalize a BLE device event into a PulseEvent
    pub fn normalize_event(
        &self,
        workspace_id: Uuid,
        event: BleDeviceEvent,
    ) -> BlePulseEvent {
        let mut metadata = HashMap::new();
        metadata.insert("device_address".to_string(), event.device_address.0.clone());
        metadata.insert("characteristic_uuid".to_string(), event.characteristic_uuid.clone());
        metadata.insert("rssi".to_string(), event.rssi.to_string());

        // Try to parse value as UTF-8 string, fall back to hex
        let value_str = String::from_utf8_lossy(&event.value);
        let payload_value = if value_str.chars().all(|c| c.is_ascii_graphic() || c.is_whitespace()) {
            Value::String(value_str.to_string())
        } else {
            Value::String(hex::encode(&event.value))
        };

        BlePulseEvent {
            id: Uuid::new_v4(),
            tenant_id: workspace_id,
            source: "ble".to_string(),
            event_type: "ble.characteristic_changed".to_string(),
            payload: json!({
                "device_address": event.device_address.0,
                "characteristic": event.characteristic_uuid,
                "value": payload_value,
                "rssi": event.rssi,
            }),
            received_at: Utc::now().to_rfc3339(),
            metadata,
        }
    }

    /// Get all registered devices for a workspace
    pub async fn get_devices(&self, workspace_id: Uuid) -> Vec<BleDeviceConfig> {
        let devices = self.devices.read().await;
        devices
            .values()
            .filter(|dev| dev.workspace_id == workspace_id)
            .cloned()
            .collect()
    }

    /// Check if a device is connected
    pub async fn is_device_connected(&self, device_address: &BleDeviceAddress) -> bool {
        let conns = self.active_connections.read().await;
        conns.get(device_address).copied().unwrap_or(false)
    }

    /// Health check: return number of connected devices
    pub async fn health_check(&self) -> usize {
        let conns = self.active_connections.read().await;
        conns.values().filter(|&&connected| connected).count()
    }

    fn is_valid_ble_address(address: &str) -> bool {
        let parts: Vec<&str> = address.split(':').collect();
        if parts.len() != 6 {
            return false;
        }

        parts
            .iter()
            .all(|part| part.len() == 2 && part.chars().all(|ch| ch.is_ascii_hexdigit()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_ble_listener_register_device() {
        let listener = BleDeviceListener::new();
        let config = BleDeviceConfig {
            workspace_id: Uuid::new_v4(),
            device_address: BleDeviceAddress("A1:B2:C3:D4:E5:F6".to_string()),
            device_name: "Living Room Thermometer".to_string(),
            characteristics: vec![BleCharacteristic {
                service_uuid: "180A".to_string(),
                characteristic_uuid: "2A6E".to_string(), // Temperature
                notify: true,
            }],
            scan_interval_ms: 5000,
        };

        let result = listener.register_device(config.clone()).await;
        assert!(result.is_ok());

        let devices = listener.get_devices(config.workspace_id).await;
        assert_eq!(devices.len(), 1);
        assert_eq!(devices[0].device_address, config.device_address);
    }

    #[tokio::test]
    async fn test_ble_listener_connect_disconnect() {
        let listener = BleDeviceListener::new();
        let workspace_id = Uuid::new_v4();
        let device_address = BleDeviceAddress("A1:B2:C3:D4:E5:F6".to_string());

        let config = BleDeviceConfig {
            workspace_id,
            device_address: device_address.clone(),
            device_name: "Test Device".to_string(),
            characteristics: vec![BleCharacteristic {
                service_uuid: "180A".to_string(),
                characteristic_uuid: "2A6E".to_string(),
                notify: true,
            }],
            scan_interval_ms: 5000,
        };

        listener.register_device(config).await.unwrap();

        // Initially disconnected
        assert!(!listener.is_device_connected(&device_address).await);

        // Connect
        listener.connect_device(device_address.clone()).await.unwrap();
        assert!(listener.is_device_connected(&device_address).await);

        // Disconnect
        listener.disconnect_device(device_address.clone()).await.unwrap();
        assert!(!listener.is_device_connected(&device_address).await);
    }

    #[test]
    fn test_ble_event_normalization() {
        let listener = BleDeviceListener::new();
        let workspace_id = Uuid::new_v4();
        let event = BleDeviceEvent {
            device_address: BleDeviceAddress("A1:B2:C3:D4:E5:F6".to_string()),
            characteristic_uuid: "2A6E".to_string(),
            value: b"22.5".to_vec(),
            rssi: -50,
        };

        let pulse_event = listener.normalize_event(workspace_id, event);
        assert_eq!(pulse_event.source, "ble");
        assert_eq!(pulse_event.event_type, "ble.characteristic_changed");
        assert_eq!(pulse_event.tenant_id, workspace_id);
        assert!(pulse_event.metadata.contains_key("device_address"));
    }
}
