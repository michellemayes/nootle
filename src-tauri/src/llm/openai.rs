use super::types::{ChatMessage, LlmProvider, ModelInfo};

pub struct OpenAiProvider {
    api_key: String,
    client: reqwest::Client,
}

impl OpenAiProvider {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            client: reqwest::Client::new(),
        }
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
                id: "gpt-4o".into(),
                name: "GPT-4o".into(),
                provider: "openai".into(),
            },
            ModelInfo {
                id: "gpt-4o-mini".into(),
                name: "GPT-4o Mini".into(),
                provider: "openai".into(),
            },
            ModelInfo {
                id: "o1".into(),
                name: "o1".into(),
                provider: "openai".into(),
            },
            ModelInfo {
                id: "o3-mini".into(),
                name: "o3 Mini".into(),
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
