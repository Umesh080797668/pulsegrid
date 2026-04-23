use axum::{routing::get, Router};
use redis::{streams::{StreamReadOptions, StreamReadReply}, AsyncCommands};
use std::net::SocketAddr;
use std::time::Duration;
use tokio::net::TcpListener;
use sqlx::postgres::PgPoolOptions;
use core_vm::{CoreVm, Pipeline, Step};
use core_connectors::{Connectors, HttpConfig};
use core_vault::Vault;

mod models;
mod grpc;
use models::PulseEvent;
use core_proto::pulsecore::pulse_core_service_server::PulseCoreServiceServer;
use grpc::MyPulseCoreService;

#[tokio::main]
async fn main() {
    println!("Starting PulseCore Engine...");
    dotenvy::dotenv().ok(); // Load environment variables from .env

    // Setup PostgreSQL connection pool
    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await
        .expect("Failed to connect to Postgres");

    println!("Connected to PostgreSQL databases!");

    // Build the Axum application
    let app = Router::new().route("/health", get(|| async { "OK" }));

    // Run the server on port 8000 to avoid Tomcat conflict
    let addr = SocketAddr::from(([0, 0, 0, 0], 8000));
    println!("Listening on http://{}", addr);

    // Spawn our background worker for Redis Streams Event Bus
    let pool_clone = pool.clone();
    tokio::spawn(async move {
        start_event_listener(pool_clone).await;
    });

    // Start gRPC server
    let grpc_addr = "127.0.0.1:50051".parse().unwrap();
    let grpc_pool = pool.clone();
    let service = MyPulseCoreService::new(grpc_pool);
    println!("🚀 Starting gRPC server on {}", grpc_addr);
    tokio::spawn(async move {
        tonic::transport::Server::builder()
            .add_service(PulseCoreServiceServer::new(service))
            .serve(grpc_addr)
            .await
            .unwrap();
    });

    let listener = TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

/// Connects to Redis and indefinitely reads from the Real-Time Event Stream
async fn start_event_listener(pg_pool: sqlx::PgPool) {
    let redis_url = "redis://127.0.0.1:6379/";
    let client = match redis::Client::open(redis_url) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Failed to connect to Redis: {}", e);
            return;
        }
    };

    println!("Connecting to Redis Event Bus...");
    let mut con = match client.get_multiplexed_async_connection().await {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Failed to get async connection: {}", e);
            return;
        }
    };

    println!("Connected to Redis. Listening for inbound PulseEvents...");
    
    // We start listening from the latest message ('$')
    let mut last_id = String::from("$");
    
    let opts = StreamReadOptions::default()
        .block(5000) // Block for 5 seconds waiting for events
        .count(10);  // Read up to 10 events per batch

    loop {
        // XREAD block from our blueprint's stream key
        let result: Result<StreamReadReply, redis::RedisError> = con
            .xread_options(&["stream:events:global"], &[&last_id], &opts)
            .await;

        match result {
            Ok(reply) => {
                for key in reply.keys {
                    for node in key.ids {
                        last_id = node.id.clone();
                        
                        // Grab the actual event payload (we assume it's stored under a 'payload' field)
                        if let Some(redis::Value::BulkString(data)) = node.map.get("payload") {
                            let payload_str = String::from_utf8_lossy(data);
                            
                            // Try parsing into our structural PulseEvent model
                            match serde_json::from_str::<PulseEvent>(&payload_str) {
                                Ok(event) => {
                                    println!("🔥 Received PulseEvent (ID: {}): Parsed Event: {:?}", last_id, event);
                                    
                                    // Send to Postgres to track event/log run details properly
                                    let insert_result = sqlx::query!(
                                        r#"
                                        INSERT INTO flow_runs (workspace_id, status, trigger_event_id, started_at) 
                                        VALUES ($1, $2, $3, NOW())
                                        "#,
                                        event.tenant_id as _,
                                        "running",
                                        event.id as _
                                    )
                                    .execute(&pg_pool)
                                    .await;

                                    match insert_result {
                                        Ok(_) => println!("   ✅ Logged flow_run securely in Postgres!"),
                                        Err(e) => eprintln!("   ❌ Error saving to Postgres: {}", e),
                                    }

                                    // Let's create a stub Pipeline to test core-vm
                                    let mut pipeline_context = rhai::Map::new();
                                    pipeline_context.insert("event_id".into(), rhai::Dynamic::from(event.id.clone()));
                                    pipeline_context.insert("event_type".into(), rhai::Dynamic::from(event.event_type.clone()));
                                    
                                    let dummy_pipeline = Pipeline {
                                        id: "pipe-1".into(),
                                        name: "Demo Execution".into(),
                                        steps: vec![
                                            Step {
                                                id: "step-1".into(),
                                                kind: "script".into(),
                                                code: Some(r#"
                                                    print("🚀 Running Javascript-like (Rhai) snippet for Event: " + ctx.event_type);
                                                    ctx.status = "processed";
                                                    ctx.processing_time_ms = 42;
                                                    ctx.output_msg = "Hello from PulseGrid core-vm!";
                                                "#.into()),
                                            },
                                            Step {
                                                id: "step-2".into(),
                                                kind: "http".into(), // Emulating an external connector step
                                                code: None,
                                            }
                                        ]
                                    };

                                    println!("   ⚡ Passing payload to Core VM...");
                                    let vm = CoreVm::new();
                                    match vm.execute_pipeline(&dummy_pipeline, pipeline_context) {
                                        Ok(result_ctx) => {
                                            println!("   🌟 VM Check OK. Output Context:");
                                            println!("      -> {:?}", result_ctx);
                                            
                                            // Execute connectors part
                                            println!("   🔌 Executing Connectors...");
                                            let connectors = Connectors::new();
                                            let config = HttpConfig {
                                                url: "https://httpbin.org/get".into(),
                                                method: "GET".into(),
                                                json_body: None,
                                                headers: None,
                                            };
                                            match connectors.execute_http(&config).await {
                                                Ok(val) => println!("   ✅ HTTP Connector Response: {}", val),
                                                Err(e) => eprintln!("   ❌ HTTP Connector Error: {:?}", e),
                                            }

                                            // Vault check
                                            let vault = Vault::new("my-master-password!");
                                            let plain = "my-secret-api-key";
                                            if let Ok(encrypted) = vault.encrypt(plain) {
                                                println!("   🔒 Vault Encrypted: {}", encrypted);
                                                if let Ok(decrypted) = vault.decrypt(&encrypted) {
                                                    println!("   🔓 Vault Decrypted matches: {}", decrypted == plain);
                                                }
                                            }

                                            // Then update flow_run to success
                                            let _ = sqlx::query!(
                                                r#"UPDATE flow_runs SET status = $1, completed_at = NOW() WHERE trigger_event_id = $2"#,
                                                "success",
                                                event.id as _
                                            ).execute(&pg_pool).await;
                                        },
                                        Err(e) => {
                                            eprintln!("   ❌ VM Pipeline failed: {:?}", e);
                                        }
                                    }
                                }
                                Err(err) => {
                                    println!("⚠️ Raw message received (ID: {}). Parsing to PulseEvent failed: {}", last_id, err);
                                    println!("   Raw Data: {}", payload_str);
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                eprintln!("Error reading stream: {}", e);
                // Sleep briefly to prevent tight loop on connection errors
                tokio::time::sleep(Duration::from_secs(2)).await;
            }
        }
    }
}
