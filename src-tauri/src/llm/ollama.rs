use super::types::{ChatMessage, LlmProvider, ModelInfo};

pub struct OllamaProvider {
    base_url: String,
    client: reqwest::Client,
}

impl Default for OllamaProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl OllamaProvider {
    fn build_client() -> reqwest::Client {
        use std::time::Duration;
        reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(10))
            // A local model summarizing an hour-long meeting can take minutes.
            .timeout(Duration::from_secs(600))
            .build()
            .expect("Failed to build HTTP client")
    }

    pub fn new() -> Self {
        Self {
            base_url: "http://localhost:11434".to_string(),
            client: Self::build_client(),
        }
    }

    pub fn with_base_url(base_url: String) -> Result<Self, String> {
        // Only allow localhost URLs to prevent SSRF
        let lower = base_url.to_lowercase();
        let is_local = lower.starts_with("http://localhost")
            || lower.starts_with("http://127.0.0.1")
            || lower.starts_with("http://[::1]");
        if !is_local {
            return Err("Ollama URL must be localhost".to_string());
        }
        Ok(Self {
            base_url,
            client: Self::build_client(),
        })
    }
}

#[async_trait::async_trait]
impl LlmProvider for OllamaProvider {
    fn provider_name(&self) -> &str {
        "ollama"
    }

    fn available_models(&self) -> Vec<ModelInfo> {
        // Ollama models are dynamic -- these are common defaults
        vec![
            ModelInfo {
                id: "llama3.2".into(),
                name: "Llama 3.2".into(),
                provider: "ollama".into(),
            },
            ModelInfo {
                id: "mistral".into(),
                name: "Mistral".into(),
                provider: "ollama".into(),
            },
            ModelInfo {
                id: "gemma2".into(),
                name: "Gemma 2".into(),
                provider: "ollama".into(),
            },
        ]
    }

    async fn chat(&self, messages: Vec<ChatMessage>, model: &str) -> anyhow::Result<String> {
        // The native API, because the OpenAI-compatible one ignores num_ctx
        // and Ollama's default window silently drops most of a long
        // transcript.
        let url = format!("{}/api/chat", self.base_url);
        let prompt_chars: usize = messages.iter().map(|m| m.content.len()).sum();
        let resp = self
            .client
            .post(&url)
            .json(&serde_json::json!({
                "model": model,
                "messages": messages,
                "stream": false,
                "options": { "num_ctx": context_window(prompt_chars) },
            }))
            .send()
            .await?;

        let status = resp.status();
        let body: serde_json::Value = resp.json().await?;

        if !status.is_success() {
            let error_msg = body["error"].as_str().unwrap_or("Unknown API error");
            anyhow::bail!("Ollama API error ({}): {}", status, error_msg);
        }

        Ok(body["message"]["content"]
            .as_str()
            .unwrap_or("")
            .to_string())
    }
}

/// Context window to ask for: room for the prompt (about 3.5 characters a
/// token) plus a reply, rounded up to a power of two, between 8K and 32K.
fn context_window(prompt_chars: usize) -> usize {
    let tokens = prompt_chars * 2 / 7 + 2048;
    tokens.next_power_of_two().clamp(8192, 32768)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Serves one canned HTTP response and hands back the request it got.
    async fn one_shot_server(response: &'static str) -> (String, tokio::task::JoinHandle<String>) {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let handle = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = Vec::new();
            let mut buf = [0u8; 8192];
            loop {
                let n = socket.read(&mut buf).await.unwrap();
                request.extend_from_slice(&buf[..n]);
                let text = String::from_utf8_lossy(&request);
                if let Some((head, body)) = text.split_once("\r\n\r\n") {
                    let len = head
                        .lines()
                        .find_map(|l| {
                            l.to_ascii_lowercase()
                                .strip_prefix("content-length: ")
                                .map(|v| v.trim().parse::<usize>().unwrap())
                        })
                        .unwrap_or(0);
                    if body.len() >= len {
                        break;
                    }
                }
            }
            let reply = format!(
                "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\n\r\n{response}",
                response.len()
            );
            socket.write_all(reply.as_bytes()).await.unwrap();
            String::from_utf8_lossy(&request).into_owned()
        });
        (url, handle)
    }

    #[tokio::test]
    async fn chats_through_the_native_api_with_a_sized_context() {
        let (url, server) =
            one_shot_server(r#"{"message":{"role":"assistant","content":"Hi there"}}"#).await;
        let provider = OllamaProvider::with_base_url(url).unwrap();
        let reply = provider
            .chat(
                vec![ChatMessage {
                    role: "user".into(),
                    content: "x".repeat(40_000),
                }],
                "qwen3",
            )
            .await
            .unwrap();
        assert_eq!(reply, "Hi there");
        let request = server.await.unwrap();
        assert!(request.starts_with("POST /api/chat "), "{}", &request[..40]);
        assert!(request.contains(r#""num_ctx":16384"#));
        assert!(request.contains(r#""stream":false"#));
    }

    #[test]
    fn context_window_fits_the_prompt() {
        assert_eq!(context_window(1_000), 8192);
        assert_eq!(context_window(40_000), 16384);
        assert_eq!(context_window(1_000_000), 32768);
    }
}
