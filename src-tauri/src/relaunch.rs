//! Relaunching after an update.
//!
//! Tauri's restart runs `open -n`, which starts the new version while this process
//! is still alive. The Dock gives that second instance its own tile, so a Nootle kept
//! in the Dock ends up shown twice. Instead, a detached shell waits for this process to
//! exit and then opens the bundle through LaunchServices, the way Sparkle does.

use std::path::{Path, PathBuf};

/// Waits for the pid in `$1` to exit, up to 30 seconds, then runs `$3 $2`.
const WAIT_THEN_OPEN: &str = r#"i=0; while kill -0 "$1" 2>/dev/null && [ $i -lt 300 ]; do sleep 0.1; i=$((i+1)); done; exec "$3" "$2""#;

/// The `.app` bundle holding `exe`, if it sits at `<bundle>.app/Contents/MacOS/<exe>`.
fn bundle_root(exe: &Path) -> Option<PathBuf> {
    let macos = exe.parent()?;
    let contents = macos.parent()?;
    let bundle = contents.parent()?;
    let is_bundle = macos.file_name()? == "MacOS"
        && contents.file_name()? == "Contents"
        && bundle.extension()? == "app";
    is_bundle.then(|| bundle.to_path_buf())
}

/// Starts a process, outside this one's process group, that opens `bundle` with
/// `opener` once `pid` has exited.
fn spawn_waiting_opener(pid: u32, bundle: &Path, opener: &Path) -> std::io::Result<()> {
    use std::os::unix::process::CommandExt;
    use std::process::{Command, Stdio};

    Command::new("/bin/sh")
        .arg("-c")
        .arg(WAIT_THEN_OPEN)
        .arg("sh")
        .arg(pid.to_string())
        .arg(bundle)
        .arg(opener)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .process_group(0)
        .spawn()
        .map(drop)
}

/// Quits and reopens Nootle. Every restart should go through this, not `request_restart`.
#[tauri::command]
pub fn relaunch(app: tauri::AppHandle) {
    let spawned = cfg!(target_os = "macos")
        && std::env::current_exe()
            .ok()
            .and_then(|exe| bundle_root(&exe))
            .is_some_and(|bundle| {
                spawn_waiting_opener(std::process::id(), &bundle, Path::new("/usr/bin/open"))
                    .inspect_err(|err| tracing::warn!("Falling back to Tauri restart: {err}"))
                    .is_ok()
            });
    if spawned {
        app.exit(0);
    } else {
        app.request_restart();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    #[test]
    fn finds_the_bundle_of_an_installed_app() {
        assert_eq!(
            bundle_root(Path::new("/Applications/Nootle.app/Contents/MacOS/nootle")),
            Some(PathBuf::from("/Applications/Nootle.app"))
        );
    }

    #[test]
    fn ignores_binaries_outside_a_bundle() {
        assert_eq!(bundle_root(Path::new("/repo/target/debug/nootle")), None);
        assert_eq!(
            bundle_root(Path::new("/x/Nootle/Contents/MacOS/nootle")),
            None
        );
    }

    #[test]
    fn opens_only_after_the_old_process_exits() {
        let dir = tempfile::tempdir().unwrap();
        let marker = dir.path().join("opened");
        let opener = dir.path().join("opener.sh");
        std::fs::write(&opener, "#!/bin/sh\ntouch \"$1\"\n").unwrap();
        std::fs::set_permissions(&opener, std::os::unix::fs::PermissionsExt::from_mode(0o755))
            .unwrap();

        let mut old = std::process::Command::new("sleep")
            .arg("30")
            .spawn()
            .unwrap();
        spawn_waiting_opener(old.id(), &marker, &opener).unwrap();

        std::thread::sleep(Duration::from_millis(300));
        assert!(!marker.exists(), "opened while the old process was alive");

        old.kill().unwrap();
        old.wait().unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        while !marker.exists() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(50));
        }
        assert!(marker.exists(), "never opened after the old process exited");
    }
}
