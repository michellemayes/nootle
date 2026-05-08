//! AWS Bedrock provider using long-lived Bedrock API keys (Bearer auth).
//!
//! Auth: AWS issues "Bedrock API keys" that work as bearer tokens against
//! `https://bedrock-runtime.{region}.amazonaws.com`. No SigV4 signing needed.
//!
//! Currently scoped to Anthropic Claude models on Bedrock — they're the most
//! commonly used and share Anthropic's request schema, just with a Bedrock
//! `anthropic_version` and the model ID specified in the URL path.
//!
//! API key storage encodes the AWS region: the user supplies `<region>:<key>`
//! (e.g. `us-east-1:xxxxxxxx`) so the existing single-string api_keys table
//! works unchanged. If no region prefix is present we default to `us-east-1`.

use super::types::{ChatMessage, LlmProvider, ModelInfo};
use std::time::Duration;

pub struct BedrockProvider {
    region: String,
    api_key: String,
    client: reqwest::Client,
}

impl BedrockProvider {
    pub fn new(api_key_with_region: String) -> Self {
        let (region, api_key) = parse_region_key(&api_key_with_region);
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(120))
            .build()
            .expect("Failed to build HTTP client");
        Self {
            region,
            api_key,
            client,
        }
    }
}

fn parse_region_key(input: &str) -> (String, String) {
    if let Some((region, key)) = input.split_once(':') {
        if !region.is_empty() && !key.is_empty() {
            return (region.to_string(), key.to_string());
        }
    }
    ("us-east-1".to_string(), input.to_string())
}

#[async_trait::async_trait]
impl LlmProvider for BedrockProvider {
    fn provider_name(&self) -> &str {
        "bedrock"
    }

    fn available_models(&self) -> Vec<ModelInfo> {
        vec![
            ModelInfo {
                id: "anthropic.claude-sonnet-4-20250514-v1:0".into(),
                name: "Claude Sonnet 4 (Bedrock)".into(),
                provider: "bedrock".into(),
            },
            ModelInfo {
                id: "anthropic.claude-opus-4-20250514-v1:0".into(),
                name: "Claude Opus 4 (Bedrock)".into(),
                provider: "bedrock".into(),
            },
            ModelInfo {
                id: "anthropic.claude-3-5-sonnet-20241022-v2:0".into(),
                name: "Claude 3.5 Sonnet v2 (Bedrock)".into(),
                provider: "bedrock".into(),
            },
            ModelInfo {
                id: "anthropic.claude-3-5-haiku-20241022-v1:0".into(),
                name: "Claude 3.5 Haiku (Bedrock)".into(),
                provider: "bedrock".into(),
            },
        ]
    }

    async fn chat(&self, messages: Vec<ChatMessage>, model: &str) -> anyhow::Result<String> {
        let system = messages
            .iter()
            .find(|m| m.role == "system")
            .map(|m| m.content.clone());

        let user_messages: Vec<serde_json::Value> = messages
            .iter()
            .filter(|m| m.role != "system")
            .map(|m| serde_json::json!({"role": m.role, "content": m.content}))
            .collect();

        let mut body = serde_json::json!({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 4096,
            "messages": user_messages,
        });
        if let Some(sys) = system {
            body["system"] = serde_json::Value::String(sys);
        }

        let url = format!(
            "https://bedrock-runtime.{}.amazonaws.com/model/{}/invoke",
            self.region, model
        );
        let resp = self
            .client
            .post(&url)
            .bearer_auth(&self.api_key)
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await?;

        let status = resp.status();
        let body: serde_json::Value = resp.json().await?;

        if !status.is_success() {
            let error_msg = body["message"]
                .as_str()
                .or_else(|| body["Message"].as_str())
                .unwrap_or("Unknown API error");
            anyhow::bail!("Bedrock API error ({}): {}", status, error_msg);
        }

        Ok(body["content"][0]["text"]
            .as_str()
            .unwrap_or("")
            .to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_region_prefixed_key() {
        let (r, k) = parse_region_key("us-west-2:abc123");
        assert_eq!(r, "us-west-2");
        assert_eq!(k, "abc123");
    }

    #[test]
    fn defaults_region_when_no_prefix() {
        let (r, k) = parse_region_key("abc123");
        assert_eq!(r, "us-east-1");
        assert_eq!(k, "abc123");
    }

    #[test]
    fn empty_region_falls_back_to_default() {
        let (r, k) = parse_region_key(":abc123");
        assert_eq!(r, "us-east-1");
        assert_eq!(k, ":abc123");
    }
}
