//! The OpenAI chat-completions call that OpenAI, Groq, OpenRouter and custom
//! endpoints all speak.

use super::types::ChatMessage;
use crate::endpoints::error_message;

/// Sends `messages` to `model` with `request` (a POST to the provider's
/// `chat/completions`, already authorized) and returns the reply's text.
/// Errors carry the provider's own message, named `provider`.
pub async fn complete(
    request: reqwest::RequestBuilder,
    provider: &str,
    model: &str,
    messages: Vec<ChatMessage>,
) -> anyhow::Result<String> {
    let resp = request
        .json(&serde_json::json!({
            "model": model,
            "messages": messages,
        }))
        .send()
        .await?;
    let status = resp.status();
    let text = resp.text().await?;
    if !status.is_success() {
        anyhow::bail!("{provider} API error ({status}): {}", error_message(&text));
    }
    let body: serde_json::Value = serde_json::from_str(&text)
        .map_err(|_| anyhow::anyhow!("{provider} didn't reply in the OpenAI format"))?;
    Ok(body["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string())
}
