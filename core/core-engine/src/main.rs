use axum::{routing::get, Router};
use redis::{streams::{StreamReadOptions, StreamReadReply}, AsyncCommands};
use std::net::SocketAddr;
use std::time::Duration;
use tokio::net::TcpListener;

#[tokio::main]
async fn main() {
    println!("Starting PulseCore Engine...");

    // Build the Axum application
    let app = Router::new().route("/health", get(|| async { "OK" }));

    // Run the server on port 8000 to avoid Tomcat conflict
    let addr = SocketAddr::from(([0, 0, 0, 0], 8000));
    println!("Listening on http://{}", addr);

    // Spawn our background worker for Redis Streams Event Bus
    tokio::spawn(async move {
        start_event_listener().await;
    });

    let listener = TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

/// Connects to Redis and indefinitely reads from the Real-Time Event Stream
async fn start_event_listener() {
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
                            println!("🔥 Received PulseEvent (ID: {}): {}", last_id, payload_str);
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
