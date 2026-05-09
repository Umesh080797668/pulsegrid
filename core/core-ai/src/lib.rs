/// PulseAI - Intelligence Layer
///
/// This crate provides AI capabilities including pattern detection, natural language flow generation,
/// and failure analysis. Pattern detection uses statistical analysis of event history to identify:
/// - Repeated manual actions and sequences
/// - Correlated events with temporal relationships
/// - Anomalous events (spikes, outliers)

use chrono::{DateTime, Utc, Datelike, Timelike};
use std::collections::HashMap;
use std::path::PathBuf;

pub mod pattern_detection_v3;

pub mod pattern_detection {
    use super::*;
    
    /// Represents a detected pattern in event history
    #[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
    pub struct Pattern {
        pub id: String,
        pub pattern_type: PatternType,
        pub description: String,
        pub confidence: f32,
        pub frequency: String,
        pub events_involved: Vec<String>,
        pub suggested_trigger: Option<String>,
        pub suggested_actions: Vec<String>,
    }

    #[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
    pub enum PatternType {
        #[serde(rename = "repeated_action")]
        RepeatedAction,
        #[serde(rename = "correlation")]
        EventCorrelation,
        #[serde(rename = "anomaly")]
        Anomaly,
        #[serde(rename = "time_based")]
        TimeBased,
    }

    /// Event history entry for analysis
    #[derive(Debug, Clone)]
    pub struct EventEntry {
        pub event_type: String,
        pub timestamp: DateTime<Utc>,
        pub connector: String,
        pub action: Option<String>,
        /// Additional fields for rich feature engineering
        pub payload_size: Option<usize>,
        pub step_duration_ms: Option<u32>,
        pub retry_count: Option<u32>,
        pub error_flag: bool,
        pub latency_p95_ms: Option<u32>,
        pub success_rate: Option<f32>,
        pub connector_error_rate: Option<f32>,
    }

    /// Tenant context for normalization and adaptive thresholding
    #[derive(Debug, Clone)]
    pub struct TenantContext {
        pub tenant_id: uuid::Uuid,
        pub plan_encoded: u8,               // 0-3: free, pro, enterprise, custom
        pub avg_daily_events: f32,
        pub avg_flow_success_rate: f32,
        pub connector_count: u32,
        pub flow_count: u32,
        pub account_age_days: u32,
        pub historical_anomaly_rate: f32,
        pub marketplace_template_flag: bool,
        pub enterprise_flag: bool,
        pub wasm_usage_rate: f32,
        pub iot_connector_flag: bool,
        pub multi_region_flag: bool,
    }

    /// Analyzes event history for patterns.
    ///
    /// The analyzer first attempts ONNX inference (via `tract_onnx`) when a model
    /// is available, then falls back to deterministic statistical detectors.
    pub fn analyze_event_history(
        tenant_id: uuid::Uuid,
        events: Vec<EventEntry>,
        tenant_ctx: TenantContext,
    ) -> Result<Vec<Pattern>, String> {
        if events.is_empty() {
            return Ok(vec![]);
        }

        let mut patterns = Vec::new();

        // Pattern 0: ML model inference (optional)
        // If the ONNX model is unavailable or inference fails, continue with
        // statistical detectors so this remains fully functional.
        match detect_patterns_with_onnx(&events, &tenant_ctx) {
            Ok(Some(ml_patterns)) => patterns.extend(ml_patterns),
            Ok(None) => {
                // No model file configured/present; skip ML inference.
            }
            Err(err) => {
                eprintln!("PulseAI ONNX inference skipped: {}", err);
            }
        }

        // Pattern 1: Detect repeated actions on specific days/times
        if let Some(time_patterns) = detect_time_based_patterns(&events) {
            patterns.extend(time_patterns);
        }

        // Pattern 2: Detect event correlations (event A → event B within N minutes)
        if let Some(correlations) = detect_event_correlations(&events) {
            patterns.extend(correlations);
        }

        // Pattern 3: Detect anomalies (spikes, unusual patterns)
        if let Some(anomalies) = detect_anomalies(&events) {
            patterns.extend(anomalies);
        }

        println!("Analyzed {} events for tenant {}, found {} patterns", 
                 events.len(), tenant_id, patterns.len());
        
        Ok(patterns)
    }

    /// Attempts ML-based pattern detection using an ONNX model via tract.
    ///
    /// The model expects:
    /// - event_window: [B, 32, 32] shaped tensor with 32 event timesteps × 32 engineered features per event
    /// - tenant_context: [B, 16] shaped tensor with 16 tenant context features
    ///
    /// Feature engineering for event_window (0-31):
    ///   0-3:  connector_type_onehot (smtp, http, sftp, other)
    ///   4-7:  event_category_onehot (start, success, retry, error)
    ///   8:    payload_size_norm (0-1)
    ///   9:    step_duration_ms_norm (0-1)
    ///   10:   retry_count_norm (0-1)
    ///   11:   error_flag (0 or 1)
    ///   12:   hour_sin (sin of hour_of_day)
    ///   13:   hour_cos (cos of hour_of_day)
    ///   14:   dow_sin (sin of day_of_week)
    ///   15:   dow_cos (cos of day_of_week)
    ///   16:   run_success_rate (0-1)
    ///   17:   connector_error_rate (0-1)
    ///   18:   flow_step_count_norm (0-1)
    ///   19:   flow_branch_count_norm (0-1)
    ///   20:   loop_depth_norm (0-1)
    ///   21:   parallel_depth_norm (0-1)
    ///   22:   connector_latency_p95_norm (0-1)
    ///   23:   circuit_breaker_open (0 or 1)
    ///   24:   connector_retry_rate (0-1)
    ///   25:   wasm_exec_time_norm (0-1)
    ///   26:   event_burst_flag (0 or 1)
    ///   27:   oauth_refresh_flag (0 or 1)
    ///   28-31: reserved (0)
    ///
    /// Feature engineering for tenant_context (0-15):
    ///   0:    tenant_plan_encoded (0-3: free, pro, enterprise, custom)
    ///   1:    avg_daily_events_norm (0-1)
    ///   2:    avg_flow_success_rate (0-1)
    ///   3:    peak_hour_sin (sin of peak hour)
    ///   4:    peak_hour_cos (cos of peak hour)
    ///   5:    connector_count_norm (0-1)
    ///   6:    flow_count_norm (0-1)
    ///   7:    account_age_norm (0-1)
    ///   8:    historical_anomaly_rate (0-1)
    ///   9:    marketplace_template_flag (0 or 1)
    ///   10:   enterprise_flag (0 or 1)
    ///   11:   avg_payload_size_norm (0-1)
    ///   12:   wasm_usage_rate (0-1)
    ///   13:   iot_connector_flag (0 or 1)
    ///   14:   multi_region_flag (0 or 1)
    ///   15:   reserved (0)
    ///
    /// Returns `Ok(None)` when the model file does not exist.
    fn detect_patterns_with_onnx(
        events: &[EventEntry],
        tenant_ctx: &TenantContext,
    ) -> Result<Option<Vec<Pattern>>, String> {
        use tract_onnx::prelude::*;

        let configured_path = std::env::var("PULSEAI_ONNX_MODEL").ok();
        let model_path = configured_path
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .join("models")
                    .join("pulseai_pattern_v3.onnx")
            });

        if !model_path.exists() {
            return Ok(None);
        }

        // ─────────────────────────────────────────────────────────────────────
        // Feature Engineering: Event Window [1, 32, 32]
        // ─────────────────────────────────────────────────────────────────────
        let seq_len = 32usize;
        let feat_width = 32usize;
        let mut event_features = vec![0f32; seq_len * feat_width];

        // Compute normalization bounds from event history
        let max_payload_size = events
            .iter()
            .filter_map(|e| e.payload_size)
            .max()
            .unwrap_or(1) as f32;
        let max_step_duration = events
            .iter()
            .filter_map(|e| e.step_duration_ms)
            .max()
            .unwrap_or(5000) as f32;
        let max_retry_count = events
            .iter()
            .filter_map(|e| e.retry_count)
            .max()
            .unwrap_or(5) as f32;
        let max_latency_p95 = events
            .iter()
            .filter_map(|e| e.latency_p95_ms)
            .max()
            .unwrap_or(10000) as f32;

        let start_idx = events.len().saturating_sub(seq_len);
        for (i, event) in events[start_idx..].iter().enumerate() {
            let base = i * feat_width;

            // ── 0-3: connector_type_onehot ──
            let connector_type = match event.connector.as_str() {
                "smtp" => 0,
                "http" => 1,
                "sftp" => 2,
                _ => 3,
            };
            for j in 0..4 {
                event_features[base + j] = if j == connector_type { 1.0 } else { 0.0 };
            }

            // ── 4-7: event_category_onehot ──
            let category = if event.error_flag {
                3 // error
            } else if event.retry_count.map(|r| r > 0).unwrap_or(false) {
                2 // retry
            } else if let Some(action) = &event.action {
                if action.contains("start") {
                    0 // start
                } else {
                    1 // success
                }
            } else {
                1 // success
            };
            for j in 0..4 {
                event_features[base + 4 + j] = if j == category { 1.0 } else { 0.0 };
            }

            // ── 8: payload_size_norm ──
            let payload_norm = if max_payload_size > 0.0 {
                event.payload_size.unwrap_or(0) as f32 / max_payload_size
            } else {
                0.0
            };
            event_features[base + 8] = payload_norm.clamp(0.0, 1.0);

            // ── 9: step_duration_ms_norm ──
            let duration_norm = if max_step_duration > 0.0 {
                event.step_duration_ms.unwrap_or(0) as f32 / max_step_duration
            } else {
                0.0
            };
            event_features[base + 9] = duration_norm.clamp(0.0, 1.0);

            // ── 10: retry_count_norm ──
            let retry_norm = if max_retry_count > 0.0 {
                event.retry_count.unwrap_or(0) as f32 / max_retry_count
            } else {
                0.0
            };
            event_features[base + 10] = retry_norm.clamp(0.0, 1.0);

            // ── 11: error_flag ──
            event_features[base + 11] = if event.error_flag { 1.0 } else { 0.0 };

            // ── 12-13: hour_sin/cos ──
            let hour = event.timestamp.hour() as f32;
            let hour_rad = (hour / 24.0) * 2.0 * std::f32::consts::PI;
            event_features[base + 12] = hour_rad.sin();
            event_features[base + 13] = hour_rad.cos();

            // ── 14-15: dow_sin/cos ──
            let dow = event.timestamp.weekday().num_days_from_monday() as f32;
            let dow_rad = (dow / 7.0) * 2.0 * std::f32::consts::PI;
            event_features[base + 14] = dow_rad.sin();
            event_features[base + 15] = dow_rad.cos();

            // ── 16: run_success_rate ──
            event_features[base + 16] = event.success_rate.unwrap_or(0.9).clamp(0.0, 1.0);

            // ── 17: connector_error_rate ──
            event_features[base + 17] = event.connector_error_rate.unwrap_or(0.05).clamp(0.0, 1.0);

            // ── 18: flow_step_count_norm ──
            // Estimated from event window density (proxy: 0.5 as default)
            event_features[base + 18] = 0.5;

            // ── 19: flow_branch_count_norm ──
            // Estimated as 0.3 (conservative proxy)
            event_features[base + 19] = 0.3;

            // ── 20: loop_depth_norm ──
            // Estimated as 0.2 (conservative proxy)
            event_features[base + 20] = 0.2;

            // ── 21: parallel_depth_norm ──
            // Estimated as 0.1 (conservative proxy)
            event_features[base + 21] = 0.1;

            // ── 22: connector_latency_p95_norm ──
            let latency_norm = if max_latency_p95 > 0.0 {
                event.latency_p95_ms.unwrap_or(0) as f32 / max_latency_p95
            } else {
                0.0
            };
            event_features[base + 22] = latency_norm.clamp(0.0, 1.0);

            // ── 23: circuit_breaker_open ──
            // Heuristic: open if error_rate > 0.5 or latency_p95 > 5000ms
            let circuit_open = (event.connector_error_rate.unwrap_or(0.0) > 0.5)
                || (event.latency_p95_ms.unwrap_or(0) > 5000);
            event_features[base + 23] = if circuit_open { 1.0 } else { 0.0 };

            // ── 24: connector_retry_rate ──
            let retry_rate = if event.retry_count.unwrap_or(0) > 0 {
                (event.retry_count.unwrap_or(1) as f32) / (event.step_duration_ms.unwrap_or(1000) as f32 / 100.0)
            } else {
                0.0
            };
            event_features[base + 24] = retry_rate.clamp(0.0, 1.0);

            // ── 25: wasm_exec_time_norm ──
            // Proxy from step_duration (assuming 20% is wasm overhead)
            event_features[base + 25] = (duration_norm * 0.2).clamp(0.0, 1.0);

            // ── 26: event_burst_flag ──
            // Heuristic: true if step_duration < 50ms (rapid fire)
            let burst_flag = event.step_duration_ms.unwrap_or(100) < 50;
            event_features[base + 26] = if burst_flag { 1.0 } else { 0.0 };

            // ── 27: oauth_refresh_flag ──
            // Heuristic: true if action contains "oauth"
            let oauth_flag = event
                .action
                .as_ref()
                .map(|a| a.contains("oauth"))
                .unwrap_or(false);
            event_features[base + 27] = if oauth_flag { 1.0 } else { 0.0 };

            // ── 28-31: reserved ──
            for j in 28..32 {
                event_features[base + j] = 0.0;
            }
        }

        // ─────────────────────────────────────────────────────────────────────
        // Feature Engineering: Tenant Context [1, 16]
        // ─────────────────────────────────────────────────────────────────────
        let mut ctx_features = vec![0f32; 16];

        // ── 0: tenant_plan_encoded (0-3) ──
        ctx_features[0] = tenant_ctx.plan_encoded as f32 / 3.0; // normalize to [0,1]

        // ── 1: avg_daily_events_norm ──
        let max_daily_events = 100000.0f32; // typical enterprise scale
        ctx_features[1] = (tenant_ctx.avg_daily_events / max_daily_events).clamp(0.0, 1.0);

        // ── 2: avg_flow_success_rate ──
        ctx_features[2] = tenant_ctx.avg_flow_success_rate.clamp(0.0, 1.0);

        // ── 3-4: peak_hour_sin/cos ──
        let peak_hour = 14.0; // typical business hours
        let peak_rad = (peak_hour / 24.0) * 2.0 * std::f32::consts::PI;
        ctx_features[3] = peak_rad.sin();
        ctx_features[4] = peak_rad.cos();

        // ── 5: connector_count_norm ──
        let max_connectors = 500.0f32;
        ctx_features[5] = (tenant_ctx.connector_count as f32 / max_connectors).clamp(0.0, 1.0);

        // ── 6: flow_count_norm ──
        let max_flows = 10000.0f32;
        ctx_features[6] = (tenant_ctx.flow_count as f32 / max_flows).clamp(0.0, 1.0);

        // ── 7: account_age_norm ──
        let max_age_days = 3650.0f32; // ~10 years
        ctx_features[7] = (tenant_ctx.account_age_days as f32 / max_age_days).clamp(0.0, 1.0);

        // ── 8: historical_anomaly_rate ──
        ctx_features[8] = tenant_ctx.historical_anomaly_rate.clamp(0.0, 1.0);

        // ── 9: marketplace_template_flag ──
        ctx_features[9] = if tenant_ctx.marketplace_template_flag { 1.0 } else { 0.0 };

        // ── 10: enterprise_flag ──
        ctx_features[10] = if tenant_ctx.enterprise_flag { 1.0 } else { 0.0 };

        // ── 11: avg_payload_size_norm ──
        let max_payload = 10485760.0f32; // 10MB
        ctx_features[11] = (max_payload_size / max_payload).clamp(0.0, 1.0);

        // ── 12: wasm_usage_rate ──
        ctx_features[12] = tenant_ctx.wasm_usage_rate.clamp(0.0, 1.0);

        // ── 13: iot_connector_flag ──
        ctx_features[13] = if tenant_ctx.iot_connector_flag { 1.0 } else { 0.0 };

        // ── 14: multi_region_flag ──
        ctx_features[14] = if tenant_ctx.multi_region_flag { 1.0 } else { 0.0 };

        // ── 15: reserved ──
        ctx_features[15] = 0.0;

        // ─────────────────────────────────────────────────────────────────────
        // ONNX Inference
        // ─────────────────────────────────────────────────────────────────────
        let model = tract_onnx::onnx()
            .model_for_path(&model_path)
            .map_err(|e| format!("Failed to load ONNX model at {}: {}", model_path.display(), e))?
            .with_input_fact(0, InferenceFact::dt_shape(f32::datum_type(), tvec!(1, seq_len as i64, feat_width as i64)))
            .map_err(|e| format!("Failed to set event_window input fact: {}", e))?
            .with_input_fact(1, InferenceFact::dt_shape(f32::datum_type(), tvec!(1, 16i64)))
            .map_err(|e| format!("Failed to set tenant_context input fact: {}", e))?
            .into_optimized()
            .map_err(|e| format!("Failed to optimize ONNX model: {}", e))?
            .into_runnable()
            .map_err(|e| format!("Failed to create ONNX runnable model: {}", e))?;

        let event_tensor = Tensor::from_shape(&[1usize, seq_len, feat_width], &event_features)
            .map_err(|e| format!("Failed to construct event_window tensor: {}", e))?;

        let ctx_tensor = Tensor::from_shape(&[1usize, 16], &ctx_features)
            .map_err(|e| format!("Failed to construct tenant_context tensor: {}", e))?;

        let outputs = model
            .run(tvec!(event_tensor.into(), ctx_tensor.into()))
            .map_err(|e| format!("ONNX inference failed: {}", e))?;

        // ─────────────────────────────────────────────────────────────────────
        // Parse Multi-Output Results
        // ─────────────────────────────────────────────────────────────────────
        let mut patterns = Vec::new();

        // Output 0: anomaly_score [1, 1]
        let anomaly_score_out = outputs
            .get(1) // is_anomaly is index 1
            .ok_or_else(|| "ONNX inference returned insufficient outputs".to_string())?;
        let is_anomaly_view = anomaly_score_out
            .to_array_view::<i64>()
            .map_err(|e| format!("Failed to decode is_anomaly output as i64: {}", e))?;
        let is_anomaly = is_anomaly_view.get([0, 0]).copied().unwrap_or(0) != 0;

        // Output 2: recon_error [1, 1]
        let recon_error_out = outputs
            .get(2)
            .ok_or_else(|| "ONNX inference missing recon_error output".to_string())?;
        let recon_view = recon_error_out
            .to_array_view::<f32>()
            .map_err(|e| format!("Failed to decode recon_error output: {}", e))?;
        let recon_error = recon_view.get([0, 0]).copied().unwrap_or(0.0);

        // Output 3: pattern_class [1, 4] (softmax probabilities)
        let pattern_class_out = outputs
            .get(3)
            .ok_or_else(|| "ONNX inference missing pattern_class output".to_string())?;
        let pattern_view = pattern_class_out
            .to_array_view::<f32>()
            .map_err(|e| format!("Failed to decode pattern_class output: {}", e))?;
        let pattern_probs: Vec<f32> = pattern_view.iter().copied().collect();

        // Output 4: severity_score [1, 1]
        let severity_out = outputs
            .get(4)
            .ok_or_else(|| "ONNX inference missing severity_score output".to_string())?;
        let severity_view = severity_out
            .to_array_view::<f32>()
            .map_err(|e| format!("Failed to decode severity_score output: {}", e))?;
        let severity_score = severity_view.get([0, 0]).copied().unwrap_or(0.0);

        // Output 5: latent_vec [1, 64] (skip for pattern generation)
        // Output 6: adaptive_threshold [1, 1]
        // Output 7: confidence [1, 1] (entropy-based)
        // Output 8: latent_norm [1, 1]

        // ─────────────────────────────────────────────────────────────────────
        // Pattern Generation from Model Outputs
        // ─────────────────────────────────────────────────────────────────────

        // Anomaly detection
        if is_anomaly {
            patterns.push(Pattern {
                id: "ml_anomaly_detected".to_string(),
                pattern_type: PatternType::Anomaly,
                description: format!(
                    "ML model detected anomalous event sequence (reconstruction error: {:.4})",
                    recon_error
                ),
                confidence: (severity_score * 0.95 + 0.05).min(1.0),
                frequency: "model_inference".to_string(),
                events_involved: events.iter().take(8).map(|e| e.event_type.clone()).collect(),
                suggested_trigger: None,
                suggested_actions: vec!["investigate".to_string(), "increase_monitoring".to_string()],
            });
        }

        // Pattern classification (0=spike, 1=drift, 2=correlation, 3=normal)
        if pattern_probs.len() >= 4 {
            let spike_conf = pattern_probs[0];
            let drift_conf = pattern_probs[1];
            let corr_conf = pattern_probs[2];
            let threshold = 0.55f32;

            if spike_conf >= threshold {
                patterns.push(Pattern {
                    id: "ml_spike_pattern".to_string(),
                    pattern_type: PatternType::Anomaly,
                    description: format!("ML model identified event spike pattern (confidence: {:.2}%)", spike_conf * 100.0),
                    confidence: spike_conf,
                    frequency: "model_inference".to_string(),
                    events_involved: events.iter().take(5).map(|e| e.event_type.clone()).collect(),
                    suggested_trigger: Some("Alert on excessive event rate".to_string()),
                    suggested_actions: vec!["throttle".to_string()],
                });
            }

            if drift_conf >= threshold {
                patterns.push(Pattern {
                    id: "ml_drift_pattern".to_string(),
                    pattern_type: PatternType::Anomaly,
                    description: format!("ML model identified behavior drift pattern (confidence: {:.2}%)", drift_conf * 100.0),
                    confidence: drift_conf,
                    frequency: "model_inference".to_string(),
                    events_involved: events.iter().take(6).map(|e| e.event_type.clone()).collect(),
                    suggested_trigger: Some("Monitor for configuration changes".to_string()),
                    suggested_actions: vec!["alert".to_string(), "review_config".to_string()],
                });
            }

            if corr_conf >= threshold {
                patterns.push(Pattern {
                    id: "ml_correlation_pattern".to_string(),
                    pattern_type: PatternType::EventCorrelation,
                    description: format!("ML model identified event correlation pattern (confidence: {:.2}%)", corr_conf * 100.0),
                    confidence: corr_conf,
                    frequency: "model_inference".to_string(),
                    events_involved: events.iter().take(6).map(|e| e.event_type.clone()).collect(),
                    suggested_trigger: Some("Trigger follow-up action on precursor".to_string()),
                    suggested_actions: vec!["auto_chain_next_step".to_string()],
                });
            }
        }

        Ok(Some(patterns))
    }

    /// Detects time-based patterns (recurring at specific times/days)
    fn detect_time_based_patterns(events: &[EventEntry]) -> Option<Vec<Pattern>> {
        let mut patterns = Vec::new();
        let mut time_groups: HashMap<(u32, u32), Vec<&EventEntry>> = HashMap::new();

        // Group events by day of month and hour
        for event in events {
            let hour = event.timestamp.hour();
            let day = event.timestamp.day();
            time_groups
                .entry((day, hour))
                .or_insert_with(Vec::new)
                .push(event);
        }

        // Find recurring patterns (events at same day/time >= 3 times)
        for ((day, hour), entries) in time_groups.iter() {
            if entries.len() >= 3 {
                let confidence = (entries.len() as f32 / events.len() as f32).min(1.0);
                let event_types: Vec<String> = entries
                    .iter()
                    .map(|e| e.event_type.clone())
                    .collect();

                patterns.push(Pattern {
                    id: format!("time_{}_{}", day, hour),
                    pattern_type: PatternType::TimeBased,
                    description: format!(
                        "Events typically occur on day {} at {:02}:00",
                        day, hour
                    ),
                    confidence,
                    frequency: format!("{} times observed", entries.len()),
                    events_involved: event_types,
                    suggested_trigger: Some(format!("Schedule at {:02}:00", hour)),
                    suggested_actions: vec![],
                });
            }
        }

        if patterns.is_empty() {
            None
        } else {
            Some(patterns)
        }
    }

    /// Detects correlated events (A followed by B within time window)
    fn detect_event_correlations(events: &[EventEntry]) -> Option<Vec<Pattern>> {
        let mut patterns = Vec::new();
        let time_window_secs = 600; // 10 minutes
        let mut correlations: HashMap<(String, String), (usize, f32)> = HashMap::new();

        // Find sequential event pairs
        for i in 0..events.len() - 1 {
            for j in i + 1..events.len() {
                let time_diff = (events[j].timestamp - events[i].timestamp).num_seconds();
                if time_diff > 0 && time_diff <= time_window_secs {
                    let pair = (events[i].event_type.clone(), events[j].event_type.clone());
                    let entry = correlations.entry(pair).or_insert((0, 0.0));
                    entry.0 += 1;
                }
            }
        }

        // Filter correlations with sufficient confidence
        for ((event_a, event_b), (count, _)) in correlations.iter() {
            let confidence = (*count as f32 / events.len() as f32).min(1.0);
            if confidence >= 0.3 && *count >= 2 {
                patterns.push(Pattern {
                    id: format!("corr_{}_{}", event_a, event_b),
                    pattern_type: PatternType::EventCorrelation,
                    description: format!(
                        "{} is often followed by {} (within 10 minutes)",
                        event_a, event_b
                    ),
                    confidence,
                    frequency: format!("{} times observed", count),
                    events_involved: vec![event_a.clone(), event_b.clone()],
                    suggested_trigger: Some(format!("When {} occurs", event_a)),
                    suggested_actions: vec![event_b.clone()],
                });
            }
        }

        if patterns.is_empty() {
            None
        } else {
            Some(patterns)
        }
    }

    /// Detects anomalies using statistical methods
    fn detect_anomalies(events: &[EventEntry]) -> Option<Vec<Pattern>> {
        let mut patterns = Vec::new();
        let mut event_counts: HashMap<String, Vec<DateTime<Utc>>> = HashMap::new();

        // Count events by type
        for event in events {
            event_counts
                .entry(event.event_type.clone())
                .or_insert_with(Vec::new)
                .push(event.timestamp);
        }

        // Detect spikes using simple statistical method
        for (event_type, timestamps) in event_counts.iter() {
            if timestamps.len() >= 5 {
                // Calculate average interval between events
                let mut intervals = Vec::new();
                let sorted_times: Vec<_> = {
                    let mut t = timestamps.clone();
                    t.sort();
                    t
                };

                for i in 0..sorted_times.len() - 1 {
                    let interval = (sorted_times[i + 1] - sorted_times[i]).num_seconds();
                    if interval > 0 {
                        intervals.push(interval as f32);
                    }
                }

                if !intervals.is_empty() {
                    let avg_interval: f32 = intervals.iter().sum::<f32>() / intervals.len() as f32;
                    let std_dev = calculate_std_dev(&intervals, avg_interval);

                    // Detect outliers (> 2 standard deviations)
                    let mut spike_count = 0;
                    for interval in intervals.iter() {
                        if std_dev > 0.0 && (*interval - avg_interval).abs() > 2.0 * std_dev {
                            spike_count += 1;
                        }
                    }

                    if spike_count > 0 {
                        patterns.push(Pattern {
                            id: format!("anomaly_{}", event_type),
                            pattern_type: PatternType::Anomaly,
                            description: format!(
                                "Unusual spike detected in {} events (avg interval: {:.0}s, observed: {:.0}s)",
                                event_type, avg_interval, std_dev
                            ),
                            confidence: 0.7,
                            frequency: format!("{} anomalies detected", spike_count),
                            events_involved: vec![event_type.clone()],
                            suggested_trigger: None,
                            suggested_actions: vec!["investigate".to_string()],
                        });
                    }
                }
            }
        }

        if patterns.is_empty() {
            None
        } else {
            Some(patterns)
        }
    }

    /// Helper: Calculate standard deviation
    fn calculate_std_dev(values: &[f32], mean: f32) -> f32 {
        if values.is_empty() {
            return 0.0;
        }
        let variance: f32 = values.iter()
            .map(|v| (v - mean).powi(2))
            .sum::<f32>() / values.len() as f32;
        variance.sqrt()
    }

    /// Builder for EventEntry — facilitates rich feature engineering
    pub struct EventBuilder {
        pub event_type: String,
        pub timestamp: DateTime<Utc>,
        pub connector: String,
        pub action: Option<String>,
        pub payload_size: Option<usize>,
        pub step_duration_ms: Option<u32>,
        pub retry_count: Option<u32>,
        pub error_flag: bool,
        pub latency_p95_ms: Option<u32>,
        pub success_rate: Option<f32>,
        pub connector_error_rate: Option<f32>,
    }

    impl EventBuilder {
        pub fn new(event_type: impl Into<String>, connector: impl Into<String>) -> Self {
            Self {
                event_type: event_type.into(),
                timestamp: Utc::now(),
                connector: connector.into(),
                action: None,
                payload_size: None,
                step_duration_ms: None,
                retry_count: None,
                error_flag: false,
                latency_p95_ms: None,
                success_rate: None,
                connector_error_rate: None,
            }
        }

        pub fn with_timestamp(mut self, timestamp: DateTime<Utc>) -> Self {
            self.timestamp = timestamp;
            self
        }

        pub fn with_action(mut self, action: impl Into<String>) -> Self {
            self.action = Some(action.into());
            self
        }

        pub fn with_payload_size(mut self, size: usize) -> Self {
            self.payload_size = Some(size);
            self
        }

        pub fn with_step_duration_ms(mut self, ms: u32) -> Self {
            self.step_duration_ms = Some(ms);
            self
        }

        pub fn with_retry_count(mut self, count: u32) -> Self {
            self.retry_count = Some(count);
            self
        }

        pub fn with_error(mut self, is_error: bool) -> Self {
            self.error_flag = is_error;
            self
        }

        pub fn with_latency_p95_ms(mut self, ms: u32) -> Self {
            self.latency_p95_ms = Some(ms);
            self
        }

        pub fn with_success_rate(mut self, rate: f32) -> Self {
            self.success_rate = Some(rate.clamp(0.0, 1.0));
            self
        }

        pub fn with_connector_error_rate(mut self, rate: f32) -> Self {
            self.connector_error_rate = Some(rate.clamp(0.0, 1.0));
            self
        }

        pub fn build(self) -> EventEntry {
            EventEntry {
                event_type: self.event_type,
                timestamp: self.timestamp,
                connector: self.connector,
                action: self.action,
                payload_size: self.payload_size,
                step_duration_ms: self.step_duration_ms,
                retry_count: self.retry_count,
                error_flag: self.error_flag,
                latency_p95_ms: self.latency_p95_ms,
                success_rate: self.success_rate,
                connector_error_rate: self.connector_error_rate,
            }
        }
    }

    /// Builder for TenantContext — facilitates tenant feature engineering
    pub struct TenantContextBuilder {
        pub tenant_id: uuid::Uuid,
        pub plan_encoded: u8,
        pub avg_daily_events: f32,
        pub avg_flow_success_rate: f32,
        pub connector_count: u32,
        pub flow_count: u32,
        pub account_age_days: u32,
        pub historical_anomaly_rate: f32,
        pub marketplace_template_flag: bool,
        pub enterprise_flag: bool,
        pub wasm_usage_rate: f32,
        pub iot_connector_flag: bool,
        pub multi_region_flag: bool,
    }

    impl TenantContextBuilder {
        pub fn new(tenant_id: uuid::Uuid) -> Self {
            Self {
                tenant_id,
                plan_encoded: 0,
                avg_daily_events: 100.0,
                avg_flow_success_rate: 0.95,
                connector_count: 5,
                flow_count: 10,
                account_age_days: 180,
                historical_anomaly_rate: 0.05,
                marketplace_template_flag: false,
                enterprise_flag: false,
                wasm_usage_rate: 0.0,
                iot_connector_flag: false,
                multi_region_flag: false,
            }
        }

        pub fn plan(mut self, plan: u8) -> Self {
            self.plan_encoded = plan.min(3);
            self
        }

        pub fn avg_daily_events(mut self, count: f32) -> Self {
            self.avg_daily_events = count.max(0.0);
            self
        }

        pub fn avg_flow_success_rate(mut self, rate: f32) -> Self {
            self.avg_flow_success_rate = rate.clamp(0.0, 1.0);
            self
        }

        pub fn connector_count(mut self, count: u32) -> Self {
            self.connector_count = count;
            self
        }

        pub fn flow_count(mut self, count: u32) -> Self {
            self.flow_count = count;
            self
        }

        pub fn account_age_days(mut self, days: u32) -> Self {
            self.account_age_days = days;
            self
        }

        pub fn historical_anomaly_rate(mut self, rate: f32) -> Self {
            self.historical_anomaly_rate = rate.clamp(0.0, 1.0);
            self
        }

        pub fn marketplace_template_flag(mut self, flag: bool) -> Self {
            self.marketplace_template_flag = flag;
            self
        }

        pub fn enterprise_flag(mut self, flag: bool) -> Self {
            self.enterprise_flag = flag;
            self
        }

        pub fn wasm_usage_rate(mut self, rate: f32) -> Self {
            self.wasm_usage_rate = rate.clamp(0.0, 1.0);
            self
        }

        pub fn iot_connector_flag(mut self, flag: bool) -> Self {
            self.iot_connector_flag = flag;
            self
        }

        pub fn multi_region_flag(mut self, flag: bool) -> Self {
            self.multi_region_flag = flag;
            self
        }

        pub fn build(self) -> TenantContext {
            TenantContext {
                tenant_id: self.tenant_id,
                plan_encoded: self.plan_encoded,
                avg_daily_events: self.avg_daily_events,
                avg_flow_success_rate: self.avg_flow_success_rate,
                connector_count: self.connector_count,
                flow_count: self.flow_count,
                account_age_days: self.account_age_days,
                historical_anomaly_rate: self.historical_anomaly_rate,
                marketplace_template_flag: self.marketplace_template_flag,
                enterprise_flag: self.enterprise_flag,
                wasm_usage_rate: self.wasm_usage_rate,
                iot_connector_flag: self.iot_connector_flag,
                multi_region_flag: self.multi_region_flag,
            }
        }
    }
}


pub mod flow_builder {
    use serde_json::{json, Value};

    /// Model providers supported for flow generation
    #[derive(Debug, Clone)]
    enum LLMProvider {
        Anthropic,
        OpenAI,
    }

    /// Generates Flow DSL from natural language prompt using LLM.
    ///
    /// Supports both Anthropic (Claude) and OpenAI (GPT-4) via environment variables:
    /// - ANTHROPIC_API_KEY: triggers Anthropic backend
    /// - OPENAI_API_KEY: triggers OpenAI backend (fallback)
    ///
    /// Returns a Flow DSL JSON object suitable for execution.
    pub async fn generate_flow_from_prompt(prompt: &str) -> Result<Value, String> {
        let provider = detect_provider()?;
        
        match provider {
            LLMProvider::Anthropic => generate_with_anthropic(prompt).await,
            LLMProvider::OpenAI => generate_with_openai(prompt).await,
        }
    }

    fn detect_provider() -> Result<LLMProvider, String> {
        if std::env::var("ANTHROPIC_API_KEY").is_ok() {
            Ok(LLMProvider::Anthropic)
        } else if std::env::var("OPENAI_API_KEY").is_ok() {
            Ok(LLMProvider::OpenAI)
        } else {
            Err("Neither ANTHROPIC_API_KEY nor OPENAI_API_KEY is set".to_string())
        }
    }

    async fn generate_with_anthropic(prompt: &str) -> Result<Value, String> {
        let api_key = std::env::var("ANTHROPIC_API_KEY").map_err(|_| "ANTHROPIC_API_KEY not set".to_string())?;
        let model = std::env::var("ANTHROPIC_MODEL").unwrap_or_else(|_| "claude-3-opus-20240229".to_string());
        let client = reqwest::Client::new();

        let catalog_text = fetch_connector_catalog().await.unwrap_or_default();

        let system_instruction = format!(
            "You are a PulseGrid Flow DSL expert. Convert the user's natural language \
            request into a valid JSON Flow DSL object. Respond ONLY with valid JSON.\n\
            The Flow DSL must have:\n\
            - trigger (object with connector and event keys)\n\
            - steps (array of action objects with connector, action, inputs)\n\
            - timeout_ms (integer, milliseconds)\n\n\
            Connector Catalog:\n{}",
            catalog_text
        );

        let url = "https://api.anthropic.com/v1/messages";
        let request_body = json!({
            "model": model,
            "max_tokens": 2000,
            "system": system_instruction,
            "messages": [{
                "role": "user",
                "content": prompt
            }]
        });

        let response = client
            .post(url)
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&request_body)
            .send()
            .await
            .map_err(|e| format!("Anthropic request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("Anthropic API error ({}): {}", status, error_text));
        }

        let resp_json: Value = response.json().await.map_err(|e| format!("Failed to parse Anthropic response: {}", e))?;
        
        let content = resp_json["content"]
            .as_array()
            .and_then(|arr| arr.first())
            .and_then(|obj| obj.get("text"))
            .and_then(|v| v.as_str())
            .ok_or_else(|| "No text content in Anthropic response".to_string())?;

        parse_flow_json(content)
    }

    async fn generate_with_openai(prompt: &str) -> Result<Value, String> {
        let api_key = std::env::var("OPENAI_API_KEY").map_err(|_| "OPENAI_API_KEY not set".to_string())?;
        let model = std::env::var("OPENAI_MODEL").unwrap_or_else(|_| "gpt-4-turbo".to_string());
        let client = reqwest::Client::new();

        let catalog_text = fetch_connector_catalog().await.unwrap_or_default();

        let system_instruction = format!(
            "You are a PulseGrid Flow DSL expert. Convert the user's natural language \
            request into a valid JSON Flow DSL object. Respond ONLY with valid JSON.\n\
            The Flow DSL must have:\n\
            - trigger (object with connector and event keys)\n\
            - steps (array of action objects with connector, action, inputs)\n\
            - timeout_ms (integer, milliseconds)\n\n\
            Connector Catalog:\n{}",
            catalog_text
        );

        let url = "https://api.openai.com/v1/chat/completions";
        let request_body = json!({
            "model": model,
            "max_tokens": 2000,
            "temperature": 0.3,
            "system": system_instruction,
            "messages": [{
                "role": "user",
                "content": prompt
            }]
        });

        let response = client
            .post(url)
            .header("Authorization", format!("Bearer {}", api_key))
            .json(&request_body)
            .send()
            .await
            .map_err(|e| format!("OpenAI request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("OpenAI API error ({}): {}", status, error_text));
        }

        let resp_json: Value = response.json().await.map_err(|e| format!("Failed to parse OpenAI response: {}", e))?;

        let content = resp_json["choices"]
            .as_array()
            .and_then(|arr| arr.first())
            .and_then(|obj| obj.get("message"))
            .and_then(|msg| msg.get("content"))
            .and_then(|v| v.as_str())
            .ok_or_else(|| "No message content in OpenAI response".to_string())?;

        parse_flow_json(content)
    }

    async fn fetch_connector_catalog() -> Option<String> {
        if let Ok(catalog_url) = std::env::var("CONNECTOR_CATALOG_URL") {
            let client = reqwest::Client::new();
            if let Ok(resp) = client.get(&catalog_url).send().await {
                if resp.status().is_success() {
                    if let Ok(body) = resp.text().await {
                        return Some(body);
                    }
                }
            }
        }
        None
    }

    fn parse_flow_json(content: &str) -> Result<Value, String> {
        // Try to extract JSON from markdown code blocks
        let json_str = if content.contains("```json") {
            content
                .split("```json")
                .nth(1)
                .and_then(|s| s.split("```").next())
                .unwrap_or(content)
        } else if content.contains("```") {
            content
                .split("```")
                .nth(1)
                .unwrap_or(content)
        } else {
            content
        };

        let trimmed = json_str
            .trim_matches(|c: char| c.is_whitespace() || c == '`');

        serde_json::from_str(trimmed)
            .map_err(|e| format!("Failed to parse Flow DSL JSON: {} (input: {})", e, trimmed))
    }
}

pub mod failure_analysis {
    use serde_json::{json, Value};

    /// Analyzes a failed flow run and provides actionable troubleshooting suggestions.
    ///
    /// Uses LLM to:
    /// 1. Identify the root cause from error logs and stack traces
    /// 2. Suggest connector-specific remediations (API keys, permissions, timeouts)
    /// 3. Recommend configuration changes to prevent recurrence
    /// 4. Provide step-by-step resolution instructions
    ///
    /// Supports both Anthropic (Claude) and OpenAI (GPT-4).
    pub async fn analyze_failure(error_log: &str) -> Result<String, String> {
        let provider = detect_provider()?;
        
        match provider {
            FailureAnalysisProvider::Anthropic => analyze_with_anthropic(error_log).await,
            FailureAnalysisProvider::OpenAI => analyze_with_openai(error_log).await,
        }
    }

    #[derive(Debug, Clone)]
    enum FailureAnalysisProvider {
        Anthropic,
        OpenAI,
    }

    fn detect_provider() -> Result<FailureAnalysisProvider, String> {
        if std::env::var("ANTHROPIC_API_KEY").is_ok() {
            Ok(FailureAnalysisProvider::Anthropic)
        } else if std::env::var("OPENAI_API_KEY").is_ok() {
            Ok(FailureAnalysisProvider::OpenAI)
        } else {
            Err("Neither ANTHROPIC_API_KEY nor OPENAI_API_KEY is set".to_string())
        }
    }

    async fn analyze_with_anthropic(error_log: &str) -> Result<String, String> {
        let api_key = std::env::var("ANTHROPIC_API_KEY").map_err(|_| "ANTHROPIC_API_KEY not set".to_string())?;
        let model = std::env::var("ANTHROPIC_MODEL").unwrap_or_else(|_| "claude-3-opus-20240229".to_string());
        let client = reqwest::Client::new();

        let system_instruction = "You are PulseGrid's AI troubleshooting assistant. Analyze the error log and provide:\n\
            1. Root cause analysis (in 1-2 sentences)\n\
            2. Specific remediation steps (numbered list)\n\
            3. Prevention recommendations\n\
            4. Related documentation or connector setup tips\n\
            Respond in clear, actionable plain English suitable for users.";

        let url = "https://api.anthropic.com/v1/messages";
        let request_body = json!({
            "model": model,
            "max_tokens": 1200,
            "system": system_instruction,
            "messages": [{
                "role": "user",
                "content": format!("Analyze this flow failure and suggest fixes:\n\n{}", error_log)
            }]
        });

        let response = client
            .post(url)
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&request_body)
            .send()
            .await
            .map_err(|e| format!("Anthropic request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("Anthropic API error ({}): {}", status, error_text));
        }

        let resp_json: Value = response.json().await.map_err(|e| format!("Failed to parse Anthropic response: {}", e))?;
        
        let analysis = resp_json["content"]
            .as_array()
            .and_then(|arr| arr.first())
            .and_then(|obj| obj.get("text"))
            .and_then(|v| v.as_str())
            .unwrap_or("Unable to analyze failure; please review error logs manually.")
            .to_string();

        Ok(analysis)
    }

    async fn analyze_with_openai(error_log: &str) -> Result<String, String> {
        let api_key = std::env::var("OPENAI_API_KEY").map_err(|_| "OPENAI_API_KEY not set".to_string())?;
        let model = std::env::var("OPENAI_MODEL").unwrap_or_else(|_| "gpt-4-turbo".to_string());
        let client = reqwest::Client::new();

        let system_instruction = "You are PulseGrid's AI troubleshooting assistant. Analyze the error log and provide:\n\
            1. Root cause analysis (in 1-2 sentences)\n\
            2. Specific remediation steps (numbered list)\n\
            3. Prevention recommendations\n\
            4. Related documentation or connector setup tips\n\
            Respond in clear, actionable plain English suitable for users.";

        let url = "https://api.openai.com/v1/chat/completions";
        let request_body = json!({
            "model": model,
            "max_tokens": 1200,
            "temperature": 0.2,
            "system": system_instruction,
            "messages": [{
                "role": "user",
                "content": format!("Analyze this flow failure and suggest fixes:\n\n{}", error_log)
            }]
        });

        let response = client
            .post(url)
            .header("Authorization", format!("Bearer {}", api_key))
            .json(&request_body)
            .send()
            .await
            .map_err(|e| format!("OpenAI request failed: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            return Err(format!("OpenAI API error ({}): {}", status, error_text));
        }

        let resp_json: Value = response.json().await.map_err(|e| format!("Failed to parse OpenAI response: {}", e))?;

        let analysis = resp_json["choices"]
            .as_array()
            .and_then(|arr| arr.first())
            .and_then(|obj| obj.get("message"))
            .and_then(|msg| msg.get("content"))
            .and_then(|v| v.as_str())
            .unwrap_or("Unable to analyze failure; please review error logs manually.")
            .to_string();

        Ok(analysis)
    }
}
