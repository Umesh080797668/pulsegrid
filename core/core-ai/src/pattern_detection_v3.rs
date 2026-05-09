use crate::pattern_detection::{self, EventEntry, Pattern, PatternType, TenantContext};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct ModelVersion {
    pub major: u16,
    pub minor: u16,
    pub patch: u16,
}

impl ModelVersion {
    pub fn new(major: u16, minor: u16, patch: u16) -> Self {
        Self { major, minor, patch }
    }
}

impl std::fmt::Display for ModelVersion {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}.{}.{}", self.major, self.minor, self.patch)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelMetadata {
    pub version: ModelVersion,
    pub confidence_threshold: f32,
    pub spike_sensitivity: f32,
    pub drift_sensitivity: f32,
    pub anomaly_percentile: f32,
}

impl Default for ModelMetadata {
    fn default() -> Self {
        Self {
            version: ModelVersion::new(3, 0, 0),
            confidence_threshold: 0.55,
            spike_sensitivity: 0.75,
            drift_sensitivity: 0.70,
            anomaly_percentile: 0.95,
        }
    }
}

pub struct ModelManager {
    model_path: PathBuf,
    metadata: Arc<Mutex<ModelMetadata>>,
    inference_count: Arc<Mutex<u64>>,
    error_count: Arc<Mutex<u64>>,
}

impl ModelManager {
    pub fn new(model_dir: PathBuf) -> Result<Self, String> {
        let model_path = model_dir.join("pulseai_pattern_v3.onnx");
        Ok(Self {
            model_path,
            metadata: Arc::new(Mutex::new(ModelMetadata::default())),
            inference_count: Arc::new(Mutex::new(0)),
            error_count: Arc::new(Mutex::new(0)),
        })
    }

    pub fn get_metadata(&self) -> Result<ModelMetadata, String> {
        self.metadata
            .lock()
            .map(|m| m.clone())
            .map_err(|_| "failed to lock metadata".to_string())
    }

    pub fn model_exists(&self) -> bool {
        self.model_path.exists()
    }

    pub fn increment_inference_count(&self) {
        if let Ok(mut c) = self.inference_count.lock() {
            *c += 1;
        }
    }

    pub fn increment_error_count(&self) {
        if let Ok(mut c) = self.error_count.lock() {
            *c += 1;
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PatternDetectionMetrics {
    pub true_positives: u32,
    pub true_negatives: u32,
    pub false_positives: u32,
    pub false_negatives: u32,
}

impl PatternDetectionMetrics {
    pub fn precision(&self) -> f32 {
        let tp = self.true_positives as f32;
        let fp = self.false_positives as f32;
        if tp + fp == 0.0 { 0.0 } else { tp / (tp + fp) }
    }

    pub fn recall(&self) -> f32 {
        let tp = self.true_positives as f32;
        let fn_ = self.false_negatives as f32;
        if tp + fn_ == 0.0 { 0.0 } else { tp / (tp + fn_) }
    }

    pub fn f1_score(&self) -> f32 {
        let p = self.precision();
        let r = self.recall();
        if p + r == 0.0 { 0.0 } else { 2.0 * p * r / (p + r) }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriftMetrics {
    pub timestamp: String,
    pub inference_count: u64,
    pub avg_confidence: f32,
    pub confidence_std_dev: f32,
    pub anomaly_rate: f32,
    pub drift_detected: bool,
    pub drift_score: f32,
}

impl DriftMetrics {
    pub fn new() -> Self {
        Self {
            timestamp: Utc::now().to_rfc3339(),
            inference_count: 0,
            avg_confidence: 0.0,
            confidence_std_dev: 0.0,
            anomaly_rate: 0.0,
            drift_detected: false,
            drift_score: 0.0,
        }
    }
}

pub struct MetricsCollector {
    metrics: Arc<Mutex<Vec<DriftMetrics>>>,
}

impl MetricsCollector {
    pub fn new() -> Self {
        Self {
            metrics: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn record_drift_metrics(&self, metrics: DriftMetrics) -> Result<(), String> {
        self.metrics
            .lock()
            .map_err(|_| "failed to lock metrics".to_string())?
            .push(metrics);
        Ok(())
    }
}

pub fn analyze_event_history_v3(
    tenant_id: uuid::Uuid,
    events: Vec<EventEntry>,
    tenant_ctx: TenantContext,
    model_manager: &ModelManager,
    metrics_collector: &MetricsCollector,
) -> Result<Vec<Pattern>, String> {
    let metadata = model_manager.get_metadata()?;

    let mut patterns = pattern_detection::analyze_event_history(tenant_id, events, tenant_ctx)?;

    patterns.retain(|p| {
        let type_threshold = match p.pattern_type {
            PatternType::Anomaly => metadata.confidence_threshold * metadata.spike_sensitivity,
            PatternType::EventCorrelation => metadata.confidence_threshold,
            PatternType::TimeBased => metadata.confidence_threshold,
            PatternType::RepeatedAction => metadata.confidence_threshold * metadata.drift_sensitivity,
        };
        p.confidence >= type_threshold.min(1.0)
    });

    if patterns.is_empty() {
        return Ok(patterns);
    }

    let confidences: Vec<f32> = patterns.iter().map(|p| p.confidence).collect();
    let avg = confidences.iter().sum::<f32>() / confidences.len() as f32;
    let variance = confidences
        .iter()
        .map(|c| (c - avg).powi(2))
        .sum::<f32>()
        / confidences.len() as f32;

    let mut drift = DriftMetrics::new();
    drift.inference_count = confidences.len() as u64;
    drift.avg_confidence = avg;
    drift.confidence_std_dev = variance.sqrt();
    drift.anomaly_rate = patterns
        .iter()
        .filter(|p| matches!(p.pattern_type, PatternType::Anomaly))
        .count() as f32
        / patterns.len() as f32;
    drift.drift_score = (0.8 - avg).max(0.0);
    drift.drift_detected = drift.drift_score > 0.3;

    let _ = metrics_collector.record_drift_metrics(drift);
    model_manager.increment_inference_count();

    Ok(patterns)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::pattern_detection::{EventBuilder, TenantContextBuilder};

    #[test]
    fn offline_benchmark_pattern_detection() {
        let tenant_id = uuid::Uuid::new_v4();
        let mut events = Vec::new();
        let base = Utc::now() - chrono::Duration::days(2);

        for i in 0..800 {
            events.push(
                EventBuilder::new("http.request", "http")
                    .with_timestamp(base + chrono::Duration::seconds((i * 15) as i64))
                    .with_step_duration_ms((50 + (i % 200)) as u32)
                    .with_retry_count((i % 3) as u32)
                    .with_error(i % 40 == 0)
                    .build(),
            );
        }

        let ctx = TenantContextBuilder::new(tenant_id)
            .plan(1)
            .avg_daily_events(500.0)
            .build();

        let manager = ModelManager::new(PathBuf::from("./models")).expect("manager init");
        let metrics = MetricsCollector::new();

        let start = std::time::Instant::now();
        let result = analyze_event_history_v3(tenant_id, events, ctx, &manager, &metrics);
        let elapsed = start.elapsed();

        assert!(result.is_ok());
        assert!(elapsed.as_secs_f32() < 2.0);
    }

    #[test]
    fn online_canary_scoring_validation() {
        let tenant_id = uuid::Uuid::new_v4();
        let now = Utc::now();

        let canary_events = vec![
            EventBuilder::new("flow.run.start", "schedule")
                .with_timestamp(now - chrono::Duration::minutes(5))
                .with_step_duration_ms(40)
                .build(),
            EventBuilder::new("flow.run.finish", "schedule")
                .with_timestamp(now - chrono::Duration::minutes(4))
                .with_step_duration_ms(80)
                .build(),
            EventBuilder::new("flow.run.error", "http")
                .with_timestamp(now - chrono::Duration::minutes(3))
                .with_step_duration_ms(1900)
                .with_error(true)
                .build(),
            EventBuilder::new("flow.run.retry", "http")
                .with_timestamp(now - chrono::Duration::minutes(2))
                .with_step_duration_ms(1200)
                .with_retry_count(2)
                .build(),
        ];

        let ctx = TenantContextBuilder::new(tenant_id)
            .plan(2)
            .avg_daily_events(1200.0)
            .build();

        let manager = ModelManager::new(PathBuf::from("./models")).expect("manager init");
        let metrics = MetricsCollector::new();
        let result = analyze_event_history_v3(tenant_id, canary_events, ctx, &manager, &metrics)
            .expect("canary analyze");

        assert!(result.iter().all(|p| p.confidence >= 0.0 && p.confidence <= 1.0));
    }
}
