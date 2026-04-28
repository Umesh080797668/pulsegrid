use clap::{Parser, Subcommand};
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use serde_json::Value;
use uuid::Uuid;

#[derive(Parser, Debug)]
#[command(name = "pulse")]
#[command(about = "PulseGrid CLI - Phase 1 flow management")]
struct Cli {
    #[arg(
        long,
        env = "PULSE_API_BASE_URL",
        default_value = "http://127.0.0.1:3000"
    )]
    api_base_url: String,

    #[arg(long, env = "PULSE_ACCESS_TOKEN")]
    access_token: String,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand, Debug)]
enum Commands {
    #[command(about = "List flows for a workspace")]
    List { #[arg(long)] workspace_id: Uuid },
    #[command(about = "Get a flow by id")]
    Get { #[arg(long)] flow_id: Uuid },
    #[command(about = "Delete a flow by id")]
    Delete { #[arg(long)] flow_id: Uuid },
    #[command(about = "Create a flow from a JSON file")]
    Create {
        #[arg(long)] workspace_id: Uuid,
        #[arg(long)] name: String,
        #[arg(long)] description: Option<String>,
        #[arg(long)] definition_file: String,
    },
    // Missing Phase 1 Commands
    #[command(about = "Run a flow manually")]
    FlowRun { #[arg(long)] id: Uuid },
    #[command(about = "List flow runs")]
    RunsList { #[arg(long)] flow: Uuid, #[arg(long, default_value = "20")] limit: usize },
    #[command(about = "Tail live events for a source")]
    EventsTail { #[arg(long)] source: String, #[arg(long)] r#type: String },
    #[command(about = "Export all flows as backup")]
    FlowExport { #[arg(long)] format: String, #[arg(long)] output: String },
    #[command(about = "Import flows from file")]
    FlowImport { #[arg(long)] file: String },
    #[command(about = "Deploy a flow to a workspace")]
    FlowDeploy { #[arg(long)] workspace: String, #[arg(long)] file: String },
    #[command(about = "Test a connector")]
    ConnectorTest { #[arg(name = "CONNECTOR")] connector: String },
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();
    let client = reqwest::Client::new();

    let result = match cli.command {
        Commands::List { workspace_id } => {
            let path = format!("/flows?workspaceId={workspace_id}");
            send(&client, &cli.api_base_url, &cli.access_token, reqwest::Method::GET, &path, None).await
        }
        Commands::Get { flow_id } => {
            let path = format!("/flows/{flow_id}");
            send(&client, &cli.api_base_url, &cli.access_token, reqwest::Method::GET, &path, None).await
        }
        Commands::Delete { flow_id } => {
            let path = format!("/flows/{flow_id}");
            send(&client, &cli.api_base_url, &cli.access_token, reqwest::Method::DELETE, &path, None).await
        }
        Commands::Create { workspace_id, name, description, definition_file } => {
            let definition_raw = std::fs::read_to_string(&definition_file).expect("Failed to read definition file");
            let definition: Value = serde_json::from_str(&definition_raw).expect("Invalid JSON in definition file");
            let body = serde_json::json!({
                "workspaceId": workspace_id,
                "name": name,
                "description": description,
                "definition": definition,
            });
            send(&client, &cli.api_base_url, &cli.access_token, reqwest::Method::POST, "/flows", Some(body)).await
        }
        Commands::FlowRun { id } => {
            let path = format!("/flows/{id}/run");
            send(&client, &cli.api_base_url, &cli.access_token, reqwest::Method::POST, &path, None).await
        }
        Commands::RunsList { flow, limit } => {
            let path = format!("/flows/{flow}/runs?limit={limit}");
            send(&client, &cli.api_base_url, &cli.access_token, reqwest::Method::GET, &path, None).await
        }
        Commands::EventsTail { source, r#type } => {
            // Stream events from WebSocket endpoint
            let path = format!("/events/stream?source={source}&type={type}");
            tail_events(&client, &cli.api_base_url, &cli.access_token, &path).await
        }
        Commands::FlowExport { format, output } => {
            export_flows(&client, &cli.api_base_url, &cli.access_token, &format, &output).await
        }
        Commands::FlowImport { file } => {
            import_flows(&client, &cli.api_base_url, &cli.access_token, &file).await
        }
        Commands::FlowDeploy { workspace, file } => {
            deploy_flow(&client, &cli.api_base_url, &cli.access_token, &workspace, &file).await
        }
        Commands::ConnectorTest { connector } => {
            let path = format!("/connectors/{connector}/test");
            send(&client, &cli.api_base_url, &cli.access_token, reqwest::Method::POST, &path, None).await
        }
    };

    if let Err(err) = result {
        eprintln!("{err}");
        std::process::exit(1);
    }
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
        println!("OK");
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

    println!("Exported flows to {}", output);
    Ok(())
}

/// Import flows from JSON file
async fn import_flows(
    client: &reqwest::Client,
    base_url: &str,
    access_token: &str,
    file: &str,
) -> Result<(), String> {
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
            eprintln!("Warning: Failed to import flow: {}", text);
        }
    }

    println!("Imported {} flows from {}", imported, file);
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

    println!("Deployed flow {} to workspace {}", flow_id, workspace);
    Ok(())
}

/// Tail live events from stream
async fn tail_events(
    client: &reqwest::Client,
    base_url: &str,
    access_token: &str,
    path: &str,
) -> Result<(), String> {
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
