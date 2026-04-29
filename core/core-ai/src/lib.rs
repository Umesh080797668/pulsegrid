/// PulseAI - Intelligence Layer
///
/// This crate provides AI capabilities including pattern detection, natural language flow generation,
/// and failure analysis. Pattern detection uses statistical analysis of event history to identify:
/// - Repeated manual actions and sequences
/// - Correlated events with temporal relationships
/// - Anomalous events (spikes, outliers)

use chrono::{DateTime, Utc, Datelike, Timelike};
use std::collections::HashMap;

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

    /// Analyzes event history for patterns (placeholder for tract ONNX integration)
    ///
    /// STUB: This implementation uses statistical analysis only.
    /// Phase 3 will integrate tract ONNX for ML-based time-series detection.
    ///
    /// TODO Phase 3:
    /// - Replace statistical functions with ONNX model inference
    /// - Add tract crate dependency: `tract = "0.21"`
    /// - Load ONNX model from bytes/file
    /// - Implement recurrent neural network for sequence detection
    /// - Add confidence scoring based on model output probabilities
    /// - Support multiple model architectures (LSTM, GRU, Transformer)
    ///
    /// Current limitations:
    /// - Only groups events by time-of-day (hour)
    /// - Anomalies detected via standard deviation only
    /// - No temporal dependencies between event sequences
    /// - No learned patterns from historical data
    pub fn analyze_event_history(
        tenant_id: uuid::Uuid,
        events: Vec<EventEntry>,
    ) -> Result<Vec<Pattern>, String> {
        if events.is_empty() {
            return Ok(vec![]);
        }

        let mut patterns = Vec::new();

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

    /// Generates Flow DSL from natural language prompt
    pub async fn generate_flow_from_prompt(prompt: &str) -> Result<Value, String> {
        let api_key = std::env::var("GEMINI_API_KEY").map_err(|_| "GEMINI_API_KEY not set".to_string())?;
        let client = reqwest::Client::new();
        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={}",
            api_key
        );

        let system_instruction = "You are a PulseGrid AI assistant. Convert the user's prompt into a valid JSON Flow DSL. Respond ONLY with valid JSON.";
        
        let request_body = json!({
            "contents": [{
                "parts": [{"text": format!("{}\n\nPrompt: {}", system_instruction, prompt)}]
            }]
        });

        let response = client.post(&url).json(&request_body).send().await.map_err(|e| format!("Network error: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("API request failed: HTTP {}", response.status()));
        }

        let resp_json: Value = response.json().await.map_err(|e| e.to_string())?;
        
        let generated_text = resp_json["candidates"][0]["content"]["parts"][0]["text"]
            .as_str()
            .unwrap_or("{}")
            .trim_matches(|c| c == '`' || c == '\n' || c == ' ')
            .trim_start_matches("json");

        let flow: Value = serde_json::from_str(generated_text)
            .map_err(|e| format!("Failed to parse AI response as JSON: {}", e))?;

        Ok(flow)
    }
}

pub mod failure_analysis {
    use serde_json::{json, Value};

    /// Suggests plain-English fixes for failed flow runs
    pub async fn analyze_failure(error_log: &str) -> Result<String, String> {
        let api_key = std::env::var("GEMINI_API_KEY").map_err(|_| "GEMINI_API_KEY not set".to_string())?;
        let client = reqwest::Client::new();
        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={}",
            api_key
        );

        let request_body = json!({
            "contents": [{
                "parts": [{"text": format!("Analyze this error log from a PulseGrid workflow failure and suggest a plain-english solution for the user: \n{}", error_log)}]
            }]
        });

        let response = client.post(&url).json(&request_body).send().await.map_err(|e| e.to_string())?;
        let resp_json: Value = response.json().await.map_err(|e| e.to_string())?;
        
        let analysis = resp_json["candidates"][0]["content"]["parts"][0]["text"]
            .as_str()
            .unwrap_or("Check your API permissions and connection mapping.")
            .to_string();

        Ok(analysis)
    }
}
