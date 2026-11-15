use super::types::{ChatMessage, LlmProvider, ModelInfo};
use crate::endpoints::{Endpoint, Kind};

/// Any OpenAI-compatible chat endpoint, with the models the user listed.
pub struct CustomProvider {
    endpoint: Endpoint,
    client: reqwest::Client,
}

impl CustomProvider {
    pub fn new(endpoint: Endpoint) -> Self {
        use std::time::Duration;
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(300))
            .build()
            .expect("Failed to build HTTP client");
        Self { endpoint, client }
    }
}

#[async_trait::async_trait]
impl LlmProvider for CustomProvider {
    fn provider_name(&self) -> &str {
        Kind::Chat.key_name()
    }

    fn available_models(&self) -> Vec<ModelInfo> {
        self.endpoint
            .models
            .iter()
            .map(|id| ModelInfo {
                id: id.clone(),
                name: id.clone(),
                provider: self.provider_name().into(),
            })
            .collect()
    }

    async fn chat(&self, messages: Vec<ChatMessage>, model: &str) -> anyhow::Result<String> {
        let request = self
            .client
            .post(self.endpoint.url("chat/completions"))
            .header("HTTP-Referer", "https://nootle.app")
            .header("X-Title", "Nootle");
        let request = self.endpoint.authorize(request);
        super::openai_compat::complete(request, "Custom endpoint", model, messages).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_http::{one_shot_server, serve};

    fn endpoint(base_url: String, api_key: Option<&str>) -> Endpoint {
        Endpoint {
            base_url,
            models: vec!["openai/gpt-5".into(), "qwen/qwen3-235b".into()],
            api_key: api_key.map(str::to_string),
        }
    }

    #[tokio::test]
    async fn chats_through_the_openai_api_with_the_key() {
        let (url, server) =
            one_shot_server(r#"{"choices":[{"message":{"role":"assistant","content":"OK"}}]}"#)
                .await;
        let provider = CustomProvider::new(endpoint(url, Some("sk-test")));
        let message = ChatMessage {
            role: "user".into(),
            content: "hi".into(),
        };
        assert_eq!(
            provider.chat(vec![message], "openai/gpt-5").await.unwrap(),
            "OK"
        );
        let request = server.await.unwrap();
        assert!(request.starts_with("POST /chat/completions "));
        assert!(request
            .to_lowercase()
            .contains("authorization: bearer sk-test"));
        assert!(request.contains(r#""model":"openai/gpt-5""#));
    }

    #[tokio::test]
    async fn keyless_endpoints_send_no_authorization() {
        let (url, server) = one_shot_server(r#"{"choices":[{"message":{"content":"OK"}}]}"#).await;
        let provider = CustomProvider::new(endpoint(url, None));
        provider.chat(vec![], "openai/gpt-5").await.unwrap();
        assert!(!server
            .await
            .unwrap()
            .to_lowercase()
            .contains("authorization:"));
    }

    #[tokio::test]
    async fn errors_carry_the_servers_message() {
        let (url, _server) = serve(vec![(401, r#"{"error":{"message":"No auth"}}"#)]).await;
        let err = CustomProvider::new(endpoint(url, None))
            .chat(vec![], "openai/gpt-5")
            .await
            .unwrap_err();
        assert!(err.to_string().contains("No auth"), "{err}");
    }

    #[test]
    fn offers_the_listed_models() {
        let provider = CustomProvider::new(endpoint("http://x".into(), None));
        let ids: Vec<_> = provider
            .available_models()
            .into_iter()
            .map(|m| m.id)
            .collect();
        assert_eq!(ids, ["openai/gpt-5", "qwen/qwen3-235b"]);
        assert_eq!(provider.provider_name(), "custom");
    }
}
