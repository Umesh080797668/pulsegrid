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
    }

    /// Analyzes event history for patterns.
    ///
    /// The analyzer first attempts ONNX inference (via `tract_onnx`) when a model
    /// is available, then falls back to deterministic statistical detectors.
    pub fn analyze_event_history(
        tenant_id: uuid::Uuid,
        events: Vec<EventEntry>,
    ) -> Result<Vec<Pattern>, String> {
        if events.is_empty() {
            return Ok(vec![]);
        }

        let mut patterns = Vec::new();

        // Pattern 0: ML model inference (optional)
        // If the ONNX model is unavailable or inference fails, continue with
        // statistical detectors so this remains fully functional.
        match detect_patterns_with_onnx(&events) {
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
    /// Expected model output shape: `[1, 3]` (or any flat tensor with at least 3 scores):
    /// - index 0: time-based confidence
    /// - index 1: correlation confidence
    /// - index 2: anomaly confidence
    ///
    /// Returns `Ok(None)` when the model file does not exist.
    fn detect_patterns_with_onnx(events: &[EventEntry]) -> Result<Option<Vec<Pattern>>, String> {
        use tract_onnx::prelude::*;

        let configured_path = std::env::var("PULSEAI_ONNX_MODEL").ok();
        let model_path = configured_path
            .map(PathBuf::from)
            .unwrap_or_else(|| {
                PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .join("models")
                    .join("pulseai_pattern.onnx")
            });

        if !model_path.exists() {
            return Ok(None);
        }

        // Build a compact feature tensor: [1, 64, 4]
        // features per timestep:
        // [event_hash, hour_norm, weekday_norm, has_action]
        let timesteps = 64usize;
        let feature_width = 4usize;
        let mut features = vec![0f32; timesteps * feature_width];

        let start = events.len().saturating_sub(timesteps);
        for (i, event) in events[start..].iter().enumerate() {
            let base = i * feature_width;
            let event_hash = event.event_type.bytes().fold(0u32, |acc, b| acc.wrapping_add(b as u32));
            features[base] = (event_hash % 997) as f32 / 997.0;
            features[base + 1] = event.timestamp.hour() as f32 / 23.0;
            features[base + 2] = event.timestamp.weekday().num_days_from_monday() as f32 / 6.0;
            features[base + 3] = if event.action.is_some() { 1.0 } else { 0.0 };
        }

        let model = tract_onnx::onnx()
            .model_for_path(&model_path)
            .map_err(|e| format!("Failed to load ONNX model at {}: {}", model_path.display(), e))?
            .with_input_fact(0, InferenceFact::dt_shape(f32::datum_type(), tvec!(1, timesteps as i64, feature_width as i64)))
            .map_err(|e| format!("Failed to set model input fact: {}", e))?
            .into_optimized()
            .map_err(|e| format!("Failed to optimize ONNX model: {}", e))?
            .into_runnable()
            .map_err(|e| format!("Failed to create ONNX runnable model: {}", e))?;

        let input = Tensor::from_shape(&[1usize, timesteps, feature_width], &features)
            .map_err(|e| format!("Failed to construct ONNX input tensor: {}", e))?;

        let outputs = model
            .run(tvec!(input.into()))
            .map_err(|e| format!("ONNX inference failed: {}", e))?;

        let output = outputs
            .first()
            .ok_or_else(|| "ONNX inference returned no outputs".to_string())?;
        let score_view = output
            .to_array_view::<f32>()
            .map_err(|e| format!("Failed to decode ONNX output tensor as f32: {}", e))?;

        let scores: Vec<f32> = score_view.iter().copied().collect();
        if scores.len() < 3 {
            return Err(format!(
                "ONNX output had {} scores; expected at least 3",
                scores.len()
            ));
        }

        let mut patterns = Vec::new();
        let threshold = 0.65f32;

        let time_score = scores[0].clamp(0.0, 1.0);
        if time_score >= threshold {
            patterns.push(Pattern {
                id: "ml_time_based".to_string(),
                pattern_type: PatternType::TimeBased,
                description: "ML model detected recurring time-based behavior".to_string(),
                confidence: time_score,
                frequency: "model_inference".to_string(),
                events_involved: events.iter().take(5).map(|e| e.event_type.clone()).collect(),
                suggested_trigger: Some("Use schedule trigger around peak period".to_string()),
                suggested_actions: vec![],
            });
        }

        let correlation_score = scores[1].clamp(0.0, 1.0);
        if correlation_score >= threshold {
            patterns.push(Pattern {
                id: "ml_correlation".to_string(),
                pattern_type: PatternType::EventCorrelation,
                description: "ML model detected likely event correlation sequence".to_string(),
                confidence: correlation_score,
                frequency: "model_inference".to_string(),
                events_involved: events.iter().take(6).map(|e| e.event_type.clone()).collect(),
                suggested_trigger: Some("Trigger follow-up action on precursor event".to_string()),
                suggested_actions: vec!["auto_chain_next_step".to_string()],
            });
        }

        let anomaly_score = scores[2].clamp(0.0, 1.0);
        if anomaly_score >= threshold {
            patterns.push(Pattern {
                id: "ml_anomaly".to_string(),
                pattern_type: PatternType::Anomaly,
                description: "ML model detected anomalous behavior in event sequence".to_string(),
                confidence: anomaly_score,
                frequency: "model_inference".to_string(),
                events_involved: events.iter().take(8).map(|e| e.event_type.clone()).collect(),
                suggested_trigger: None,
                suggested_actions: vec!["investigate".to_string(), "increase_monitoring".to_string()],
            });
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
