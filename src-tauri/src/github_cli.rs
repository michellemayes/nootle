//! Connects GitHub by reusing the GitHub CLI's sign-in (`gh auth token`), so
//! users who already ran `gh auth login` don't have to create a token.

use tokio::process::Command;

/// Apps launched from Finder get a minimal PATH, so also look where Homebrew
/// installs `gh`.
const FALLBACK_PATHS: &[&str] = &["/opt/homebrew/bin/gh", "/usr/local/bin/gh"];

async fn gh_binary() -> Option<String> {
    let found = Command::new("sh")
        .arg("-c")
        .arg("command -v gh")
        .output()
        .await
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty());
    found.or_else(|| {
        FALLBACK_PATHS
            .iter()
            .find(|p| std::path::Path::new(p).exists())
            .map(|p| p.to_string())
    })
}

/// The GitHub CLI's token for github.com, if it's installed and signed in.
pub async fn token() -> Option<String> {
    let output = Command::new(gh_binary().await?)
        .args(["auth", "token", "--hostname", "github.com"])
        .output()
        .await
        .ok()
        .filter(|o| o.status.success())?;
    let token = String::from_utf8(output.stdout).ok()?.trim().to_string();
    (!token.is_empty()).then_some(token)
}
