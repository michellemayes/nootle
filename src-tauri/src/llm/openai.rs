use super::types::{ChatMessage, LlmProvider, ModelInfo};

pub struct OpenAiProvider {
    api_key: String,
    client: reqwest::Client,
}

impl OpenAiProvider {
    pub fn new(api_key: String) -> Self {
        use std::time::Duration;
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(120))
            .build()
            .expect("Failed to build HTTP client");
        Self { api_key, client }
    }
}

#[async_trait::async_trait]
impl LlmProvider for OpenAiProvider {
    fn provider_name(&self) -> &str {
        "openai"
    }

    fn available_models(&self) -> Vec<ModelInfo> {
        vec![
            ModelInfo {
                id: "gpt-5".into(),
                name: "GPT-5".into(),
                provider: "openai".into(),
            },
            ModelInfo {
                id: "gpt-5-mini".into(),
                name: "GPT-5 Mini".into(),
                provider: "openai".into(),
            },
            ModelInfo {
                id: "gpt-4.1".into(),
                name: "GPT-4.1".into(),
                provider: "openai".into(),
            },
            ModelInfo {
                id: "gpt-4.1-mini".into(),
                name: "GPT-4.1 Mini".into(),
                provider: "openai".into(),
            },
            ModelInfo {
                id: "gpt-4.1-nano".into(),
                name: "GPT-4.1 Nano".into(),
                provider: "openai".into(),
            },
            ModelInfo {
                id: "o4-mini".into(),
                name: "o4 Mini".into(),
                provider: "openai".into(),
            },
        ]
    }

    async fn chat(&self, messages: Vec<ChatMessage>, model: &str) -> anyhow::Result<String> {
        let resp = self
            .client
            .post("https://api.openai.com/v1/chat/completions")
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
            anyhow::bail!("OpenAI API error ({}): {}", status, error_msg);
        }

        Ok(body["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("")
            .to_string())
    }
}
