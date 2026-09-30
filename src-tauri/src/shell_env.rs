//! GUI apps launched from Finder/Dock inherit launchd's minimal PATH
//! (`/usr/bin:/bin:/usr/sbin:/sbin`), so CLIs installed via Homebrew, npm,
//! nvm, or the Claude installer (`~/.local/bin`) are invisible to
//! `Command::new`. Merge in the user's login-shell PATH plus common install
//! dirs so detection and spawning of `claude` / `codex` work.

use std::io::Read;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::Duration;

const SHELL_TIMEOUT: Duration = Duration::from_secs(3);
const MARKER: &str = "__NOOTLE_PATH__";

/// Must run before any long-lived threads are spawned (it mutates the process env).
pub fn fix_path() {
    if !cfg!(target_os = "macos") {
        return;
    }
    let current = std::env::var_os("PATH").unwrap_or_default();
    // Login-shell entries first so the user's preferred tools win, as in their terminal.
    let mut dirs: Vec<PathBuf> = Vec::new();
    for dir in login_shell_path()
        .into_iter()
        .chain(std::env::split_paths(&current))
        .chain(fallback_dirs())
    {
        if !dirs.contains(&dir) {
            dirs.push(dir);
        }
    }

    if let Ok(joined) = std::env::join_paths(&dirs) {
        std::env::set_var("PATH", joined);
    }
}

fn login_shell_path() -> Vec<PathBuf> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    // Markers delimit the value from any noise printed by rc files.
    let script = format!("printf '{MARKER}%s{MARKER}' \"$PATH\"");
    let Ok(mut child) = Command::new(shell)
        .args(["-ilc", &script])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    else {
        return vec![];
    };

    // Drain stdout concurrently so noisy rc files can't fill the pipe and stall.
    let mut stdout = child.stdout.take().expect("stdout is piped");
    let (tx, rx) = mpsc::channel();
    // Not joined: a daemon started by an rc file could hold the pipe open forever.
    std::thread::spawn(move || {
        let mut out = String::new();
        let _ = stdout.read_to_string(&mut out);
        let _ = tx.send(out);
    });

    // An interactive rc file could block; don't let it hang startup.
    let out = rx.recv_timeout(SHELL_TIMEOUT).ok();
    if out.is_none() {
        tracing::warn!("Timed out reading PATH from login shell");
        let _ = child.kill();
    }
    let _ = child.wait();

    out.as_deref()
        .and_then(extract_marked)
        .map(|p| std::env::split_paths(&p).collect())
        .unwrap_or_default()
}

fn extract_marked(out: &str) -> Option<String> {
    let rest = &out[out.find(MARKER)? + MARKER.len()..];
    let value = &rest[..rest.find(MARKER)?];
    (!value.is_empty()).then(|| value.to_string())
}

fn fallback_dirs() -> Vec<PathBuf> {
    let mut dirs = vec![
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
    ];
    if let Some(home) = dirs::home_dir() {
        for rel in [
            ".local/bin",
            ".claude/local",
            ".npm-global/bin",
            ".bun/bin",
            ".volta/bin",
            ".cargo/bin",
        ] {
            dirs.push(home.join(rel));
        }
    }
    dirs.retain(|d| d.is_dir());
    dirs
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_value_between_markers_ignoring_rc_noise() {
        let out = format!("welcome!\n{MARKER}/a:/b{MARKER}");
        assert_eq!(extract_marked(&out).as_deref(), Some("/a:/b"));
    }

    #[test]
    fn missing_or_empty_marker_yields_none() {
        assert_eq!(extract_marked("no markers"), None);
        assert_eq!(extract_marked(&format!("{MARKER}{MARKER}")), None);
    }
}
