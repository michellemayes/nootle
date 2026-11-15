//! A tiny HTTP server for tests of code that calls web APIs.

use tokio::io::{AsyncReadExt, AsyncWriteExt};

/// Answers one request per `(status, body)` in turn, each on its own
/// connection, and hands back the requests it got (bodies decoded lossily).
pub async fn serve(
    responses: Vec<(u16, &'static str)>,
) -> (String, tokio::task::JoinHandle<Vec<String>>) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let handle = tokio::spawn(async move {
        let mut requests = Vec::new();
        for (status, body) in responses {
            let (mut socket, _) = listener.accept().await.unwrap();
            let request = read_request(&mut socket).await;
            let reply = format!(
                "HTTP/1.1 {status} X\r\ncontent-type: application/json\r\nconnection: close\r\ncontent-length: {}\r\n\r\n{body}",
                body.len()
            );
            socket.write_all(reply.as_bytes()).await.unwrap();
            requests.push(String::from_utf8_lossy(&request).into_owned());
        }
        requests
    });
    (url, handle)
}

/// Serves one canned 200 response and hands back the request it got.
pub async fn one_shot_server(response: &'static str) -> (String, tokio::task::JoinHandle<String>) {
    let (url, handle) = serve(vec![(200, response)]).await;
    (
        url,
        tokio::spawn(async move { handle.await.unwrap().remove(0) }),
    )
}

async fn read_request(socket: &mut tokio::net::TcpStream) -> Vec<u8> {
    let mut request = Vec::new();
    let mut buf = [0u8; 8192];
    loop {
        let n = socket.read(&mut buf).await.unwrap();
        if n == 0 {
            return request;
        }
        request.extend_from_slice(&buf[..n]);
        let Some(head_end) = request.windows(4).position(|w| w == b"\r\n\r\n") else {
            continue;
        };
        let len = String::from_utf8_lossy(&request[..head_end])
            .lines()
            .find_map(|l| {
                l.to_ascii_lowercase()
                    .strip_prefix("content-length: ")
                    .map(|v| v.trim().parse::<usize>().unwrap())
            })
            .unwrap_or(0);
        if request.len() - head_end - 4 >= len {
            return request;
        }
    }
}
