use clap::{Parser, Subcommand};
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
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
    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse credentials: {}", e))
}

fn save_credentials(creds: &Credentials) -> Result<(), String> {
    let path = get_credentials_path()?;
    let config_dir = path.parent().unwrap();
    fs::create_dir_all(config_dir)
        .map_err(|e| format!("Failed to create config directory: {}", e))?;
    let json = serde_json::to_string_pretty(creds)
        .map_err(|e| format!("Failed to serialize credentials: {}", e))?;
    fs::write(&path, json)
        .map_err(|e| format!("Failed to write credentials: {}", e))?;
    Ok(())
}

fn delete_credentials() -> Result<(), String> {
    let path = get_credentials_path()?;
    if path.exists() {
        fs::remove_file(&path)
            .map_err(|e| format!("Failed to delete credentials: {}", e))?;
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
    FlowRun {
        #[arg(long)]
        id: Uuid,
    },
    #[command(about = "List flow runs")]
    RunsList {
        #[arg(long)]
        flow: Uuid,
        #[arg(long, default_value = "20")]
        limit: usize,
    },
    #[command(about = "Tail live events for a source")]
    EventsTail {
        #[arg(long)]
        source: String,
        #[arg(long)]
        r#type: String,
    },
    #[command(about = "Export all flows as backup")]
    FlowExport {
        #[arg(long)]
        format: String,
        #[arg(long)]
        output: String,
    },
    #[command(about = "Import flows from file")]
    FlowImport {
        #[arg(long)]
        file: String,
    },
    #[command(about = "Deploy a flow to a workspace")]
    FlowDeploy {
        #[arg(long)]
        workspace: String,
        #[arg(long)]
        file: String,
    },
    #[command(about = "Test a connector")]
    ConnectorTest {
        #[arg(name = "CONNECTOR")]
        connector: String,
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
            AuthCommands::Login { email } => {
                auth_login(&client, &cli.api_base_url, &email).await
            }
            AuthCommands::Logout => {
                auth_logout(&client, &cli.api_base_url, cli.access_token).await
            }
        },
        Commands::List { workspace_id } => {
            match get_access_token(cli.access_token) {
                Ok(token) => {
                    let path = format!("/flows?workspaceId={workspace_id}");
                    send(&client, &cli.api_base_url, &token, reqwest::Method::GET, &path, None).await
                }
                Err(e) => {
                    print_error(&e);
                    Err(e)
                }
            }
        }
        Commands::Get { flow_id } => {
            match get_access_token(cli.access_token) {
                Ok(token) => {
                    let path = format!("/flows/{flow_id}");
                    send(&client, &cli.api_base_url, &token, reqwest::Method::GET, &path, None).await
                }
                Err(e) => {
                    print_error(&e);
                    Err(e)
                }
            }
        }
        Commands::Delete { flow_id } => {
            match get_access_token(cli.access_token) {
                Ok(token) => {
                    let path = format!("/flows/{flow_id}");
                    send(&client, &cli.api_base_url, &token, reqwest::Method::DELETE, &path, None).await
                }
                Err(e) => {
                    print_error(&e);
                    Err(e)
                }
            }
        }
        Commands::Create {
            workspace_id,
            name,
            description,
            definition_file,
        } => {
            match get_access_token(cli.access_token) {
                Ok(token) => {
                    match std::fs::read_to_string(&definition_file) {
                        Ok(definition_raw) => {
                            match serde_json::from_str::<Value>(&definition_raw) {
                                Ok(definition) => {
                                    let body = serde_json::json!({
                                        "workspaceId": workspace_id,
                                        "name": name,
                                        "description": description,
                                        "definition": definition,
                                    });
                                    send(&client, &cli.api_base_url, &token, reqwest::Method::POST, "/flows", Some(body)).await
                                }
                                Err(e) => {
                                    print_error(&format!("Invalid JSON in definition file: {}", e));
                                    Err(e.to_string())
                                }
                            }
                        }
                        Err(e) => {
                            print_error(&format!("Failed to read definition file: {}", e));
                            Err(e.to_string())
                        }
                    }
                }
                Err(e) => {
                    print_error(&e);
                    Err(e)
                }
            }
        }
        Commands::FlowRun { id } => {
            match get_access_token(cli.access_token) {
                Ok(token) => {
                    let path = format!("/flows/{id}/run");
                    send(&client, &cli.api_base_url, &token, reqwest::Method::POST, &path, None).await
                }
                Err(e) => {
                    print_error(&e);
                    Err(e)
                }
            }
        }
        Commands::RunsList { flow, limit } => {
            match get_access_token(cli.access_token) {
                Ok(token) => {
                    let path = format!("/flows/{flow}/runs?limit={limit}");
                    send(&client, &cli.api_base_url, &token, reqwest::Method::GET, &path, None).await
                }
                Err(e) => {
                    print_error(&e);
                    Err(e)
                }
            }
        }
        Commands::EventsTail { source, r#type } => {
            match get_access_token(cli.access_token) {
                Ok(token) => {
                    let path = format!("/events/stream?source={source}&type={type}");
                    tail_events(&client, &cli.api_base_url, &token, &path).await
                }
                Err(e) => {
                    print_error(&e);
                    Err(e)
                }
            }
        }
        Commands::FlowExport { format, output } => {
            match get_access_token(cli.access_token) {
                Ok(token) => {
                    export_flows(&client, &cli.api_base_url, &token, &format, &output).await
                }
                Err(e) => {
                    print_error(&e);
                    Err(e)
                }
            }
        }
        Commands::FlowImport { file } => {
            match get_access_token(cli.access_token) {
                Ok(token) => {
                    import_flows(&client, &cli.api_base_url, &token, &file).await
                }
                Err(e) => {
                    print_error(&e);
                    Err(e)
                }
            }
        }
        Commands::FlowDeploy { workspace, file } => {
            match get_access_token(cli.access_token) {
                Ok(token) => {
                    deploy_flow(&client, &cli.api_base_url, &token, &workspace, &file).await
                }
                Err(e) => {
                    print_error(&e);
                    Err(e)
                }
            }
        }
        Commands::ConnectorTest { connector } => {
            match get_access_token(cli.access_token) {
                Ok(token) => {
                    let path = format!("/connectors/{connector}/test");
                    send(&client, &cli.api_base_url, &token, reqwest::Method::POST, &path, None).await
                }
                Err(e) => {
                    print_error(&e);
                    Err(e)
                }
            }
        }
    };

    if let Err(err) = result {
        print_error(&err);
        std::process::exit(1);
    }
}

async fn auth_login(
    client: &reqwest::Client,
    base_url: &str,
    email: &str,
) -> Result<(), String> {
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

    let auth_response: AuthResponse = serde_json::from_str(&text)
        .map_err(|e| format!("Invalid response: {}", e))?;

    let creds = Credentials {
        access_token: auth_response.access_token,
        refresh_token: auth_response.refresh_token,
        email: email.to_string(),
    };

    save_credentials(&creds)?;
    print_success("Logged in successfully!");
    print_info(&format!("Credentials stored in {}", get_credentials_path()?.display()));
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

    let url = format!("{}/flows/{}/deploy", base_url.trim_end_matches('/'), flow_id);
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

    print_success(&format!("Deployed flow {} to workspace {}", flow_id, workspace));
    Ok(())
}

/// Tail live events from stream
async fn tail_events(
    client: &reqwest::Client,
    base_url: &str,
    access_token: &str,
    path: &str,
) -> Result<(), String> {
    print_info("Streaming events...");

    let url = format!("{}{}", base_url.trim_end_matches('/'), path);

    // Try HTTP GET first (fallback if WebSocket not available)
    let response = client
        .get(&url)
        .header(AUTHORIZATION, format!("Bearer {access_token}"))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = response.status();
    let text = response.text().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        return Err(format!("HTTP {}: {}", status.as_u16(), text));
    }

    // Stream events line by line
    for line in text.lines() {
        if !line.trim().is_empty() {
            if let Ok(event) = serde_json::from_str::<Value>(line) {
                println!("{}", serde_json::to_string_pretty(&event).unwrap_or(line.to_string()));
            } else {
                println!("{}", line);
            }
        }
    }

    Ok(())
}
