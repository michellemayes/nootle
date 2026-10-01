use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub provider: String,
}

// async-trait <0.1.92 marks its boxed-future methods #[must_use], which clippy
// 1.99 flags as redundant; 0.1.92 fixes it but pulls in syn 3.
#[allow(clippy::double_must_use)]
#[async_trait::async_trait]
pub trait LlmProvider: Send + Sync {
    fn provider_name(&self) -> &str;
    fn available_models(&self) -> Vec<ModelInfo>;
    async fn chat(&self, messages: Vec<ChatMessage>, model: &str) -> anyhow::Result<String>;
}
