use actix_cors::Cors;
use actix_web::{web, App, Error, HttpRequest, HttpResponse, HttpServer, Responder};
use actix_web_lab::sse::{self, Sse};
use serde_json::Value;
use std::collections::HashMap;
use tokio::sync::{broadcast, Mutex}; // Using tokio's Mutex for async locking
use tracing::{debug, error, info, level_filters::LevelFilter, warn};

// Capacity for the broadcast channel (how many messages can be buffered if subscribers are slow)
const BROADCAST_CHANNEL_CAPACITY: usize = 100;

// Shared application state
struct AppState {
    // Maps networkKey to a broadcast sender for that key
    // We send String because SSE data is string-based (JSON stringified)
    senders: Mutex<HashMap<String, broadcast::Sender<String>>>,
}

impl AppState {
    fn new() -> Self {
        AppState {
            senders: Mutex::new(HashMap::new()),
        }
    }
}

// Simple root handler
async fn hello() -> impl Responder {
    HttpResponse::Ok().body("Hello World")
}

async fn publish(
    path: web::Path<String>,
    payload: web::Json<Value>, // actix-web automatically deserializes JSON
    app_state: web::Data<AppState>,
) -> impl Responder {
    let network_key = path.into_inner();
    let data_str = match serde_json::to_string(&payload) {
        Ok(s) => s,
        Err(e) => {
            error!("Failed to serialize payload for {}: {}", network_key, e);
            return HttpResponse::InternalServerError().body("Serialization error");
        }
    };

    info!(
        "Received data for networkKey '{}', type: {:?}",
        network_key,
        payload.get("type").and_then(|v| v.as_str()) // Safely get 'type' if it exists
    );

    let mut senders_guard = app_state.senders.lock().await;

    if let Some(sender) = senders_guard.get(&network_key) {
        // `send` returns an error if there are no receivers, which is fine for pub/sub.
        // We log it but don't treat it as a server error.
        if let Err(e) = sender.send(data_str.clone()) {
            debug!(
                "Failed to send message to networkKey '{}' (no active subscribers?): {}",
                network_key, e
            );
        }
    } else {
        // No sender for this key yet, create one
        debug!("No sender for networkKey '{}', creating one.", network_key);
        let (sender, _rx) = broadcast::channel(BROADCAST_CHANNEL_CAPACITY);
        // Send the current message (again, ignore error if no one subscribes immediately)
        if let Err(e) = sender.send(data_str.clone()) {
            debug!(
                "Failed to send initial message to new networkKey '{}': {}",
                network_key, e
            );
        }
        senders_guard.insert(network_key.clone(), sender);
    }
    // Explicitly drop the guard to release the lock before any potential long-running operations
    // or if the function scope doesn't end immediately. Here it's not strictly necessary
    // as it would be dropped at the end of the scope anyway.
    drop(senders_guard);

    HttpResponse::Ok().body("OK")
}

// Handler for GET /stream/:networkKey
async fn subscribe_sse(
    req: HttpRequest, // Used for logging client connection
    path: web::Path<String>,
    app_state: web::Data<AppState>,
) -> Result<Sse<impl futures_util::Stream<Item = Result<sse::Event, Error>>>, Error> {
    let network_key = path.into_inner();
    let client_addr = req
        .peer_addr()
        .map_or_else(|| "unknown".to_string(), |addr| addr.to_string());

    debug!(client = %client_addr, network_key = %network_key, "New SSE connection attempt");

    let mut rx: broadcast::Receiver<String>;

    // Scope for the Mutex guard
    {
        let mut senders_guard = app_state.senders.lock().await;
        if let Some(sender) = senders_guard.get(&network_key) {
            rx = sender.subscribe();
            debug!(client = %client_addr, network_key = %network_key, "Subscribed to existing topic");
        } else {
            debug!(client = %client_addr, network_key = %network_key, "Creating new topic and subscribing");
            let (sender, new_rx) = broadcast::channel(BROADCAST_CHANNEL_CAPACITY);
            senders_guard.insert(network_key.clone(), sender);
            rx = new_rx;
        }
    } // Mutex guard is dropped here

    let network_key_clone = network_key.clone(); // Clone for the async block
    let client_addr_clone = client_addr.clone(); // Clone for the async block

    let stream = async_stream::stream! {
        info!(client = %client_addr_clone, network_key = %network_key_clone, "SSE stream started");
        loop {
            match rx.recv().await {
                Ok(data_str) => {
                    debug!(client = %client_addr_clone, network_key = %network_key_clone, "Sending message via SSE");
                    let event = sse::Event::Data(sse::Data::new(data_str).event("message"));
                    yield Ok(event);
                }
                Err(broadcast::error::RecvError::Lagged(n)) => {
                    // Subscriber was too slow, messages were dropped.
                    warn!(client = %client_addr_clone, network_key = %network_key_clone, count = n, "SSE client lagged, messages dropped");
                    // Optionally, send a special event to the client
                    // yield Ok(sse::Event::data(format!("Lagged by {} messages", n)).event("system_warning"));
                }
                Err(broadcast::error::RecvError::Closed) => {
                    // Sender was dropped, meaning the topic was likely removed or server is shutting down.
                    info!(client = %client_addr_clone, network_key = %network_key_clone, "Broadcast channel closed, ending SSE stream");
                    break;
                }
            }
        }
        info!(client = %client_addr_clone, network_key = %network_key_clone, "SSE stream ended");
    };

    Ok(Sse::from_stream(stream).with_keep_alive(std::time::Duration::from_secs(15)))
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // Initialize tracing subscriber for logging
    // RUST_LOG=info,rust_pubsub_server=debug cargo run
    tracing_subscriber::fmt()
        // .with_default_directive(LevelFilter::INFO.into())
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive(LevelFilter::INFO.into()),
        )
        .init();

    let app_state = web::Data::new(AppState::new());

    info!("Starting server on http://127.0.0.1:8080");

    HttpServer::new(move || {
        let cors = Cors::default() // Or configure more restrictively
            .allow_any_origin()
            .allow_any_method()
            .allow_any_header()
            .max_age(3600);

        App::new()
            .app_data(app_state.clone()) // Share AppState with all handlers
            .wrap(cors) // Add CORS middleware
            .route("/", web::get().to(hello))
            .route("/{networkKey}", web::post().to(publish))
            .route("/stream/{networkKey}", web::get().to(subscribe_sse))
    })
    .bind("0.0.0.0:8080")?
    .run()
    .await
}
