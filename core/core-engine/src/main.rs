use axum::{routing::get, Router};
use redis::{streams::{StreamReadOptions, StreamReadReply}, AsyncCommands};
use std::net::SocketAddr;
use std::time::Duration;
use tokio::net::TcpListener;
use sqlx::postgres::PgPoolOptions;

mod models;
use models::PulseEvent;

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
