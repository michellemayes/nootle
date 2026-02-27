use super::types::{ChatMessage, LlmProvider, ModelInfo};

pub struct OpenRouterProvider {
    api_key: String,
    client: reqwest::Client,
}

impl OpenRouterProvider {
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
impl LlmProvider for OpenRouterProvider {
    fn provider_name(&self) -> &str {
        "openrouter"
    }

    fn available_models(&self) -> Vec<ModelInfo> {
        vec![
            ModelInfo {
                id: "anthropic/claude-sonnet-4.6".into(),
                name: "Claude Sonnet 4.6".into(),
                provider: "openrouter".into(),
            },
            ModelInfo {
                id: "anthropic/claude-haiku-4.5".into(),
                name: "Claude Haiku 4.5".into(),
                provider: "openrouter".into(),
            },
            ModelInfo {
                id: "openai/gpt-5".into(),
                name: "GPT-5".into(),
                provider: "openrouter".into(),
            },
            ModelInfo {
                id: "openai/gpt-4.1".into(),
                name: "GPT-4.1".into(),
                provider: "openrouter".into(),
            },
            ModelInfo {
                id: "google/gemini-2.5-flash".into(),
                name: "Gemini 2.5 Flash".into(),
                provider: "openrouter".into(),
            },
            ModelInfo {
                id: "meta-llama/llama-3.3-70b-instruct".into(),
                name: "Llama 3.3 70B".into(),
                provider: "openrouter".into(),
            },
        ]
    }

    async fn chat(&self, messages: Vec<ChatMessage>, model: &str) -> anyhow::Result<String> {
        let resp = self
            .client
            .post("https://openrouter.ai/api/v1/chat/completions")
            .bearer_auth(&self.api_key)
            .header("HTTP-Referer", "https://nootle.app")
            .header("X-Title", "Nootle")
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
            anyhow::bail!("OpenRouter API error ({}): {}", status, error_msg);
        }

        Ok(body["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("")
            .to_string())
    }
}
