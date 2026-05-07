use clap::{Parser, Subcommand};
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use serde_json::Map;
use serde_json::Value;
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use std::time::Duration;
use uuid::Uuid;

#[derive(Serialize, Deserialize, Debug)]
struct Credentials {
    access_token: String,
    refresh_token: Option<String>,
    email: String,
}

#[derive(Serialize, Deserialize, Debug)]
struct AuthResponse {
    access_token: String,
    refresh_token: Option<String>,
}

fn get_config_dir() -> Result<PathBuf, String> {
    dirs::config_dir()
        .ok_or_else(|| "Could not determine config directory".to_string())
        .map(|d| d.join("pulsegrid"))
}

fn get_credentials_path() -> Result<PathBuf, String> {
    get_config_dir().map(|d| d.join("credentials.json"))
}

fn load_credentials() -> Result<Credentials, String> {
    let path = get_credentials_path()?;
    let content = fs::read_to_string(&path)
        .map_err(|_| "No stored credentials. Please run 'pulse auth login' first.".to_string())?;
    serde_json::from_str(&content).map_err(|e| format!("Failed to parse credentials: {}", e))
}

fn save_credentials(creds: &Credentials) -> Result<(), String> {
    let path = get_credentials_path()?;
    let config_dir = path.parent().unwrap();
    fs::create_dir_all(config_dir)
        .map_err(|e| format!("Failed to create config directory: {}", e))?;
    let json = serde_json::to_string_pretty(creds)
        .map_err(|e| format!("Failed to serialize credentials: {}", e))?;
    fs::write(&path, json).map_err(|e| format!("Failed to write credentials: {}", e))?;
    Ok(())
}

fn delete_credentials() -> Result<(), String> {
    let path = get_credentials_path()?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("Failed to delete credentials: {}", e))?;
    }
    Ok(())
}

fn get_access_token(provided_token: Option<String>) -> Result<String, String> {
    match provided_token {
        Some(token) if !token.is_empty() => Ok(token),
        _ => load_credentials().map(|c| c.access_token),
    }
}

fn colorize(text: &str, color: &str) -> String {
    match color {
        "green" => format!("\x1b[32m{}\x1b[0m", text),
        "blue" => format!("\x1b[34m{}\x1b[0m", text),
        "yellow" => format!("\x1b[33m{}\x1b[0m", text),
        "red" => format!("\x1b[31m{}\x1b[0m", text),
        "cyan" => format!("\x1b[36m{}\x1b[0m", text),
        _ => text.to_string(),
    }
}

fn print_success(msg: &str) {
    println!("{}", colorize(&format!("✓ {}", msg), "green"));
}

fn print_info(msg: &str) {
    println!("{}", colorize(&format!("ℹ {}", msg), "blue"));
}

fn print_error(msg: &str) {
    eprintln!("{}", colorize(&format!("✗ {}", msg), "red"));
}

fn print_header(title: &str) {
    println!("\n{}\n", colorize(&format!("╭─ {} ─╮", title), "cyan"));
}

#[derive(Parser, Debug)]
#[command(name = "pulse")]
#[command(about = "PulseGrid CLI - The OS for everything you automate")]
#[command(version)]
struct Cli {
    #[arg(
        long,
        env = "PULSE_API_BASE_URL",
        default_value = "http://127.0.0.1:3000"
    )]
    api_base_url: String,

    #[arg(long, env = "PULSE_ACCESS_TOKEN")]
    access_token: Option<String>,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand, Debug)]
enum Commands {
    #[command(about = "Authentication commands")]
    Auth {
        #[command(subcommand)]
        action: AuthCommands,
    },
    #[command(about = "Flow commands")]
    Flow {
        #[command(subcommand)]
        action: FlowCommands,
    },
    #[command(about = "Event commands")]
    Events {
        #[command(subcommand)]
        action: EventCommands,
    },
    #[command(about = "Connector commands")]
    Connector {
        #[command(subcommand)]
        action: ConnectorCommands,
    },
    #[command(about = "Run history commands")]
    Runs {
        #[command(subcommand)]
        action: RunCommands,
    },
}

#[derive(Subcommand, Debug)]
enum FlowCommands {
    #[command(about = "List flows for a workspace")]
    List {
        #[arg(long)]
        workspace_id: Uuid,
    },
    #[command(about = "Get a flow by id")]
    Get {
        #[arg(long)]
        flow_id: Uuid,
    },
    #[command(about = "Delete a flow by id")]
    Delete {
        #[arg(long)]
        flow_id: Uuid,
    },
    #[command(about = "Create a flow from a JSON file")]
    Create {
        #[arg(long)]
        workspace_id: Uuid,
        #[arg(long)]
        name: String,
        #[arg(long)]
        description: Option<String>,
        #[arg(long)]
        definition_file: String,
    },
    #[command(about = "Run a flow manually")]
    Run {
        #[arg(long)]
        id: Uuid,
    },
    #[command(about = "Export all flows as backup")]
    Export {
        #[arg(long)]
        format: String,
        #[arg(long)]
        output: String,
    },
    #[command(about = "Import flows from file")]
    Import {
        #[arg(long)]
        file: String,
    },
    #[command(about = "Deploy a flow to a workspace")]
    Deploy {
        #[arg(long)]
        workspace: String,
        #[arg(long)]
        file: String,
    },
}

#[derive(Subcommand, Debug)]
enum EventCommands {
    #[command(about = "Tail live events for a source")]
    Tail {
        #[arg(long)]
        source: Option<String>,
        #[arg(long)]
        r#type: Option<String>,
        #[arg(long)]
        workspace_id: Option<Uuid>,
        #[arg(long, default_value = "2")]
        interval_seconds: u64,
    },
}

#[derive(Subcommand, Debug)]
enum ConnectorCommands {
    #[command(about = "Test a connector")]
    Test {
        #[arg(name = "CONNECTOR")]
        connector: String,
        #[arg(long)]
        endpoint_url: Option<String>,
        #[arg(long, default_value = "GET")]
        method: String,
        #[arg(long = "header", value_name = "KEY=VALUE")]
        headers: Vec<String>,
        #[arg(long)]
        body: Option<String>,
        #[arg(long)]
        bearer_token: Option<String>,
        #[arg(long)]
        api_key_header: Option<String>,
        #[arg(long)]
        api_key_value: Option<String>,
        #[arg(long)]
        config_file: Option<String>,
    },
}

#[derive(Subcommand, Debug)]
enum RunCommands {
    #[command(about = "List flow runs")]
    List {
        #[arg(long)]
        flow: Uuid,
        #[arg(long, default_value = "20")]
        limit: usize,
        #[arg(long)]
        offset: Option<usize>,
        #[arg(long)]
        environment: Option<String>,
    },
}

#[derive(Subcommand, Debug)]
enum AuthCommands {
    #[command(about = "Login with email")]
    Login {
        #[arg(long, short)]
        email: String,
    },
    #[command(about = "Logout and clear stored credentials")]
    Logout,
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();
    let client = reqwest::Client::new();

    let result = match cli.command {
        Commands::Auth { action } => match action {
            AuthCommands::Login { email } => auth_login(&client, &cli.api_base_url, &email).await,
            AuthCommands::Logout => auth_logout(&client, &cli.api_base_url, cli.access_token).await,
        },
        Commands::Flow { action } => match action {
            FlowCommands::List { workspace_id } => match get_access_token(cli.access_token) {
                Ok(token) => {
                    let path = format!("/flows?workspaceId={workspace_id}");
                    send(
                        &client,
                        &cli.api_base_url,
                        &token,
                        reqwest::Method::GET,
                        &path,
                        None,
                    )
                    .await
                }
                Err(e) => {
                    print_error(&e);
                    Err(e)
                }
            },
            FlowCommands::Get { flow_id } => match get_access_token(cli.access_token) {
                Ok(token) => {
                    let path = format!("/flows/{flow_id}");
                    send(
                        &client,
                        &cli.api_base_url,
                        &token,
                        reqwest::Method::GET,
                        &path,
                        None,
                    )
                    .await
                }
                Err(e) => {
                    print_error(&e);
                    Err(e)
                }
            },
            FlowCommands::Delete { flow_id } => match get_access_token(cli.access_token) {
                Ok(token) => {
                    let path = format!("/flows/{flow_id}");
                    send(
                        &client,
                        &cli.api_base_url,
                        &token,
                        reqwest::Method::DELETE,
                        &path,
                        None,
                    )
                    .await
                }
                Err(e) => {
                    print_error(&e);
                    Err(e)
                }
            },
            FlowCommands::Create {
                workspace_id,
                name,
                description,
                definition_file,
            } => match get_access_token(cli.access_token) {
                Ok(token) => match std::fs::read_to_string(&definition_file) {
                    Ok(definition_raw) => match serde_json::from_str::<Value>(&definition_raw) {
                        Ok(definition) => {
                            let body = serde_json::json!({
                                "workspaceId": workspace_id,
                                "name": name,
                                "description": description,
                                "definition": definition,
                            });
                            send(
                                &client,
                                &cli.api_base_url,
                                &token,
                                reqwest::Method::POST,
                                "/flows",
                                Some(body),
                            )
                            .await
                        }
                        Err(e) => {
                            print_error(&format!("Invalid JSON in definition file: {}", e));
                            Err(e.to_string())
                        }
                    },
                    Err(e) => {
                        print_error(&format!("Failed to read definition file: {}", e));
                        Err(e.to_string())
                    }
                },
                Err(e) => {
                    print_error(&e);
                    Err(e)
                }
            },
            FlowCommands::Run { id } => match get_access_token(cli.access_token) {
                Ok(token) => {
                    let path = format!("/flows/{id}/run");
                    send(
                        &client,
                        &cli.api_base_url,
                        &token,
                        reqwest::Method::POST,
                        &path,
                        None,
                    )
                    .await
                }
                Err(e) => {
                    print_error(&e);
                    Err(e)
                }
            },
            FlowCommands::Export { format, output } => match get_access_token(cli.access_token) {
                Ok(token) => {
                    export_flows(&client, &cli.api_base_url, &token, &format, &output).await
                }
                Err(e) => {
                    print_error(&e);
                    Err(e)
                }
            },
            FlowCommands::Import { file } => match get_access_token(cli.access_token) {
                Ok(token) => import_flows(&client, &cli.api_base_url, &token, &file).await,
                Err(e) => {
                    print_error(&e);
                    Err(e)
                }
            },
            FlowCommands::Deploy { workspace, file } => match get_access_token(cli.access_token) {
                Ok(token) => {
                    deploy_flow(&client, &cli.api_base_url, &token, &workspace, &file).await
                }
                Err(e) => {
                    print_error(&e);
                    Err(e)
                }
            },
        },
        Commands::Events { action } => match action {
            EventCommands::Tail {
                source,
                r#type,
                workspace_id,
                interval_seconds,
            } => match get_access_token(cli.access_token) {
                Ok(token) => {
                    tail_events(
                        &client,
                        &cli.api_base_url,
                        &token,
                        source.as_deref(),
                        r#type.as_deref(),
                        workspace_id,
                        interval_seconds,
                    )
                    .await
                }
                Err(e) => {
                    print_error(&e);
                    Err(e)
                }
            },
        },
        Commands::Connector { action } => match action {
            ConnectorCommands::Test {
                connector,
                endpoint_url,
                method,
                headers,
                body,
                bearer_token,
                api_key_header,
                api_key_value,
                config_file,
            } => match get_access_token(cli.access_token) {
                Ok(token) => {
                    test_connector(
                        &client,
                        &cli.api_base_url,
                        &token,
                        &connector,
                        endpoint_url,
                        &method,
                        &headers,
                        body,
                        bearer_token,
                        api_key_header,
                        api_key_value,
                        config_file,
                    )
                    .await
                }
                Err(e) => {
                    print_error(&e);
                    Err(e)
                }
            },
        },
        Commands::Runs { action } => match action {
            RunCommands::List {
                flow,
                limit,
                offset,
                environment,
            } => match get_access_token(cli.access_token) {
                Ok(token) => {
                    let mut path = format!("/flows/{flow}/runs?limit={limit}");
                    if let Some(offset) = offset {
                        path.push_str(&format!("&offset={offset}"));
                    }
                    if let Some(environment) = environment {
                        path.push_str(&format!(
                            "&environment={}",
                            encode_query_component(&environment)
                        ));
                    }
                    send(
                        &client,
                        &cli.api_base_url,
                        &token,
                        reqwest::Method::GET,
                        &path,
                        None,
                    )
                    .await
                }
                Err(e) => {
                    print_error(&e);
                    Err(e)
                }
            },
        },
    };

    if let Err(err) = result {
        print_error(&err);
        std::process::exit(1);
    }
}

async fn auth_login(client: &reqwest::Client, base_url: &str, email: &str) -> Result<(), String> {
    print_header("Login");
    print_info(&format!("Email: {}", email));

    let password = rpassword::prompt_password(colorize("Password: ", "yellow").as_str())
        .map_err(|e| format!("Failed to read password: {}", e))?;

    if password.is_empty() {
        return Err("Password cannot be empty".to_string());
    }

    let url = format!("{}/auth/login", base_url.trim_end_matches('/'));
    let body = serde_json::json!({
        "email": email,
        "password": password,
    });

    let response = client
        .post(&url)
        .header(CONTENT_TYPE, "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    let status = response.status();
    let text = response.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        return Err(format!("Login failed: HTTP {}: {}", status.as_u16(), text));
    }

    let auth_response: AuthResponse =
        serde_json::from_str(&text).map_err(|e| format!("Invalid response: {}", e))?;

    let creds = Credentials {
        access_token: auth_response.access_token,
        refresh_token: auth_response.refresh_token,
        email: email.to_string(),
    };

    save_credentials(&creds)?;
    print_success("Logged in successfully!");
    print_info(&format!(
        "Credentials stored in {}",
        get_credentials_path()?.display()
    ));
    Ok(())
}

async fn auth_logout(
    client: &reqwest::Client,
    base_url: &str,
    access_token: Option<String>,
) -> Result<(), String> {
    print_header("Logout");

    let token = get_access_token(access_token)?;

    let url = format!("{}/auth/logout", base_url.trim_end_matches('/'));
    let response = client
        .post(&url)
        .header(AUTHORIZATION, format!("Bearer {token}"))
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    let status = response.status();

    if !status.is_success() {
        let text = response.text().await.map_err(|e| e.to_string())?;
        return Err(format!("Logout failed: HTTP {}: {}", status.as_u16(), text));
    }

    delete_credentials()?;
    print_success("Logged out successfully!");
    print_info("Credentials have been cleared");
    Ok(())
}

fn encode_query_component(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(byte as char)
            }
            b' ' => encoded.push_str("%20"),
            _ => encoded.push_str(&format!("%{:02X}", byte)),
        }
    }
    encoded
}

fn parse_header_value(entry: &str) -> Result<(String, String), String> {
    let (key, value) = entry
        .split_once('=')
        .ok_or_else(|| format!("Invalid header '{entry}'. Expected KEY=VALUE"))?;

    let key = key.trim();
    if key.is_empty() {
        return Err(format!(
            "Invalid header '{entry}'. Header name cannot be empty"
        ));
    }

    Ok((key.to_string(), value.trim().to_string()))
}

fn build_connector_config(
    endpoint_url: Option<String>,
    method: &str,
    headers: &[String],
    body: Option<String>,
    bearer_token: Option<String>,
    api_key_header: Option<String>,
    api_key_value: Option<String>,
    config_file: Option<String>,
) -> Result<Value, String> {
    if let Some(path) = config_file {
        let content = fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read config file {path}: {e}"))?;
        let parsed = serde_json::from_str::<Value>(&content)
            .map_err(|e| format!("Failed to parse JSON config file {path}: {e}"))?;
        return Ok(parsed);
    }

    let mut config = Map::new();

    if let Some(endpoint_url) = endpoint_url {
        config.insert("endpoint_url".to_string(), Value::String(endpoint_url));
    }

    config.insert("method".to_string(), Value::String(method.to_string()));

    if !headers.is_empty() {
        let mut header_map = Map::new();
        for entry in headers {
            let (key, value) = parse_header_value(entry)?;
            header_map.insert(key, Value::String(value));
        }
        config.insert("headers".to_string(), Value::Object(header_map));
    }

    if let Some(body) = body {
        let body_value = serde_json::from_str::<Value>(&body).unwrap_or(Value::String(body));
        config.insert("body".to_string(), body_value);
    }

    if let Some(bearer_token) = bearer_token {
        config.insert("bearer_token".to_string(), Value::String(bearer_token));
    }

    if let Some(api_key_header) = api_key_header {
        config.insert("api_key_header".to_string(), Value::String(api_key_header));
    }

    if let Some(api_key_value) = api_key_value {
        config.insert("api_key_value".to_string(), Value::String(api_key_value));
    }

    Ok(Value::Object(config))
}

async fn test_connector(
    client: &reqwest::Client,
    base_url: &str,
    access_token: &str,
    connector: &str,
    endpoint_url: Option<String>,
    method: &str,
    headers: &[String],
    body: Option<String>,
    bearer_token: Option<String>,
    api_key_header: Option<String>,
    api_key_value: Option<String>,
    config_file: Option<String>,
) -> Result<(), String> {
    print_header("Connector Test");
    print_info(&format!("Connector: {connector}"));

    if endpoint_url.is_none() && config_file.is_none() {
        print_info(
            "No endpoint URL provided; the connector service will validate the payload as-is.",
        );
    }

    let config = build_connector_config(
        endpoint_url,
        method,
        headers,
        body,
        bearer_token,
        api_key_header,
        api_key_value,
        config_file,
    )?;

    let path = format!("/connectors/{connector}/test");
    send(
        client,
        base_url,
        access_token,
        reqwest::Method::POST,
        &path,
        Some(config),
    )
    .await
}

async fn send(
    client: &reqwest::Client,
    base_url: &str,
    access_token: &str,
    method: reqwest::Method,
    path: &str,
    body: Option<Value>,
) -> Result<(), String> {
    let url = format!("{}{}", base_url.trim_end_matches('/'), path);
    let mut req = client
        .request(method, &url)
        .header(AUTHORIZATION, format!("Bearer {access_token}"));

    if let Some(json_body) = body {
        req = req
            .header(CONTENT_TYPE, "application/json")
            .json(&json_body);
    }

    let response = req.send().await.map_err(|e| e.to_string())?;
    let status = response.status();
    let text = response.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        return Err(format!("HTTP {}: {}", status.as_u16(), text));
    }

    if text.trim().is_empty() {
        print_success("OK");
        return Ok(());
    }

    match serde_json::from_str::<Value>(&text) {
        Ok(value) => println!("{}", serde_json::to_string_pretty(&value).unwrap_or(text)),
        Err(_) => println!("{text}"),
    }

    Ok(())
}

/// Export all flows from workspace as JSON backup
async fn export_flows(
    client: &reqwest::Client,
    base_url: &str,
    access_token: &str,
    format: &str,
    output: &str,
) -> Result<(), String> {
    print_info("Exporting flows...");

    if format != "json" {
        return Err("Only 'json' format is supported".to_string());
    }

    // Fetch all flows
    let url = format!("{}/flows", base_url.trim_end_matches('/'));
    let response = client
        .get(&url)
        .header(AUTHORIZATION, format!("Bearer {access_token}"))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let text = response.text().await.map_err(|e| e.to_string())?;
        return Err(format!("Failed to fetch flows: {}", text));
    }

    let flows: Value = response.json().await.map_err(|e| e.to_string())?;

    // Write to file
    let json_str = serde_json::to_string_pretty(&flows).map_err(|e| e.to_string())?;
    std::fs::write(output, json_str).map_err(|e| e.to_string())?;

    print_success(&format!("Exported flows to {}", output));
    Ok(())
}

/// Import flows from JSON file
async fn import_flows(
    client: &reqwest::Client,
    base_url: &str,
    access_token: &str,
    file: &str,
) -> Result<(), String> {
    print_info("Importing flows...");

    // Read file
    let content = std::fs::read_to_string(file).map_err(|e| e.to_string())?;
    let data: Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    // Expect array of flows
    let flows = data.as_array().ok_or("Expected JSON array of flows")?;

    let mut imported = 0;
    for flow in flows {
        let flow_obj = flow.as_object().ok_or("Each flow must be an object")?;

        // Create flow via API
        let url = format!("{}/flows", base_url.trim_end_matches('/'));
        let response = client
            .post(&url)
            .header(AUTHORIZATION, format!("Bearer {access_token}"))
            .header(CONTENT_TYPE, "application/json")
            .json(flow_obj)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if response.status().is_success() {
            imported += 1;
        } else {
            let text = response.text().await.map_err(|e| e.to_string())?;
            print_error(&format!("Failed to import flow: {}", text));
        }
    }

    print_success(&format!("Imported {} flows from {}", imported, file));
    Ok(())
}

/// Deploy a flow from file to a workspace
async fn deploy_flow(
    client: &reqwest::Client,
    base_url: &str,
    access_token: &str,
    workspace: &str,
    file: &str,
) -> Result<(), String> {
    print_info("Deploying flow...");

    // Read flow definition
    let content = std::fs::read_to_string(file).map_err(|e| e.to_string())?;
    let flow_def: Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    // Deploy flow (enable it)
    let flow_id = flow_def
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("Flow definition must have an 'id' field")?;

    let url = format!(
        "{}/flows/{}/deploy",
        base_url.trim_end_matches('/'),
        flow_id
    );
    let body = serde_json::json!({ "workspaceId": workspace });

    let response = client
        .post(&url)
        .header(AUTHORIZATION, format!("Bearer {access_token}"))
        .header(CONTENT_TYPE, "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = response.status();
    let text = response.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        return Err(format!("Deploy failed: HTTP {}: {}", status.as_u16(), text));
    }

    print_success(&format!(
        "Deployed flow {} to workspace {}",
        flow_id, workspace
    ));
    Ok(())
}

/// Tail live events from stream
async fn tail_events(
    client: &reqwest::Client,
    base_url: &str,
    access_token: &str,
    source: Option<&str>,
    event_type: Option<&str>,
    workspace_id: Option<Uuid>,
    interval_seconds: u64,
) -> Result<(), String> {
    print_header("Event Tail");
    print_info("Polling the event stream. Press Ctrl+C to stop.");

    let interval = Duration::from_secs(interval_seconds.max(1));
    let mut seen_events: HashSet<String> = HashSet::new();

    loop {
        let mut qp = Vec::new();
        if let Some(workspace_id) = workspace_id {
            qp.push(format!("workspaceId={workspace_id}"));
        }
        if let Some(source) = source {
            qp.push(format!("source={}", encode_query_component(source)));
        }
        if let Some(event_type) = event_type {
            qp.push(format!("type={}", encode_query_component(event_type)));
        }

        let query = if qp.is_empty() {
            String::new()
        } else {
            format!("?{}", qp.join("&"))
        };
        let url = format!("{}/events/stream{}", base_url.trim_end_matches('/'), query);

        let response = client
            .get(&url)
            .header(AUTHORIZATION, format!("Bearer {access_token}"))
            .send()
            .await
            .map_err(|e| format!("Network error while tailing events: {e}"))?;

        let status = response.status();
        let text = response.text().await.map_err(|e| e.to_string())?;

        if !status.is_success() {
            return Err(format!("HTTP {}: {}", status.as_u16(), text));
        }

        let mut new_events = 0usize;
        for line in text.lines() {
            let line = line.trim();
            if line.is_empty() || !line.starts_with("data:") {
                continue;
            }

            let payload = line.trim_start_matches("data:").trim();
            if payload.is_empty() {
                continue;
            }

            let event_key = match serde_json::from_str::<Value>(payload) {
                Ok(value) => {
                    let event_id = value
                        .get("id")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                        .unwrap_or_else(|| payload.to_string());

                    if !seen_events.insert(event_id.clone()) {
                        continue;
                    }

                    println!(
                        "{}",
                        serde_json::to_string_pretty(&value)
                            .unwrap_or_else(|_| payload.to_string())
                    );
                    event_id
                }
                Err(_) => {
                    let event_key = payload.to_string();
                    if !seen_events.insert(event_key.clone()) {
                        continue;
                    }

                    println!("{payload}");
                    event_key
                }
            };

            let _ = event_key;
            new_events += 1;
        }

        if new_events == 0 {
            print_info("Waiting for new events...");
        }

        tokio::time::sleep(interval).await;
    }
}
