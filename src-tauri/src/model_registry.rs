use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum ModelCategory {
    Transcription,
    Diarization,
    Embedding,
}

#[derive(Debug, Clone, Serialize)]
pub struct ModelFile {
    /// Name the file is saved as locally (e.g. "encoder.onnx")
    pub local_name: &'static str,
    /// HuggingFace download URL
    pub url: &'static str,
    /// Expected file size in bytes (used for progress calculation)
    pub size_bytes: u64,
    /// SHA-256 hex digest for verification (empty string to skip verification)
    pub sha256: &'static str,
}

#[derive(Debug, Clone, Serialize)]
pub struct ModelVariant {
    pub id: &'static str,
    pub label: &'static str,
    pub files: &'static [ModelFile],
    pub total_size_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ModelDefinition {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub category: ModelCategory,
    /// Subdirectory name under ~/Library/Application Support/Nootle/models/
    pub dir_name: &'static str,
    pub variants: &'static [ModelVariant],
}

// ── Parakeet TDT 0.6B v3 (Transcription) ──────────────────────────────

const PARAKEET_INT8_FILES: &[ModelFile] = &[
    ModelFile {
        local_name: "encoder.onnx",
        url: "https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx/resolve/main/encoder-model.int8.onnx",
        size_bytes: 652_000_000,
        sha256: "",
    },
    ModelFile {
        local_name: "decoder.onnx",
        url: "https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx/resolve/main/decoder_joint-model.int8.onnx",
        size_bytes: 18_200_000,
        sha256: "",
    },
    ModelFile {
        local_name: "vocab.txt",
        url: "https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx/resolve/main/vocab.txt",
        size_bytes: 94_000,
        sha256: "",
    },
    ModelFile {
        local_name: "nemo128.onnx",
        url: "https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx/resolve/main/nemo128.onnx",
        size_bytes: 140_000,
        sha256: "",
    },
];

const PARAKEET_FULL_FILES: &[ModelFile] = &[
    ModelFile {
        local_name: "encoder.onnx",
        url: "https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx/resolve/main/encoder-model.onnx",
        size_bytes: 41_800_000,
        sha256: "",
    },
    ModelFile {
        local_name: "encoder.onnx.data",
        url: "https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx/resolve/main/encoder-model.onnx.data",
        size_bytes: 2_440_000_000,
        sha256: "",
    },
    ModelFile {
        local_name: "decoder.onnx",
        url: "https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx/resolve/main/decoder_joint-model.onnx",
        size_bytes: 72_500_000,
        sha256: "",
    },
    ModelFile {
        local_name: "vocab.txt",
        url: "https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx/resolve/main/vocab.txt",
        size_bytes: 94_000,
        sha256: "",
    },
    ModelFile {
        local_name: "nemo128.onnx",
        url: "https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx/resolve/main/nemo128.onnx",
        size_bytes: 140_000,
        sha256: "",
    },
];

const PARAKEET_VARIANTS: &[ModelVariant] = &[
    ModelVariant {
        id: "int8",
        label: "Quantized (≈670 MB) — faster download, slightly less accurate",
        files: PARAKEET_INT8_FILES,
        total_size_bytes: 670_434_000,
    },
    ModelVariant {
        id: "full",
        label: "Full Precision (≈2.5 GB) — best quality, large download",
        files: PARAKEET_FULL_FILES,
        total_size_bytes: 2_554_534_000,
    },
];

// ── Diarization (Segmentation + Embedding) ─────────────────────────────

const DIARIZATION_FILES: &[ModelFile] = &[
    ModelFile {
        local_name: "segmentation.onnx",
        url: "https://huggingface.co/onnx-community/pyannote-segmentation-3.0/resolve/main/onnx/model.onnx",
        size_bytes: 6_000_000,
        sha256: "",
    },
    ModelFile {
        local_name: "embedding.onnx",
        url: "https://huggingface.co/Wespeaker/wespeaker-voxceleb-resnet34-LM/resolve/main/voxceleb_resnet34_LM.onnx",
        size_bytes: 26_500_000,
        sha256: "",
    },
];

const DIARIZATION_VARIANTS: &[ModelVariant] = &[ModelVariant {
    id: "default",
    label: "Speaker Identification (≈32 MB)",
    files: DIARIZATION_FILES,
    total_size_bytes: 32_500_000,
}];

// ── Embedding (all-MiniLM-L6-v2) ───────────────────────────────────

const EMBEDDING_FILES: &[ModelFile] = &[
    ModelFile {
        local_name: "model.onnx",
        url: "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/onnx/model.onnx",
        size_bytes: 86_000_000,
        sha256: "",
    },
    ModelFile {
        local_name: "vocab.txt",
        url: "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/vocab.txt",
        size_bytes: 232_000,
        sha256: "",
    },
];

const EMBEDDING_VARIANTS: &[ModelVariant] = &[ModelVariant {
    id: "default",
    label: "Sentence Embeddings (≈86 MB)",
    files: EMBEDDING_FILES,
    total_size_bytes: 86_232_000,
}];

// ── Full Registry ──────────────────────────────────────────────────────

pub const MODEL_REGISTRY: &[ModelDefinition] = &[
    ModelDefinition {
        id: "parakeet-tdt-0.6b-v3",
        name: "Parakeet TDT 0.6B v3",
        description: "NVIDIA speech-to-text model for English transcription",
        category: ModelCategory::Transcription,
        dir_name: "parakeet-tdt-0.6b-v3",
        variants: PARAKEET_VARIANTS,
    },
    ModelDefinition {
        id: "diarization",
        name: "Speaker Diarization",
        description: "Identifies who is speaking (pyannote segmentation + WeSpeaker LM embedding)",
        category: ModelCategory::Diarization,
        dir_name: "diarization",
        variants: DIARIZATION_VARIANTS,
    },
    ModelDefinition {
        id: "embedding-minilm",
        name: "Sentence Embeddings",
        description: "all-MiniLM-L6-v2 for semantic search across transcripts",
        category: ModelCategory::Embedding,
        dir_name: "embedding-minilm",
        variants: EMBEDDING_VARIANTS,
    },
];

/// Look up a model definition by ID.
pub fn get_model(id: &str) -> Option<&'static ModelDefinition> {
    MODEL_REGISTRY.iter().find(|m| m.id == id)
}

/// Look up a specific variant within a model.
pub fn get_variant(
    model_id: &str,
    variant_id: &str,
) -> Option<(&'static ModelDefinition, &'static ModelVariant)> {
    let model = get_model(model_id)?;
    let variant = model.variants.iter().find(|v| v.id == variant_id)?;
    Some((model, variant))
}

/// Get the local directory path for a model.
pub fn model_dir(model: &ModelDefinition) -> std::path::PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("Nootle")
        .join("models")
        .join(model.dir_name)
}

/// Check if all files for a variant are present on disk.
pub fn is_variant_downloaded(model: &ModelDefinition, variant: &ModelVariant) -> bool {
    let dir = model_dir(model);
    variant
        .files
        .iter()
        .all(|f| dir.join(f.local_name).exists())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_has_three_models() {
        assert_eq!(MODEL_REGISTRY.len(), 3);
    }

    #[test]
    fn parakeet_has_two_variants() {
        let model = get_model("parakeet-tdt-0.6b-v3").unwrap();
        assert_eq!(model.variants.len(), 2);
        assert_eq!(model.variants[0].id, "int8");
        assert_eq!(model.variants[1].id, "full");
    }

    #[test]
    fn diarization_has_one_variant() {
        let model = get_model("diarization").unwrap();
        assert_eq!(model.variants.len(), 1);
        assert_eq!(model.variants[0].id, "default");
    }

    #[test]
    fn embedding_model_exists() {
        let model = get_model("embedding-minilm").unwrap();
        assert_eq!(model.variants.len(), 1);
        assert_eq!(model.category, ModelCategory::Embedding);
    }

    #[test]
    fn get_variant_works() {
        let (model, variant) = get_variant("parakeet-tdt-0.6b-v3", "int8").unwrap();
        assert_eq!(model.id, "parakeet-tdt-0.6b-v3");
        assert_eq!(variant.id, "int8");
        assert_eq!(variant.files.len(), 4);
    }

    #[test]
    fn get_variant_returns_none_for_bad_id() {
        assert!(get_variant("nonexistent", "int8").is_none());
        assert!(get_variant("parakeet-tdt-0.6b-v3", "nonexistent").is_none());
    }

    #[test]
    fn model_dir_contains_nootle() {
        let model = get_model("parakeet-tdt-0.6b-v3").unwrap();
        let dir = model_dir(model);
        assert!(dir.to_str().unwrap().contains("Nootle"));
        assert!(dir.to_str().unwrap().contains("parakeet-tdt-0.6b-v3"));
    }

    #[test]
    fn is_variant_downloaded_is_consistent() {
        let model = get_model("parakeet-tdt-0.6b-v3").unwrap();
        let variant = &model.variants[0];
        let dir = model_dir(model);
        let all_exist = variant.files.iter().all(|f| dir.join(f.local_name).exists());
        assert_eq!(is_variant_downloaded(model, variant), all_exist);
    }

    #[test]
    fn all_urls_are_huggingface_resolve() {
        for model in MODEL_REGISTRY {
            for variant in model.variants {
                for file in variant.files {
                    assert!(
                        file.url.starts_with("https://huggingface.co/"),
                        "URL should be HuggingFace: {}",
                        file.url
                    );
                    assert!(
                        file.url.contains("/resolve/main/"),
                        "URL should use /resolve/main/ for direct download: {}",
                        file.url
                    );
                }
            }
        }
    }
}
