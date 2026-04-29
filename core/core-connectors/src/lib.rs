use base64::Engine;
use chrono::{DateTime, Utc};
use hmac::{Hmac, Mac};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use std::str::FromStr;
use std::time::Duration;
use async_trait::async_trait;

type HmacSha256 = Hmac<Sha256>;

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
    InvalidConfig(String),
    ParseError(String),
    SignatureError(String),
}

impl std::fmt::Display for ConnectorError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ConnectorError::HttpError(msg) => write!(f, "http error: {msg}"),
            ConnectorError::InvalidConfig(msg) => write!(f, "invalid config: {msg}"),
            ConnectorError::ParseError(msg) => write!(f, "parse error: {msg}"),
            ConnectorError::SignatureError(msg) => write!(f, "signature error: {msg}"),
        }
    }
}

impl std::error::Error for ConnectorError {}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GmailSendConfig {
    pub access_token: String,
    pub from: String,
    pub to: String,
    pub subject: String,
    pub body: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GithubIssueConfig {
    pub access_token: String,
    pub owner: String,
    pub repo: String,
    pub title: String,
    pub body: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TelegramConfig {
    pub bot_token: String,
    pub chat_id: String,
    pub text: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WebhookVerifyConfig {
    pub secret: String,
    pub raw_payload: String,
    pub provided_signature: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GoogleSheetsAppendConfig {
    pub access_token: String,
    pub spreadsheet_id: String,
    pub range: String,
    pub values: Vec<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NotionCreatePageConfig {
    pub access_token: String,
    pub database_id: String,
    pub properties: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DiscordConfig {
    pub webhook_url: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CustomConnectorConfig {
    pub endpoint_url: String,
    pub method: String,
    pub body: Option<serde_json::Value>,
    pub headers: Option<std::collections::HashMap<String, String>>,
    pub bearer_token: Option<String>,
    pub api_key_header: Option<String>,
    pub api_key_value: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Credentials {
    pub connector_id: String,
    pub encrypted_blob: Vec<u8>,
    pub nonce: Vec<u8>,
    pub expires_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TriggerDefinition {
    pub trigger_id: String,
    pub name: String,
    pub description: Option<String>,
    pub payload_schema: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ActionDefinition {
    pub action_id: String,
    pub name: String,
    pub description: Option<String>,
    pub input_schema: Option<serde_json::Value>,
    pub output_schema: Option<serde_json::Value>,
}

/// Trait that all connectors must implement to integrate with PulseGrid
#[async_trait::async_trait]
pub trait Connector: Send + Sync {
    /// Validate that credentials are valid and have access to the service
    async fn validate_credentials(&self, creds: &Credentials) -> Result<(), ConnectorError>;

    /// Return list of supported trigger definitions for this connector
    fn supported_triggers(&self) -> Vec<TriggerDefinition>;

    /// Return list of supported action definitions for this connector
    fn supported_actions(&self) -> Vec<ActionDefinition>;

    /// Execute an action with the given credentials and parameters
    async fn execute_action(
        &self,
        credentials: &Credentials,
        action_id: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value, ConnectorError>;
}

pub struct Connectors {
    http_client: Client,
}

fn is_private_ipv4(ip: Ipv4Addr) -> bool {
    ip.is_private()
        || ip.is_loopback()
        || ip.is_link_local()
        || ip.is_broadcast()
        || ip.is_documentation()
        || ip.octets()[0] == 0
        || (ip.octets()[0] == 100 && (64..=127).contains(&ip.octets()[1]))
}

fn is_private_ipv6(ip: Ipv6Addr) -> bool {
    ip.is_loopback() || ip.is_unspecified() || ip.is_unique_local() || ip.is_unicast_link_local()
}

fn validate_outbound_url(url: &str) -> Result<(), ConnectorError> {
    let parsed = reqwest::Url::parse(url)
        .map_err(|e| ConnectorError::InvalidConfig(format!("invalid outbound url: {e}")))?;

    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(ConnectorError::InvalidConfig(
            "only http/https outbound URLs are allowed".into(),
        ));
    }

    let host = parsed
        .host_str()
        .ok_or_else(|| ConnectorError::InvalidConfig("missing outbound URL host".into()))?
        .to_lowercase();

    if host == "localhost" || host.ends_with(".local") || host.ends_with(".internal") {
        return Err(ConnectorError::InvalidConfig(
            "outbound URL host is blocked".into(),
        ));
    }

    if let Ok(ip) = host.parse::<IpAddr>() {
        let blocked = match ip {
            IpAddr::V4(v4) => is_private_ipv4(v4),
            IpAddr::V6(v6) => is_private_ipv6(v6),
        };
        if blocked {
            return Err(ConnectorError::InvalidConfig(
                "private or local outbound IPs are blocked".into(),
            ));
        }
    }

    if let Ok(raw_allowlist) = std::env::var("CONNECTOR_HTTP_ALLOWLIST") {
        let allowlist: Vec<String> = raw_allowlist
            .split(',')
            .map(|item| item.trim().to_lowercase())
            .filter(|item| !item.is_empty())
            .collect();

        if !allowlist.is_empty() {
            let allowed = allowlist
                .iter()
                .any(|entry| host == *entry || host.ends_with(&format!(".{entry}")));
            if !allowed {
                return Err(ConnectorError::InvalidConfig(format!(
                    "host '{host}' is not in CONNECTOR_HTTP_ALLOWLIST"
                )));
            }
        }
    }

    Ok(())
}

impl Connectors {
    pub fn new() -> Self {
        let timeout_secs = std::env::var("CONNECTOR_HTTP_TIMEOUT_SECONDS")
            .ok()
            .and_then(|value| value.parse::<u64>().ok())
            .filter(|value| *value > 0)
            .unwrap_or(20);

        let client = Client::builder()
            .timeout(Duration::from_secs(timeout_secs))
            .connect_timeout(Duration::from_secs(timeout_secs.min(10)))
            .redirect(reqwest::redirect::Policy::limited(5))
            .build()
            .unwrap_or_else(|_| Client::new());

        Self {
            http_client: client,
        }
    }

    pub async fn execute_http(
        &self,
        config: &HttpConfig,
    ) -> Result<serde_json::Value, ConnectorError> {
        validate_outbound_url(&config.url)?;

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

        let resp = req
            .send()
            .await
            .map_err(|e| ConnectorError::HttpError(e.to_string()))?;

        let json_resp = resp
            .json::<serde_json::Value>()
            .await
            .map_err(|e| ConnectorError::HttpError(e.to_string()))?;

        Ok(json_resp)
    }

    pub async fn execute_gmail_send(
        &self,
        config: &GmailSendConfig,
    ) -> Result<serde_json::Value, ConnectorError> {
        if config.access_token.is_empty() {
            return Err(ConnectorError::InvalidConfig(
                "gmail access token is required".into(),
            ));
        }

        // RFC 2822 email payload for Gmail API
        let raw_email = format!(
            "From: {}\r\nTo: {}\r\nSubject: {}\r\nContent-Type: text/plain; charset=\"UTF-8\"\r\n\r\n{}",
            config.from, config.to, config.subject, config.body
        );
        let encoded = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(raw_email.as_bytes());

        let body = serde_json::json!({ "raw": encoded });
        let resp = self
            .http_client
            .post("https://gmail.googleapis.com/gmail/v1/users/me/messages/send")
            .bearer_auth(&config.access_token)
            .json(&body)
            .send()
            .await
            .map_err(|e| ConnectorError::HttpError(e.to_string()))?;

        if !resp.status().is_success() {
            return Err(ConnectorError::HttpError(format!(
                "gmail send failed with status {}",
                resp.status()
            )));
        }

        resp.json::<serde_json::Value>()
            .await
            .map_err(|e| ConnectorError::HttpError(e.to_string()))
    }

    pub async fn execute_github_issue_create(
        &self,
        config: &GithubIssueConfig,
    ) -> Result<serde_json::Value, ConnectorError> {
        if config.access_token.is_empty() {
            return Err(ConnectorError::InvalidConfig(
                "github access token is required".into(),
            ));
        }

        let url = format!(
            "https://api.github.com/repos/{}/{}/issues",
            config.owner, config.repo
        );

        let mut body = serde_json::json!({ "title": config.title });
        if let Some(issue_body) = &config.body {
            body["body"] = serde_json::Value::String(issue_body.clone());
        }

        let resp = self
            .http_client
            .post(url)
            .header("User-Agent", "PulseGrid-Core")
            .header("Accept", "application/vnd.github+json")
            .bearer_auth(&config.access_token)
            .json(&body)
            .send()
            .await
            .map_err(|e| ConnectorError::HttpError(e.to_string()))?;

        if !resp.status().is_success() {
            return Err(ConnectorError::HttpError(format!(
                "github issue creation failed with status {}",
                resp.status()
            )));
        }

        resp.json::<serde_json::Value>()
            .await
            .map_err(|e| ConnectorError::HttpError(e.to_string()))
    }

    pub async fn execute_telegram_send(
        &self,
        config: &TelegramConfig,
    ) -> Result<serde_json::Value, ConnectorError> {
        if config.bot_token.is_empty() {
            return Err(ConnectorError::InvalidConfig(
                "telegram bot token is required".into(),
            ));
        }

        let url = format!(
            "https://api.telegram.org/bot{}/sendMessage",
            config.bot_token
        );
        let body = serde_json::json!({
            "chat_id": config.chat_id,
            "text": config.text
        });

        let resp = self
            .http_client
            .post(url)
            .json(&body)
            .send()
            .await
            .map_err(|e| ConnectorError::HttpError(e.to_string()))?;

        if !resp.status().is_success() {
            return Err(ConnectorError::HttpError(format!(
                "telegram send failed with status {}",
                resp.status()
            )));
        }

        resp.json::<serde_json::Value>()
            .await
            .map_err(|e| ConnectorError::HttpError(e.to_string()))
    }

    pub async fn execute_google_sheets_append(
        &self,
        config: &GoogleSheetsAppendConfig,
    ) -> Result<serde_json::Value, ConnectorError> {
        if config.access_token.is_empty() {
            return Err(ConnectorError::InvalidConfig(
                "google sheets access token is required".into(),
            ));
        }

        let url = format!(
            "https://sheets.googleapis.com/v4/spreadsheets/{}/values/{}:append?valueInputOption=RAW",
            config.spreadsheet_id,
            urlencoding::encode(&config.range)
        );

        let body = serde_json::json!({
            "range": config.range,
            "majorDimension": "ROWS",
            "values": config.values
        });

        let resp = self
            .http_client
            .post(url)
            .bearer_auth(&config.access_token)
            .json(&body)
            .send()
            .await
            .map_err(|e| ConnectorError::HttpError(e.to_string()))?;

        if !resp.status().is_success() {
            return Err(ConnectorError::HttpError(format!(
                "google sheets append failed with status {}",
                resp.status()
            )));
        }

        resp.json::<serde_json::Value>()
            .await
            .map_err(|e| ConnectorError::HttpError(e.to_string()))
    }

    pub async fn execute_notion_create_page(
        &self,
        config: &NotionCreatePageConfig,
    ) -> Result<serde_json::Value, ConnectorError> {
        if config.access_token.is_empty() {
            return Err(ConnectorError::InvalidConfig(
                "notion access token is required".into(),
            ));
        }

        let body = serde_json::json!({
            "parent": { "database_id": config.database_id },
            "properties": config.properties
        });

        let resp = self
            .http_client
            .post("https://api.notion.com/v1/pages")
            .bearer_auth(&config.access_token)
            .header("Notion-Version", "2022-06-28")
            .json(&body)
            .send()
            .await
            .map_err(|e| ConnectorError::HttpError(e.to_string()))?;

        if !resp.status().is_success() {
            return Err(ConnectorError::HttpError(format!(
                "notion create page failed with status {}",
                resp.status()
            )));
        }

        resp.json::<serde_json::Value>()
            .await
            .map_err(|e| ConnectorError::HttpError(e.to_string()))
    }

    pub async fn execute_discord_send(
        &self,
        config: &DiscordConfig,
    ) -> Result<serde_json::Value, ConnectorError> {
        validate_outbound_url(&config.webhook_url)?;

        let body = serde_json::json!({ "content": config.content });
        let resp = self
            .http_client
            .post(&config.webhook_url)
            .json(&body)
            .send()
            .await
            .map_err(|e| ConnectorError::HttpError(e.to_string()))?;

        if !resp.status().is_success() {
            return Err(ConnectorError::HttpError(format!(
                "discord send failed with status {}",
                resp.status()
            )));
        }

        // Discord webhook often returns 204 no-content
        if resp.status() == reqwest::StatusCode::NO_CONTENT {
            return Ok(serde_json::json!({"success": true}));
        }

        resp.json::<serde_json::Value>()
            .await
            .map_err(|e| ConnectorError::HttpError(e.to_string()))
    }

    pub async fn execute_custom_connector(
        &self,
        config: &CustomConnectorConfig,
    ) -> Result<serde_json::Value, ConnectorError> {
        if config.endpoint_url.is_empty() {
            return Err(ConnectorError::InvalidConfig(
                "custom connector endpoint_url is required".into(),
            ));
        }

        validate_outbound_url(&config.endpoint_url)?;

        let method = match config.method.to_uppercase().as_str() {
            "GET" => reqwest::Method::GET,
            "POST" => reqwest::Method::POST,
            "PUT" => reqwest::Method::PUT,
            "PATCH" => reqwest::Method::PATCH,
            "DELETE" => reqwest::Method::DELETE,
            _ => reqwest::Method::POST,
        };

        let mut req = self.http_client.request(method, &config.endpoint_url);

        if let Some(token) = &config.bearer_token {
            req = req.bearer_auth(token);
        }

        if let (Some(key_header), Some(key_value)) = (&config.api_key_header, &config.api_key_value)
        {
            req = req.header(key_header, key_value);
        }

        if let Some(headers) = &config.headers {
            for (k, v) in headers {
                req = req.header(k, v);
            }
        }

        if let Some(body) = &config.body {
            req = req.json(body);
        }

        let resp = req
            .send()
            .await
            .map_err(|e| ConnectorError::HttpError(e.to_string()))?;

        if !resp.status().is_success() {
            return Err(ConnectorError::HttpError(format!(
                "custom connector call failed with status {}",
                resp.status()
            )));
        }

        if resp.status() == reqwest::StatusCode::NO_CONTENT {
            return Ok(serde_json::json!({"success": true}));
        }

        resp.json::<serde_json::Value>()
            .await
            .map_err(|e| ConnectorError::HttpError(e.to_string()))
    }

    pub fn verify_webhook_signature(
        &self,
        config: &WebhookVerifyConfig,
    ) -> Result<bool, ConnectorError> {
        let mut mac = HmacSha256::new_from_slice(config.secret.as_bytes())
            .map_err(|e| ConnectorError::SignatureError(e.to_string()))?;
        mac.update(config.raw_payload.as_bytes());

        let provided = config
            .provided_signature
            .trim()
            .strip_prefix("sha256=")
            .unwrap_or(config.provided_signature.trim());

        let provided_bytes =
            hex::decode(provided).map_err(|e| ConnectorError::SignatureError(e.to_string()))?;

        Ok(mac.verify_slice(&provided_bytes).is_ok())
    }

    pub fn schedule_next_run(
        &self,
        cron_expression: &str,
        from: DateTime<Utc>,
    ) -> Result<DateTime<Utc>, ConnectorError> {
        let schedule = cron::Schedule::from_str(cron_expression)
            .map_err(|e| ConnectorError::ParseError(e.to_string()))?;

        schedule
            .after(&from)
            .next()
            .ok_or_else(|| ConnectorError::ParseError("no next occurrence for schedule".into()))
    }

    pub async fn execute_slack(&self, webhook_url: &str, text: &str) -> Result<(), ConnectorError> {
        validate_outbound_url(webhook_url)?;

        let body = serde_json::json!({
            "text": text
        });

        let resp = self
            .http_client
            .post(webhook_url)
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

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;

    #[test]
    fn verifies_webhook_signature() {
        let connectors = Connectors::new();
        let secret = "my-secret";
        let payload = "{\"ok\":true}";

        let mut mac = HmacSha256::new_from_slice(secret.as_bytes()).unwrap();
        mac.update(payload.as_bytes());
        let expected = mac.finalize().into_bytes();
        let signature = format!("sha256={}", hex::encode(expected));

        let valid = connectors
            .verify_webhook_signature(&WebhookVerifyConfig {
                secret: secret.to_string(),
                raw_payload: payload.to_string(),
                provided_signature: signature,
            })
            .unwrap();

        assert!(valid);
    }

    #[test]
    fn computes_next_schedule() {
        let connectors = Connectors::new();
        let from = DateTime::from_str("2026-01-01T00:00:00Z").unwrap();
        let next = connectors
            .schedule_next_run("0/5 * * * * * *", from)
            .unwrap();
        assert!(next > from);
    }

    #[test]
    fn builds_gmail_raw_message_base64url() {
        let raw = "From: a@b.com\r\nTo: c@d.com\r\nSubject: Hi\r\n\r\nBody";
        let encoded = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(raw.as_bytes());
        assert!(!encoded.contains('+'));
        assert!(!encoded.contains('/'));
        assert!(!encoded.contains('='));
    }

    #[tokio::test]
    async fn custom_connector_requires_endpoint() {
        let connectors = Connectors::new();
        let result = connectors
            .execute_custom_connector(&CustomConnectorConfig {
                endpoint_url: String::new(),
                method: "POST".to_string(),
                body: None,
                headers: None,
                bearer_token: None,
                api_key_header: None,
                api_key_value: None,
            })
            .await;

        assert!(matches!(result, Err(ConnectorError::InvalidConfig(_))));
    }

    #[test]
    fn blocks_local_outbound_url() {
        let result = validate_outbound_url("http://127.0.0.1:8080/test");
        assert!(matches!(result, Err(ConnectorError::InvalidConfig(_))));
    }

    #[test]
    fn allows_public_outbound_url() {
        let result = validate_outbound_url("https://api.example.com/v1/resource");
        assert!(result.is_ok());
    }
}
