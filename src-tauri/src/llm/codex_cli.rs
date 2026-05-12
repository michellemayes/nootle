use super::types::{ChatMessage, LlmProvider, ModelInfo};
use tokio::process::Command;

const CODEX_BIN: &str = "codex";

pub struct CodexCliProvider;

impl Default for CodexCliProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl CodexCliProvider {
    pub fn new() -> Self {
        Self
    }

    pub fn is_available() -> bool {
        std::process::Command::new(CODEX_BIN)
            .arg("--version")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
}

#[async_trait::async_trait]
impl LlmProvider for CodexCliProvider {
    fn provider_name(&self) -> &str {
        "codex-cli"
    }

    fn available_models(&self) -> Vec<ModelInfo> {
        vec![
            ModelInfo {
                id: "gpt-5-codex".into(),
                name: "GPT-5 Codex (subscription)".into(),
                provider: "codex-cli".into(),
            },
            ModelInfo {
                id: "gpt-5-codex-mini".into(),
                name: "GPT-5 Codex Mini (subscription)".into(),
                provider: "codex-cli".into(),
            },
        ]
    }

    async fn chat(&self, messages: Vec<ChatMessage>, model: &str) -> anyhow::Result<String> {
        let prompt = messages
            .iter()
            .map(|m| format!("{}: {}", m.role, m.content))
            .collect::<Vec<_>>()
            .join("\n\n");

        let output = Command::new(CODEX_BIN)
            .arg("exec")
            .arg("--model")
            .arg(model)
            .arg("--skip-git-repo-check")
            .arg(&prompt)
            .output()
            .await?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("codex CLI failed: {}", stderr.trim());
        }

        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    }
}
