use std::env;
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::task;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Get upstream URL from command line
    let args: Vec<String> = env::args().collect();
    if args.len() != 2 {
        eprintln!("Usage: {} <upstream_url>", args[0]);
        std::process::exit(1);
    }

    let upstream_url = Arc::new(args[1].clone());
    println!("Forwarding to upstream: {}", upstream_url);

    // Bind to port 8080
    let listener = TcpListener::bind("127.0.0.1:8080").await?;
    println!("Server listening on http://127.0.0.1:8080");

    loop {
        let (mut socket, addr) = listener.accept().await?;
        let upstream = Arc::clone(&upstream_url);

        // Handle each connection in a separate task
        task::spawn(async move {
            let mut buffer = vec![0; 4096];

            // Read the request
            let n = match socket.read(&mut buffer).await {
                Ok(n) if n == 0 => return,
                Ok(n) => n,
                Err(e) => {
                    eprintln!("Failed to read from socket: {}", e);
                    return;
                }
            };

            let request = String::from_utf8_lossy(&buffer[..n]);

            // Parse the request line
            let lines: Vec<&str> = request.lines().collect();
            if lines.is_empty() {
                return;
            }

            let request_line = lines[0];
            let parts: Vec<&str> = request_line.split_whitespace().collect();
            if parts.len() < 3 {
                return;
            }

            let method = parts[0].to_string();
            let path = parts[1].to_string();
            let _version = parts[2];

            // Extract headers and body
            let mut headers = Vec::new();
            let mut body_start = 0;
            let mut found_empty_line = false;

            for (i, line) in lines.iter().enumerate().skip(1) {
                if line.is_empty() {
                    body_start = i + 1;
                    found_empty_line = true;
                    break;
                }
                headers.push(line.to_string());
            }

            let body = if found_empty_line && body_start < lines.len() {
                lines[body_start..].join("\r\n")
            } else {
                String::new()
            };

            // Send immediate 200 OK response
            let response = "HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n";
            if let Err(e) = socket.write_all(response.as_bytes()).await {
                eprintln!("Failed to write response: {}", e);
                return;
            }

            println!(
                "[{}] {} {} -> 200 OK (immediate response)",
                addr, method, path
            );

            // Spawn fire-and-forget task to forward request to upstream
            task::spawn(async move {
                if let Err(e) = forward_to_upstream(&upstream, &method, &path, headers, body).await
                {
                    eprintln!("Failed to forward request: {}", e);
                }
            });
        });
    }
}

async fn forward_to_upstream(
    upstream_url: &str,
    method: &str,
    path: &str,
    headers: Vec<String>,
    body: String,
) -> Result<(), Box<dyn std::error::Error>> {
    // Parse upstream URL
    let url = if upstream_url.ends_with('/') {
        format!("{}{}", upstream_url.trim_end_matches('/'), path)
    } else {
        format!("{}{}", upstream_url, path)
    };

    // Build the request
    let client = reqwest::Client::new();
    let mut request = match method {
        "GET" => client.get(&url),
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "DELETE" => client.delete(&url),
        "PATCH" => client.patch(&url),
        "HEAD" => client.head(&url),
        _ => client.get(&url), // Default to GET for unknown methods
    };

    // Add headers (skip Host header as reqwest handles it)
    for header in headers {
        if let Some((key, value)) = header.split_once(':') {
            let key = key.trim();
            let value = value.trim();
            if key.to_lowercase() != "host" && key.to_lowercase() != "content-length" {
                request = request.header(key, value);
            }
        }
    }

    // Add body if present
    if !body.is_empty() {
        request = request.body(body);
    }

    // Send request - we don't care about the response
    let _ = request.send().await;

    println!("Forwarded {} {} to {}", method, path, url);

    Ok(())
}

/* Cargo.toml contents:
[package]
name = "fire-forget-proxy"
version = "0.1.0"
edition = "2021"

[dependencies]
tokio = { version = "1.35", features = ["full"] }
reqwest = { version = "0.11", features = ["json"] }
*/
