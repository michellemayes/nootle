use super::types::{ChatMessage, LlmProvider, ModelInfo};

pub struct GroqProvider {
    api_key: String,
    client: reqwest::Client,
}

impl GroqProvider {
    pub fn new(api_key: String) -> Self {
        use std::time::Duration;
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(120))
            .build()
            .unwrap_or_default();
        Self { api_key, client }
    }
}

#[async_trait::async_trait]
impl LlmProvider for GroqProvider {
    fn provider_name(&self) -> &str {
        "groq"
    }

    fn available_models(&self) -> Vec<ModelInfo> {
        vec![
            ModelInfo {
                id: "llama-3.3-70b-versatile".into(),
                name: "Llama 3.3 70B".into(),
                provider: "groq".into(),
            },
            ModelInfo {
                id: "llama-3.1-8b-instant".into(),
                name: "Llama 3.1 8B".into(),
                provider: "groq".into(),
            },
            ModelInfo {
                id: "meta-llama/llama-4-scout-17b-16e-instruct".into(),
                name: "Llama 4 Scout".into(),
                provider: "groq".into(),
            },
            ModelInfo {
                id: "qwen/qwen3-32b".into(),
                name: "Qwen 3 32B".into(),
                provider: "groq".into(),
            },
        ]
    }

    async fn chat(&self, messages: Vec<ChatMessage>, model: &str) -> anyhow::Result<String> {
        // Groq uses OpenAI-compatible API
        let resp = self
            .client
            .post("https://api.groq.com/openai/v1/chat/completions")
            .bearer_auth(&self.api_key)
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
            anyhow::bail!("Groq API error ({}): {}", status, error_msg);
        }

        Ok(body["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("")
            .to_string())
    }
}
