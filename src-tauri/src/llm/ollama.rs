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
            .timeout(Duration::from_secs(120))
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
        // Ollama uses OpenAI-compatible API
        let url = format!("{}/v1/chat/completions", self.base_url);
        let resp = self
            .client
            .post(&url)
            .json(&serde_json::json!({
                "model": model,
                "messages": messages,
            }))
            .send()
            .await?;

        let status = resp.status();
        let body: serde_json::Value = resp.json().await?;

        if !status.is_success() {
            let error_msg = body["error"]["message"]
                .as_str()
                .unwrap_or("Unknown API error");
            anyhow::bail!("Ollama API error ({}): {}", status, error_msg);
        }

        Ok(body["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("")
            .to_string())
    }
}
