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
    pub fn new() -> Self {
        Self {
            base_url: "http://localhost:11434".to_string(),
            client: reqwest::Client::new(),
        }
    }

    pub fn with_base_url(base_url: String) -> Self {
        Self {
            base_url,
            client: reqwest::Client::new(),
        }
    }
}

impl Default for OllamaProvider {
    fn default() -> Self {
        Self::new()
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
