use super::types::{ChatMessage, LlmProvider, ModelInfo};
use std::time::Duration;

pub struct CodexProvider {
    api_key: String,
    client: reqwest::Client,
}

impl CodexProvider {
    pub fn new(api_key: String) -> Self {
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(120))
            .build()
            .expect("Failed to build HTTP client");
        Self { api_key, client }
    }
}

#[async_trait::async_trait]
impl LlmProvider for CodexProvider {
    fn provider_name(&self) -> &str {
        "codex"
    }

    fn available_models(&self) -> Vec<ModelInfo> {
        vec![
            ModelInfo {
                id: "gpt-5-codex".into(),
                name: "GPT-5 Codex".into(),
                provider: "codex".into(),
            },
            ModelInfo {
                id: "gpt-5-codex-mini".into(),
                name: "GPT-5 Codex Mini".into(),
                provider: "codex".into(),
            },
        ]
    }

    async fn chat(&self, messages: Vec<ChatMessage>, model: &str) -> anyhow::Result<String> {
        let input: Vec<serde_json::Value> = messages
            .iter()
            .map(|m| serde_json::json!({ "role": m.role, "content": m.content }))
            .collect();

        let resp = self
            .client
            .post("https://api.openai.com/v1/responses")
            .bearer_auth(&self.api_key)
            .json(&serde_json::json!({
                "model": model,
                "input": input,
            }))
            .send()
            .await?;

        let status = resp.status();
        let body: serde_json::Value = resp.json().await?;

        if !status.is_success() {
            let error_msg = body["error"]["message"]
                .as_str()
                .unwrap_or("Unknown API error");
            anyhow::bail!("Codex API error ({}): {}", status, error_msg);
        }

        if let Some(text) = body["output_text"].as_str() {
            if !text.is_empty() {
                return Ok(text.to_string());
            }
        }

        Ok(body["output"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|item| item["content"].as_array())
            .flatten()
            .filter_map(|c| c["text"].as_str())
            .collect())
    }
}
