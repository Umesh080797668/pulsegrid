use clap::{Parser, Subcommand};
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use serde_json::Value;
use uuid::Uuid;

#[derive(Parser, Debug)]
#[command(name = "pulse")]
#[command(about = "PulseGrid CLI - Phase 1 flow management")]
struct Cli {
    #[arg(long, env = "PULSE_API_BASE_URL", default_value = "http://127.0.0.1:3000")]
    api_base_url: String,

    #[arg(long, env = "PULSE_ACCESS_TOKEN")]
    access_token: String,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand, Debug)]
enum Commands {
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
        #[arg(long, help = "Path to flow definition JSON file")]
        definition_file: String,
    },
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
        Commands::Create {
            workspace_id,
            name,
            description,
            definition_file,
        } => {
            let definition_raw = match std::fs::read_to_string(&definition_file) {
                Ok(text) => text,
                Err(e) => {
                    eprintln!("Failed to read definition file: {e}");
                    std::process::exit(1);
                }
            };

            let definition: Value = match serde_json::from_str(&definition_raw) {
                Ok(v) => v,
                Err(e) => {
                    eprintln!("Invalid JSON in definition file: {e}");
                    std::process::exit(1);
                }
            };

            let body = serde_json::json!({
                "workspaceId": workspace_id,
                "name": name,
                "description": description,
                "definition": definition,
            });

            send(
                &client,
                &cli.api_base_url,
                &cli.access_token,
                reqwest::Method::POST,
                "/flows",
                Some(body),
            )
            .await
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
        req = req.header(CONTENT_TYPE, "application/json").json(&json_body);
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
