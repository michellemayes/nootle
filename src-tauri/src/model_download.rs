use crate::model_registry::{self, ModelDefinition, ModelFile, ModelVariant};
use futures_util::StreamExt;
use reqwest::Client;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::path::Path;
use tauri::Emitter;
use tokio_util::sync::CancellationToken;

/// Event payload emitted during download.
#[derive(Debug, Clone, Serialize)]
pub struct DownloadProgress {
    pub model_id: String,
    pub state: DownloadState,
    pub current_file: String,
    pub file_bytes_downloaded: u64,
    pub file_total_bytes: u64,
    pub overall_percent: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DownloadState {
    Downloading,
    Verifying,
    Complete,
    Error { message: String },
    Cancelled,
}

/// Status of a model on disk.
#[derive(Debug, Clone, Serialize)]
pub struct ModelOnDiskStatus {
    pub model_id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub downloaded: bool,
    /// The variant in use.
    pub variant_id: Option<String>,
    /// Everything in the model's folder, leftovers included.
    pub size_on_disk: u64,
    pub installed: Vec<InstalledVariant>,
    /// Variants that can be downloaded alongside the installed ones.
    pub downloadable: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct InstalledVariant {
    pub variant_id: String,
    /// What deleting this variant frees (files it shares stay).
    pub size_on_disk: u64,
}

/// Shared download state — holds cancellation token for active download.
pub struct DownloadManager {
    pub(crate) cancel_token: Option<CancellationToken>,
}

impl Default for DownloadManager {
    fn default() -> Self {
        Self::new()
    }
}

impl DownloadManager {
    pub fn new() -> Self {
        Self { cancel_token: None }
    }

    pub fn cancel(&mut self) {
        if let Some(token) = self.cancel_token.take() {
            token.cancel();
        }
    }

    pub fn new_token(&mut self) -> CancellationToken {
        self.cancel();
        let token = CancellationToken::new();
        self.cancel_token = Some(token.clone());
        token
    }

    /// Forgets a download that returned. A cancelled one was already taken
    /// out or replaced by a newer download, which must stay cancellable.
    pub fn finish(&mut self, token: &CancellationToken) {
        if !token.is_cancelled() {
            self.cancel_token = None;
        }
    }
}

/// Download all files for a model variant.
///
/// Emits `model-download-progress` events to the Tauri app handle.
/// Supports resume (checks for `.part` files) and cancellation.
pub async fn download_variant(
    app: tauri::AppHandle,
    model: &ModelDefinition,
    variant: &ModelVariant,
    cancel: CancellationToken,
) -> Result<(), String> {
    let model_dir = model_registry::model_dir(model);
    std::fs::create_dir_all(&model_dir).map_err(|e| format!("Failed to create model dir: {e}"))?;

    let client = Client::builder()
        .connect_timeout(std::time::Duration::from_secs(30))
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;
    let total_bytes: u64 = variant.files.iter().map(|f| f.size_bytes).sum();
    let mut cumulative_bytes: u64 = 0;

    for file in variant.files {
        if cancel.is_cancelled() {
            emit_progress(
                &app,
                model.id,
                DownloadState::Cancelled,
                file.local_name,
                0,
                0,
                0.0,
            );
            return Err("Download cancelled".to_string());
        }

        let result = download_single_file(
            &app,
            &client,
            model.id,
            file,
            &model_dir,
            &cancel,
            cumulative_bytes,
            total_bytes,
        )
        .await;

        match result {
            Ok(()) => {
                cumulative_bytes += file.size_bytes;
            }
            Err(e) => {
                emit_progress(
                    &app,
                    model.id,
                    DownloadState::Error { message: e.clone() },
                    file.local_name,
                    0,
                    file.size_bytes,
                    cumulative_bytes as f64 / total_bytes as f64,
                );
                return Err(e);
            }
        }
    }

    emit_progress(
        &app,
        model.id,
        DownloadState::Complete,
        "",
        total_bytes,
        total_bytes,
        1.0,
    );

    Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn download_single_file(
    app: &tauri::AppHandle,
    client: &Client,
    model_id: &str,
    file: &ModelFile,
    model_dir: &Path,
    cancel: &CancellationToken,
    cumulative_bytes: u64,
    total_bytes: u64,
) -> Result<(), String> {
    let final_path = model_dir.join(file.local_name);
    let part_path = model_dir.join(format!("{}.part", file.local_name));

    // Check if already downloaded
    if final_path.exists() {
        return Ok(());
    }
    // Some models are folders (Core ML packages).
    if let Some(parent) = final_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create model dir: {e}"))?;
    }

    // Resume support: check existing .part file size
    let existing_bytes = if part_path.exists() {
        std::fs::metadata(&part_path).map(|m| m.len()).unwrap_or(0)
    } else {
        0
    };

    // Build request with optional Range header for resume
    let mut request = client.get(file.url);
    if existing_bytes > 0 {
        request = request.header("Range", format!("bytes={}-", existing_bytes));
        tracing::info!(
            "Resuming download of {} from byte {}",
            file.local_name,
            existing_bytes
        );
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {e}"))?;
    let status_code = response.status().as_u16();

    if !(200..=299).contains(&status_code) && status_code != 206 {
        return Err(format!(
            "HTTP {} when downloading {}",
            status_code, file.local_name
        ));
    }

    // Warn if server ignored Range header and returned full file (200 instead of 206)
    if existing_bytes > 0 && status_code == 200 {
        tracing::warn!(
            "Server returned 200 instead of 206 for {}; discarding {} bytes of partial download and restarting",
            file.local_name,
            existing_bytes
        );
    }

    // Open file for writing (append if resuming)
    let mut out_file = if existing_bytes > 0 && status_code == 206 {
        tokio::fs::OpenOptions::new()
            .append(true)
            .open(&part_path)
            .await
            .map_err(|e| format!("Failed to open part file: {e}"))?
    } else {
        // Start fresh
        tokio::fs::File::create(&part_path)
            .await
            .map_err(|e| format!("Failed to create part file: {e}"))?
    };

    let mut stream = response.bytes_stream();
    let mut downloaded = if status_code == 206 {
        existing_bytes
    } else {
        0
    };
    let mut last_emitted_pct: i32 = -1;

    while let Some(chunk_result) = stream.next().await {
        if cancel.is_cancelled() {
            return Err("Download cancelled".to_string());
        }

        let chunk = chunk_result.map_err(|e| format!("Stream error: {e}"))?;
        tokio::io::AsyncWriteExt::write_all(&mut out_file, &chunk)
            .await
            .map_err(|e| format!("Write error: {e}"))?;

        downloaded += chunk.len() as u64;

        // Emit progress at most every 1%
        let overall_pct = (cumulative_bytes + downloaded) as f64 / total_bytes as f64;
        let pct_int = (overall_pct * 100.0) as i32;
        if pct_int > last_emitted_pct {
            last_emitted_pct = pct_int;
            emit_progress(
                app,
                model_id,
                DownloadState::Downloading,
                file.local_name,
                downloaded,
                file.size_bytes,
                overall_pct,
            );
        }
    }

    drop(out_file);

    // Every registry file is pinned (a registry test enforces it), so nothing
    // unverified ever lands in the models folder.
    emit_progress(
        app,
        model_id,
        DownloadState::Verifying,
        file.local_name,
        downloaded,
        file.size_bytes,
        (cumulative_bytes + file.size_bytes) as f64 / total_bytes as f64,
    );

    let hash = hash_file(&part_path).await?;
    if hash != file.sha256 {
        let _ = std::fs::remove_file(&part_path);
        return Err(format!(
            "SHA-256 mismatch for {}: expected {}, got {}",
            file.local_name, file.sha256, hash
        ));
    }

    // Atomic rename .part -> final
    std::fs::rename(&part_path, &final_path)
        .map_err(|e| format!("Failed to rename part file: {e}"))?;

    Ok(())
}

async fn hash_file(path: &Path) -> Result<String, String> {
    let data = tokio::fs::read(path)
        .await
        .map_err(|e| format!("Failed to read file for hashing: {e}"))?;
    let mut hasher = Sha256::new();
    hasher.update(&data);
    Ok(format!("{:x}", hasher.finalize()))
}

fn emit_progress(
    app: &tauri::AppHandle,
    model_id: &str,
    state: DownloadState,
    current_file: &str,
    file_bytes_downloaded: u64,
    file_total_bytes: u64,
    overall_percent: f64,
) {
    let _ = app.emit(
        "model-download-progress",
        DownloadProgress {
            model_id: model_id.to_string(),
            state,
            current_file: current_file.to_string(),
            file_bytes_downloaded,
            file_total_bytes,
            overall_percent,
        },
    );
}

/// Delete one variant's files, keeping any another installed variant uses.
pub fn delete_variant_files(model: &ModelDefinition, variant: &ModelVariant) -> Result<(), String> {
    delete_variant_files_in(&model_registry::model_dir(model), model, variant)
}

fn delete_variant_files_in(
    dir: &Path,
    model: &ModelDefinition,
    variant: &ModelVariant,
) -> Result<(), String> {
    let installed = model_registry::installed_variants_in(dir, model);
    for entry in entries_only_used_by(&installed, variant) {
        crate::storage::remove_path(&dir.join(entry))
            .map_err(|e| format!("Failed to delete {entry}: {e}"))?;
    }
    // Drop the folder once nothing is left in it.
    let _ = std::fs::remove_dir(dir);
    Ok(())
}

/// The entries in the model folder that only `variant`, of the `installed`
/// ones, uses.
fn entries_only_used_by(
    installed: &[&'static ModelVariant],
    variant: &ModelVariant,
) -> Vec<&'static str> {
    let shared: std::collections::HashSet<_> = installed
        .iter()
        .filter(|v| v.id != variant.id)
        .flat_map(|v| model_registry::top_level_entries(v))
        .collect();
    let mut entries: Vec<_> = model_registry::top_level_entries(variant)
        .filter(|e| !shared.contains(e))
        .collect();
    entries.dedup();
    entries
}

/// Get on-disk status for all models in the registry.
pub fn get_all_model_status() -> Vec<ModelOnDiskStatus> {
    model_registry::MODEL_REGISTRY
        .iter()
        .map(|model| {
            let dir = model_registry::model_dir(model);
            let installed = model_registry::installed_variants_in(&dir, model);
            let variant = model_registry::in_use(&installed);
            let downloadable = model
                .variants
                .iter()
                .filter(|v| model_registry::is_variant_supported(v))
                .filter(|v| {
                    !installed
                        .iter()
                        .any(|i| i.id == v.id || model_registry::variants_conflict(i, v))
                })
                .map(|v| v.id.to_string())
                .collect();

            ModelOnDiskStatus {
                model_id: model.id.to_string(),
                name: model.name.to_string(),
                description: model.description.to_string(),
                category: format!("{:?}", model.category),
                downloaded: variant.is_some(),
                variant_id: variant.map(|v| v.id.to_string()),
                size_on_disk: crate::storage::path_size(&dir),
                installed: installed
                    .iter()
                    .map(|v| InstalledVariant {
                        variant_id: v.id.to_string(),
                        size_on_disk: entries_only_used_by(&installed, v)
                            .iter()
                            .map(|e| crate::storage::path_size(&dir.join(e)))
                            .sum(),
                    })
                    .collect(),
                downloadable,
            }
        })
        .collect()
}

/// Leftovers in the models folder: folders of models Nootle no longer
/// uses, files no variant saves, and downloads abandoned partway.
pub fn leftover_paths() -> Vec<std::path::PathBuf> {
    leftover_paths_in(&model_registry::models_root())
}

fn leftover_paths_in(root: &Path) -> Vec<std::path::PathBuf> {
    let mut leftovers = Vec::new();
    for entry in crate::storage::read_dir_paths(root) {
        let name = crate::storage::file_name(&entry);
        let Some(model) = model_registry::MODEL_REGISTRY
            .iter()
            .find(|m| m.dir_name == name)
        else {
            leftovers.push(entry);
            continue;
        };
        let known: std::collections::HashSet<_> = model
            .variants
            .iter()
            .flat_map(model_registry::top_level_entries)
            .collect();
        for path in crate::storage::read_dir_paths(&entry) {
            if known.contains(crate::storage::file_name(&path)) {
                if path.is_dir() {
                    collect_abandoned(&path, &mut leftovers);
                }
            } else if !crate::storage::modified_within(&path, PART_FILE_GRACE) {
                leftovers.push(path);
            }
        }
    }
    leftovers
}

/// A partial download this recent may still be running (the speech
/// detector is fetched in the background at launch).
const PART_FILE_GRACE: std::time::Duration = std::time::Duration::from_secs(10 * 60);

/// Abandoned downloads and Core ML compiles inside a variant's folder.
fn collect_abandoned(dir: &Path, out: &mut Vec<std::path::PathBuf>) {
    for path in crate::storage::read_dir_paths(dir) {
        let name = crate::storage::file_name(&path);
        if name.ends_with(".part") || name.ends_with(".partial") {
            if !crate::storage::modified_within(&path, PART_FILE_GRACE) {
                out.push(path);
            }
        } else if path.is_dir() {
            collect_abandoned(&path, out);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    use model_registry::install;

    #[test]
    fn deleting_bark_keeps_parakeet_and_the_shared_speech_detector() {
        let dir = tempfile::tempdir().unwrap();
        let model = model_registry::get_model("parakeet-tdt-0.6b-v3").unwrap();
        let (_, int8) = model_registry::get_variant(model.id, "int8").unwrap();
        let (_, bark) = model_registry::get_variant(model.id, "bark").unwrap();
        install(dir.path(), int8);
        install(dir.path(), bark);
        std::fs::create_dir_all(dir.path().join("bark/BarkEncoder.mlmodelc")).unwrap();

        delete_variant_files_in(dir.path(), model, bark).unwrap();

        assert!(!dir.path().join("bark").exists());
        let installed = model_registry::installed_variants_in(dir.path(), model);
        assert_eq!(installed.len(), 1);
        assert_eq!(installed[0].id, "int8");
    }

    #[test]
    fn deleting_the_last_variant_removes_the_folder() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("model");
        let model = model_registry::get_model("parakeet-tdt-0.6b-v3").unwrap();
        let (_, full) = model_registry::get_variant(model.id, "full").unwrap();
        install(&dir, full);

        delete_variant_files_in(&dir, model, full).unwrap();

        assert!(!dir.exists());
    }

    #[test]
    fn leftovers_are_old_models_stray_files_and_abandoned_downloads() {
        let root = tempfile::tempdir().unwrap();
        let root = root.path();
        let model = model_registry::get_model("parakeet-tdt-0.6b-v3").unwrap();
        let dir = root.join(model.dir_name);
        let (_, int8) = model_registry::get_variant(model.id, "int8").unwrap();
        install(&dir, int8);
        std::fs::create_dir_all(root.join("whisper-old")).unwrap();
        for stray in ["encoder-model.onnx.data.part", "bark/vocab.json.part"] {
            crate::storage::write_old_file(&dir.join(stray));
        }
        // Still downloading.
        std::fs::write(dir.join("silero_vad.onnx.part"), b"x").unwrap();

        let mut found = leftover_paths_in(root);
        found.sort();
        let mut expected = vec![
            dir.join("bark/vocab.json.part"),
            dir.join("encoder-model.onnx.data.part"),
            root.join("whisper-old"),
        ];
        expected.sort();
        assert_eq!(found, expected);
    }

    // Found by formal/tla/CancelRegistry.tla (MODE "download").
    #[test]
    fn a_replaced_download_finishing_keeps_the_new_one_cancellable() {
        let mut mgr = DownloadManager::new();
        let first = mgr.new_token();
        // Downloading a second model stops the first...
        let second = mgr.new_token();
        assert!(first.is_cancelled());
        // ...whose command then returns and gives the slot back.
        mgr.finish(&first);
        mgr.cancel();
        assert!(
            second.is_cancelled(),
            "Cancel no longer reaches the running download"
        );
    }
}
