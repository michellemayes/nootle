use super::types::{ChatMessage, LlmProvider, ModelInfo};
use std::time::Duration;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;

/// Calls the locally installed `claude` CLI (Claude Agent SDK) so the user's
/// existing Claude subscription handles auth — no API key needed.
pub struct ClaudeAgentProvider {
    binary_path: String,
}

const DISALLOWED_TOOLS: &str =
    "Bash Read Write Edit Glob Grep WebFetch WebSearch Task TodoWrite NotebookEdit";

const CHAT_TIMEOUT: Duration = Duration::from_secs(300);

impl ClaudeAgentProvider {
    pub fn detect() -> Option<Self> {
        let output = std::process::Command::new("sh")
            .arg("-c")
            .arg("command -v claude")
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        let path = String::from_utf8(output.stdout).ok()?.trim().to_string();
        if path.is_empty() {
            None
        } else {
            Some(Self { binary_path: path })
        }
    }

    pub fn binary_path(&self) -> &str {
        &self.binary_path
    }
}

#[async_trait::async_trait]
impl LlmProvider for ClaudeAgentProvider {
    fn provider_name(&self) -> &str {
        "claude-agent"
    }

    fn available_models(&self) -> Vec<ModelInfo> {
        vec![
            ModelInfo {
                id: "sonnet".into(),
                name: "Claude Sonnet (subscription)".into(),
                provider: "claude-agent".into(),
            },
            ModelInfo {
                id: "opus".into(),
                name: "Claude Opus (subscription)".into(),
                provider: "claude-agent".into(),
            },
            ModelInfo {
                id: "haiku".into(),
                name: "Claude Haiku (subscription)".into(),
                provider: "claude-agent".into(),
            },
        ]
    }

    async fn chat(&self, messages: Vec<ChatMessage>, model: &str) -> anyhow::Result<String> {
        let system = messages
            .iter()
            .find(|m| m.role == "system")
            .map(|m| m.content.clone());

        let prompt = messages
            .iter()
            .filter(|m| m.role != "system")
            .map(|m| {
                let label = match m.role.as_str() {
                    "assistant" => "Assistant",
                    "user" => "User",
                    other => other,
                };
                format!("{label}: {}", m.content)
            })
            .collect::<Vec<_>>()
            .join("\n\n");

        let mut cmd = Command::new(&self.binary_path);
        cmd.arg("-p")
            .arg("--model")
            .arg(model)
            .arg("--output-format")
            .arg("text")
            .arg("--disallowed-tools")
            .arg(DISALLOWED_TOOLS)
            // Load none of the user's MCP servers: a prompt needs no tools, and
            // Nootle's own server, launched from here, could start this again.
            .arg("--strict-mcp-config");

        if let Some(sys) = system {
            cmd.arg("--system-prompt").arg(sys);
        }

        cmd.kill_on_drop(true)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());

        let mut child = cmd.spawn().map_err(|e| {
            anyhow::anyhow!("Failed to spawn claude CLI at '{}': {e}", self.binary_path)
        })?;

        // Feed the prompt while reading the output, both under the timeout: a
        // long transcript fills the pipe, and a CLI that stops reading would
        // otherwise leave the write, and the summary, waiting forever.
        let mut stdin = child.stdin.take().expect("stdin is piped");
        let write = async move {
            stdin.write_all(prompt.as_bytes()).await?;
            stdin.shutdown().await
        };
        let (written, output) = tokio::time::timeout(CHAT_TIMEOUT, async {
            tokio::join!(write, child.wait_with_output())
        })
        .await
        .map_err(|_| anyhow::anyhow!("Claude CLI timed out after {:?}", CHAT_TIMEOUT))?;
        let output = output?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!(
                "Claude CLI exited with status {}: {}",
                output.status,
                stderr.trim()
            );
        }
        written?;

        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    #[tokio::test]
    async fn long_prompt_does_not_deadlock_a_cli_that_writes_before_reading() {
        let dir = tempfile::tempdir().unwrap();
        let bin = dir.path().join("claude");
        // Fills the stdout pipe before reading the prompt, as a chatty CLI
        // might; writing the whole prompt first would block both sides.
        std::fs::write(
            &bin,
            "#!/bin/sh\nhead -c 200000 /dev/zero | tr '\\0' x\nwc -c\n",
        )
        .unwrap();
        std::fs::set_permissions(&bin, std::fs::Permissions::from_mode(0o755)).unwrap();
        let provider = ClaudeAgentProvider {
            binary_path: bin.to_string_lossy().into_owned(),
        };

        let prompt = "y".repeat(500_000);
        let reply = tokio::time::timeout(
            Duration::from_secs(20),
            provider.chat(
                vec![ChatMessage {
                    role: "user".into(),
                    content: prompt,
                }],
                "sonnet",
            ),
        )
        .await
        .expect("chat deadlocked")
        .unwrap();

        assert!(reply.starts_with('x'));
        // `wc -c` saw the whole prompt: "User: " plus the 500,000 characters.
        assert!(reply.ends_with("500006"));
    }
}
