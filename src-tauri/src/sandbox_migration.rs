//! Builds up to v0.1.15 ran in the macOS App Sandbox, which kept all their data
//! under `~/Library/Containers/<bundle id>/Data`. The sandbox also stopped the
//! updater from replacing the app bundle, so it was dropped; this moves that
//! data to the regular locations the unsandboxed app reads.

use std::path::{Path, PathBuf};

const BUNDLE_ID: &str = "com.nootle.desktop";
const SET_ASIDE_SUFFIX: &str = "before-sandbox-migration";

/// Must run before the database opens or the webview starts.
pub fn migrate() {
    if !cfg!(target_os = "macos") || std::env::var_os("APP_SANDBOX_CONTAINER_ID").is_some() {
        return;
    }
    let (Some(home), Some(data_dir)) = (dirs::home_dir(), dirs::data_dir()) else {
        return;
    };
    let container = home.join("Library/Containers").join(BUNDLE_ID).join("Data");
    for (from, to) in moves(&container, &home, &data_dir) {
        if let Err(e) = move_out(&from, &to) {
            eprintln!("Couldn't move {} to {}: {e}", from.display(), to.display());
        }
    }
}

fn moves(container: &Path, home: &Path, data_dir: &Path) -> [(PathBuf, PathBuf); 2] {
    [
        // Database, recordings, and downloaded models.
        (container.join("Library/Application Support/Nootle"), data_dir.join("Nootle")),
        // Webview localStorage (theme, onboarding).
        (
            container.join("Library/WebKit").join(BUNDLE_ID),
            home.join("Library/WebKit").join(BUNDLE_ID),
        ),
    ]
}

/// Moves `from` to `to`, then leaves a symlink at `from` so absolute paths
/// stored in the database (e.g. recordings) keep resolving.
fn move_out(from: &Path, to: &Path) -> std::io::Result<()> {
    // Missing, or already a symlink from an earlier run.
    match std::fs::symlink_metadata(from) {
        Ok(meta) if meta.is_dir() => {}
        _ => return Ok(()),
    }
    // Anything already at `to` (e.g. created by nootle-cli, which was never
    // sandboxed) is kept, not merged, since the container copy is what the app showed.
    if to.exists() {
        let aside = to.with_extension(SET_ASIDE_SUFFIX);
        if aside.exists() {
            return Ok(());
        }
        std::fs::rename(to, aside)?;
    }
    if let Some(parent) = to.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::rename(from, to)?;
    #[cfg(unix)]
    std::os::unix::fs::symlink(to, from)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn moves_data_and_leaves_symlink() {
        let tmp = tempfile::tempdir().unwrap();
        let from = tmp.path().join("container/Nootle");
        let to = tmp.path().join("support/Nootle");
        std::fs::create_dir_all(&from).unwrap();
        std::fs::write(from.join("nootle.db"), "data").unwrap();

        move_out(&from, &to).unwrap();

        assert_eq!(std::fs::read_to_string(to.join("nootle.db")).unwrap(), "data");
        assert!(std::fs::symlink_metadata(&from).unwrap().is_symlink());
        assert_eq!(std::fs::read_to_string(from.join("nootle.db")).unwrap(), "data");

        // A second run is a no-op.
        move_out(&from, &to).unwrap();
        assert!(!to.with_extension(SET_ASIDE_SUFFIX).exists());
    }

    #[test]
    fn sets_existing_destination_aside() {
        let tmp = tempfile::tempdir().unwrap();
        let from = tmp.path().join("container/Nootle");
        let to = tmp.path().join("support/Nootle");
        std::fs::create_dir_all(&from).unwrap();
        std::fs::create_dir_all(&to).unwrap();
        std::fs::write(from.join("nootle.db"), "app").unwrap();
        std::fs::write(to.join("nootle.db"), "cli").unwrap();

        move_out(&from, &to).unwrap();

        assert_eq!(std::fs::read_to_string(to.join("nootle.db")).unwrap(), "app");
        let aside = to.with_extension(SET_ASIDE_SUFFIX);
        assert_eq!(std::fs::read_to_string(aside.join("nootle.db")).unwrap(), "cli");
    }

    #[test]
    fn missing_container_is_a_no_op() {
        let tmp = tempfile::tempdir().unwrap();
        let to = tmp.path().join("support/Nootle");
        move_out(&tmp.path().join("nope"), &to).unwrap();
        assert!(!to.exists());
    }
}
