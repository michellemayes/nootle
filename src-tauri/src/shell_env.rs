//! GUI apps launched from Finder/Dock inherit launchd's minimal PATH
//! (`/usr/bin:/bin:/usr/sbin:/sbin`), so CLIs installed via Homebrew, npm,
//! nvm, or the Claude installer (`~/.local/bin`) are invisible to
//! `Command::new`. Merge in the user's login-shell PATH plus common install
//! dirs so detection and spawning of `claude` / `codex` work.

use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::Duration;

const SHELL_TIMEOUT: Duration = Duration::from_secs(5);
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
        tracing::info!("PATH: {}", joined.to_string_lossy());
        std::env::set_var("PATH", joined);
    }
}

fn login_shell_path() -> Vec<PathBuf> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
    // `printenv` prints PATH colon-joined in every shell (fish's `$PATH` is a list),
    // and the markers delimit it from any noise printed by rc files.
    let script = format!("echo {MARKER}; /usr/bin/printenv PATH; echo {MARKER}");
    let Ok(mut child) = Command::new(&shell)
        .args(["-ilc", &script])
        // Stop oh-my-zsh update prompts and tmux autostart from hijacking the shell.
        .env("DISABLE_AUTO_UPDATE", "true")
        .env("ZSH_TMUX_AUTOSTARTED", "true")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    else {
        tracing::warn!("Could not spawn login shell {shell}");
        return vec![];
    };

    let mut stdout = child.stdout.take().expect("stdout is piped");
    let (tx, rx) = mpsc::channel();
    // Not joined: a daemon started by an rc file (ssh-agent, gpg-agent, ...) can
    // inherit the pipe and hold it open forever, so return as soon as the closing
    // marker arrives instead of waiting for EOF.
    std::thread::spawn(move || {
        let mut out = String::new();
        let mut buf = [0u8; 4096];
        let value = loop {
            match stdout.read(&mut buf) {
                Ok(0) | Err(_) => break None,
                Ok(n) => {
                    out.push_str(&String::from_utf8_lossy(&buf[..n]));
                    if let Some(v) = extract_marked(&out) {
                        break Some(v);
                    }
                }
            }
        };
        let _ = tx.send(value);
    });

    // An interactive rc file could block; don't let it hang startup.
    let value = rx.recv_timeout(SHELL_TIMEOUT).unwrap_or_else(|_| {
        tracing::warn!("Timed out reading PATH from login shell {shell}");
        None
    });
    let _ = child.kill();
    let _ = child.wait();

    value
        .map(|p| std::env::split_paths(&p).collect())
        .unwrap_or_default()
}

fn extract_marked(out: &str) -> Option<String> {
    let rest = &out[out.find(MARKER)? + MARKER.len()..];
    let value = rest[..rest.find(MARKER)?].trim();
    (!value.is_empty()).then(|| value.to_string())
}

/// Common install locations, appended after the login-shell PATH as a safety net.
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
            ".yarn/bin",
            ".asdf/shims",
            ".local/share/mise/shims",
            "Library/pnpm",
            "Library/Application Support/fnm/aliases/default/bin",
            ".local/share/fnm/aliases/default/bin",
        ] {
            dirs.push(home.join(rel));
        }
        let nvm_dir = std::env::var_os("NVM_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join(".nvm"));
        dirs.extend(nvm_bin_dirs(&nvm_dir.join("versions/node")));
    }
    dirs.retain(|d| d.is_dir());
    dirs
}

/// `<nvm>/versions/node/v*/bin`, newest version first. npm-installed CLIs
/// (`claude`, `codex`) and the `node` they need live here under nvm.
fn nvm_bin_dirs(versions: &Path) -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir(versions) else {
        return vec![];
    };
    let mut found: Vec<(Vec<u64>, PathBuf)> = entries
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().into_string().ok()?;
            let version = name
                .trim_start_matches('v')
                .split('.')
                .map(|n| n.parse().ok())
                .collect::<Option<Vec<u64>>>()?;
            Some((version, e.path().join("bin")))
        })
        .collect();
    found.sort_by(|a, b| b.0.cmp(&a.0));
    found.into_iter().map(|(_, dir)| dir).collect()
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
    fn trims_newlines_from_printenv_output() {
        let out = format!("{MARKER}\n/a:/b\n{MARKER}\n");
        assert_eq!(extract_marked(&out).as_deref(), Some("/a:/b"));
    }

    #[test]
    fn unterminated_marker_yields_none() {
        assert_eq!(extract_marked(&format!("{MARKER}\n/a:/b")), None);
    }

    #[test]
    fn nvm_dirs_sorted_newest_first() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        for v in ["v9.11.2", "v22.1.0", "v18.20.4", "system"] {
            std::fs::create_dir_all(root.join(v)).unwrap();
        }
        let dirs = nvm_bin_dirs(root);
        assert_eq!(
            dirs,
            ["v22.1.0", "v18.20.4", "v9.11.2"].map(|v| root.join(v).join("bin"))
        );
    }

    #[test]
    fn missing_or_empty_marker_yields_none() {
        assert_eq!(extract_marked("no markers"), None);
        assert_eq!(extract_marked(&format!("{MARKER}{MARKER}")), None);
    }
}
