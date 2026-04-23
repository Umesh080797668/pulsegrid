use reqwest::Client;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HttpConfig {
    pub url: String,
    pub method: String, // "GET", "POST", etc.
    pub json_body: Option<serde_json::Value>,
    pub headers: Option<std::collections::HashMap<String, String>>,
}

#[derive(Debug)]
pub enum ConnectorError {
    HttpError(String),
}

pub struct Connectors {
    http_client: Client,
}

impl Connectors {
    pub fn new() -> Self {
        Self {
            http_client: Client::new(),
        }
    }

    pub async fn execute_http(&self, config: &HttpConfig) -> Result<serde_json::Value, ConnectorError> {
        let method = match config.method.to_uppercase().as_str() {
            "GET" => reqwest::Method::GET,
            "POST" => reqwest::Method::POST,
            "PUT" => reqwest::Method::PUT,
            "DELETE" => reqwest::Method::DELETE,
            _ => reqwest::Method::GET,
        };

        let mut req = self.http_client.request(method, &config.url);

        if let Some(headers) = &config.headers {
            for (k, v) in headers {
                req = req.header(k, v);
            }
        }

        if let Some(body) = &config.json_body {
            req = req.json(body);
        }

        let resp = req.send().await.map_err(|e| ConnectorError::HttpError(e.to_string()))?;
        
        let json_resp = resp.json::<serde_json::Value>().await
            .map_err(|e| ConnectorError::HttpError(e.to_string()))?;

        Ok(json_resp)
    }

    pub async fn execute_slack(&self, webhook_url: &str, text: &str) -> Result<(), ConnectorError> {
        let body = serde_json::json!({
            "text": text
        });

        let resp = self.http_client.post(webhook_url)
            .json(&body)
            .send()
            .await
            .map_err(|e| ConnectorError::HttpError(e.to_string()))?;

        if !resp.status().is_success() {
            return Err(ConnectorError::HttpError("Slack webhook failed".into()));
        }

        Ok(())
    }
}
