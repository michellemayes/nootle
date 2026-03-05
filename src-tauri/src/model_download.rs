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
    pub variant_id: Option<String>,
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

    pub fn clear_token(&mut self) {
        self.cancel_token = None;
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

    // Verify SHA-256 if provided
    if !file.sha256.is_empty() {
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

/// Delete all model files for a given model.
pub fn delete_model_files(model: &ModelDefinition) -> Result<(), String> {
    let dir = model_registry::model_dir(model);
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| format!("Failed to delete model: {e}"))?;
    }
    Ok(())
}

/// Get on-disk status for all models in the registry.
pub fn get_all_model_status() -> Vec<ModelOnDiskStatus> {
    model_registry::MODEL_REGISTRY
        .iter()
        .map(|model| {
            let dir = model_registry::model_dir(model);
            let mut downloaded = false;
            let mut variant_id = None;
            let mut size_on_disk: u64 = 0;

            for variant in model.variants {
                if model_registry::is_variant_downloaded(model, variant) {
                    downloaded = true;
                    variant_id = Some(variant.id.to_string());
                    // Calculate actual size on disk
                    for file in variant.files {
                        if let Ok(meta) = std::fs::metadata(dir.join(file.local_name)) {
                            size_on_disk += meta.len();
                        }
                    }
                    break;
                }
            }

            ModelOnDiskStatus {
                model_id: model.id.to_string(),
                name: model.name.to_string(),
                description: model.description.to_string(),
                category: format!("{:?}", model.category),
                downloaded,
                variant_id,
                size_on_disk,
            }
        })
        .collect()
}
