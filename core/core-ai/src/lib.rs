/// PulseAI - Intelligence Layer (Phase 1 Skeleton)
///
/// This crate provides a skeleton structure for PulseGrid's AI capabilities,
/// including pattern detection, natural language flow generation, and run failure analysis.
/// Future phases will integrate ONNX Runtime (`tract`) and LLM API calls here.

pub mod pattern_detection {
    /// Background job skeleton for time-series pattern detection
    pub fn analyze_event_history(tenant_id: uuid::Uuid) -> Result<Vec<Pattern>, String> {
        // Stub: AI pattern analysis logic to be implemented
        println!("Analyzing events for tenant {}", tenant_id);
        Ok(vec![])
    }

    #[derive(Debug, Clone)]
    pub struct Pattern {
        pub description: String,
        pub confidence: f32,
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
