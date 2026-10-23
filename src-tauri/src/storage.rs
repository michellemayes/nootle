//! What Nootle keeps on disk, and cleaning up what it no longer needs:
//! leftover model downloads, audio from deleted meetings, and old logs.

use crate::db::Database;
use serde::Serialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::Duration;

#[derive(Debug, Clone, Default, Serialize)]
pub struct StorageUsage {
    pub models_bytes: u64,
    pub recordings_bytes: u64,
    pub logs_bytes: u64,
    /// Partial downloads and models Nootle no longer uses.
    pub model_leftover_bytes: u64,
    /// Audio and snapshots whose meeting was deleted.
    pub orphaned_recording_bytes: u64,
    /// The rotated log file.
    pub old_log_bytes: u64,
}

pub fn usage(db: &Database) -> StorageUsage {
    let recordings = crate::ops::recordings_dir().ok();
    StorageUsage {
        models_bytes: path_size(&crate::model_registry::models_root()),
        recordings_bytes: recordings.as_deref().map_or(0, path_size),
        logs_bytes: path_size(&crate::logs_dir()),
        model_leftover_bytes: total_size(&crate::model_download::leftover_paths()),
        orphaned_recording_bytes: total_size(&orphaned_recordings(db)),
        old_log_bytes: path_size(&crate::old_log_path()),
    }
}

/// Deletes everything `usage` counts as reclaimable. Returns the bytes freed.
pub fn clean_up(db: &Database) -> u64 {
    let mut paths = crate::model_download::leftover_paths();
    paths.extend(orphaned_recordings(db));
    paths.push(crate::old_log_path());
    paths
        .iter()
        .map(|path| {
            let size = path_size(path);
            match remove_path(path) {
                Ok(()) => size,
                Err(e) => {
                    tracing::warn!("Couldn't delete {}: {e}", path.display());
                    0
                }
            }
        })
        .sum()
}

/// A recording this recent may belong to a meeting still being created.
const ORPHAN_GRACE: Duration = Duration::from_secs(60 * 60);

fn orphaned_recordings(db: &Database) -> Vec<PathBuf> {
    let (Ok(dir), Ok(meetings)) = (crate::ops::recordings_dir(), db.meeting_audio_paths()) else {
        return Vec::new();
    };
    orphaned_recordings_in(&dir, &meetings)
}

/// Every file in the recordings folder is named after its meeting
/// (`<id>.wav`, `<id>.stems.wav`, `<id>.recap.json`, `snapshots/<id>/`), so
/// one whose meeting is gone was left behind.
fn orphaned_recordings_in(dir: &Path, meetings: &[(String, Option<String>)]) -> Vec<PathBuf> {
    let ids: HashSet<&str> = meetings.iter().map(|(id, _)| id.as_str()).collect();
    let audio: HashSet<PathBuf> = meetings
        .iter()
        .filter_map(|(_, path)| path.as_deref().map(PathBuf::from))
        .collect();
    let orphaned = |path: &Path, id: &str| {
        !ids.contains(id) && !audio.contains(path) && !modified_within(path, ORPHAN_GRACE)
    };

    let mut found = Vec::new();
    for path in read_dir_paths(dir) {
        let name = file_name(&path);
        if name == "snapshots" && path.is_dir() {
            found.extend(
                read_dir_paths(&path)
                    .into_iter()
                    .filter(|p| orphaned(p, file_name(p))),
            );
        } else if orphaned(&path, name.split('.').next().unwrap_or(name)) {
            found.push(path);
        }
    }
    found
}

/// Size of a file, or of everything in a folder.
pub fn path_size(path: &Path) -> u64 {
    match std::fs::symlink_metadata(path) {
        Ok(meta) if meta.is_dir() => read_dir_paths(path).iter().map(|p| path_size(p)).sum(),
        Ok(meta) => meta.len(),
        Err(_) => 0,
    }
}

fn total_size(paths: &[PathBuf]) -> u64 {
    paths.iter().map(|p| path_size(p)).sum()
}

/// Deletes a file or folder; one that's already gone is fine.
pub fn remove_path(path: &Path) -> std::io::Result<()> {
    let result = match std::fs::symlink_metadata(path) {
        Ok(meta) if meta.is_dir() => std::fs::remove_dir_all(path),
        Ok(_) => std::fs::remove_file(path),
        Err(e) => Err(e),
    };
    match result {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        other => other,
    }
}

pub fn read_dir_paths(dir: &Path) -> Vec<PathBuf> {
    std::fs::read_dir(dir)
        .map(|entries| entries.flatten().map(|e| e.path()).collect())
        .unwrap_or_default()
}

pub fn file_name(path: &Path) -> &str {
    path.file_name().and_then(|n| n.to_str()).unwrap_or("")
}

pub fn modified_within(path: &Path, window: Duration) -> bool {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .is_ok_and(|t| t.elapsed().map_or(true, |age| age < window))
}

/// Writes a file, and its folder, dated two hours ago.
#[cfg(test)]
pub(crate) fn write_old_file(path: &Path) {
    let parent = path.parent().unwrap();
    std::fs::create_dir_all(parent).unwrap();
    std::fs::write(path, b"x").unwrap();
    let old = std::time::SystemTime::now() - Duration::from_secs(2 * 3600);
    for p in [path, parent] {
        std::fs::File::open(p).unwrap().set_modified(old).unwrap();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_files_of_deleted_meetings_are_orphaned() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();
        for name in [
            "kept.wav",
            "kept.stems.wav",
            "kept.recap.json",
            "gone.wav",
            "gone.recap.wav",
            "imported-elsewhere.m4a",
            "snapshots/kept/1.jpg",
            "snapshots/gone/1.jpg",
        ] {
            write_old_file(&dir.join(name));
        }
        // A meeting that's still being set up.
        std::fs::write(dir.join("new.wav"), b"audio").unwrap();
        let imported = dir.join("imported-elsewhere.m4a");
        let meetings = vec![
            ("kept".to_string(), None),
            (
                "other".to_string(),
                Some(imported.to_string_lossy().into_owned()),
            ),
        ];

        let mut found = orphaned_recordings_in(dir, &meetings);
        found.sort();
        let mut expected = vec![
            dir.join("gone.recap.wav"),
            dir.join("gone.wav"),
            dir.join("snapshots/gone"),
        ];
        expected.sort();
        assert_eq!(found, expected);
    }

    #[test]
    fn sizes_add_up_through_folders() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(tmp.path().join("a/b")).unwrap();
        std::fs::write(tmp.path().join("a/one"), b"12345").unwrap();
        std::fs::write(tmp.path().join("a/b/two"), b"123").unwrap();
        assert_eq!(path_size(tmp.path()), 8);
        assert_eq!(path_size(&tmp.path().join("missing")), 0);
    }

    #[test]
    fn removing_a_missing_path_is_fine() {
        let tmp = tempfile::tempdir().unwrap();
        remove_path(&tmp.path().join("missing")).unwrap();
        std::fs::create_dir_all(tmp.path().join("d/e")).unwrap();
        remove_path(&tmp.path().join("d")).unwrap();
        assert!(!tmp.path().join("d").exists());
    }
}
