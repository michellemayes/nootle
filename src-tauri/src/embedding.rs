//! Sentence embedding engine using all-MiniLM-L6-v2 via ONNX Runtime.
//!
//! Produces 384-dimensional normalized embeddings for semantic search.

use anyhow::{anyhow, Context};
use ort::session::Session;
use ort::value::Tensor;
use std::path::PathBuf;

const MODEL_DIR_NAME: &str = "embedding-minilm";
const EMBEDDING_DIM: usize = 384;

pub struct EmbeddingEngine {
    session: Session,
    tokenizer: Tokenizer,
}

struct Tokenizer {
    vocab: std::collections::HashMap<String, i64>,
    cls_id: i64,
    sep_id: i64,
    unk_id: i64,
}

impl Tokenizer {
    fn load(vocab_path: &std::path::Path) -> anyhow::Result<Self> {
        let content =
            std::fs::read_to_string(vocab_path).context("Failed to read tokenizer vocab")?;
        let vocab: std::collections::HashMap<String, i64> = content
            .lines()
            .enumerate()
            .map(|(i, line)| (line.to_string(), i as i64))
            .collect();
        let cls_id = *vocab.get("[CLS]").unwrap_or(&101);
        let sep_id = *vocab.get("[SEP]").unwrap_or(&102);
        let unk_id = *vocab.get("[UNK]").unwrap_or(&100);
        Ok(Self {
            vocab,
            cls_id,
            sep_id,
            unk_id,
        })
    }

    fn encode(&self, text: &str, max_length: usize) -> (Vec<i64>, Vec<i64>, Vec<i64>) {
        let mut input_ids = vec![self.cls_id];
        let lower = text.to_lowercase();
        for word in lower.split_whitespace() {
            if input_ids.len() >= max_length - 1 {
                break;
            }
            let id = self.vocab.get(word).copied().unwrap_or(self.unk_id);
            input_ids.push(id);
        }
        input_ids.push(self.sep_id);
        let len = input_ids.len();
        let attention_mask = vec![1i64; len];
        let token_type_ids = vec![0i64; len];
        (input_ids, attention_mask, token_type_ids)
    }
}

impl EmbeddingEngine {
    pub fn model_dir() -> PathBuf {
        dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("Nootle")
            .join("models")
            .join(MODEL_DIR_NAME)
    }

    pub fn is_available() -> bool {
        let dir = Self::model_dir();
        dir.join("model.onnx").exists() && dir.join("vocab.txt").exists()
    }

    pub fn load() -> anyhow::Result<Self> {
        let model_dir = Self::model_dir();
        if !model_dir.exists() {
            return Err(anyhow!(
                "Embedding model not found. Please download it first."
            ));
        }

        let model_path = model_dir.join("model.onnx");
        let vocab_path = model_dir.join("vocab.txt");

        let session = Session::builder()?
            .with_execution_providers([
                ort::execution_providers::CoreMLExecutionProvider::default().build(),
            ])?
            .commit_from_file(&model_path)
            .context("Failed to load embedding ONNX model")?;

        let tokenizer = Tokenizer::load(&vocab_path)?;

        Ok(Self { session, tokenizer })
    }

    pub fn embed(&mut self, text: &str) -> anyhow::Result<Vec<f32>> {
        let (input_ids, attention_mask, token_type_ids) = self.tokenizer.encode(text, 512);
        let seq_len = input_ids.len();

        let ids_tensor = Tensor::from_array(([1, seq_len], input_ids))?;
        let mask_tensor = Tensor::from_array(([1, seq_len], attention_mask))?;
        let types_tensor = Tensor::from_array(([1, seq_len], token_type_ids))?;

        let outputs = self.session.run(ort::inputs![
            "input_ids" => ids_tensor,
            "attention_mask" => mask_tensor,
            "token_type_ids" => types_tensor,
        ])?;

        // Output shape: (1, seq_len, 384) -- mean pool over seq_len
        let (shape, output_data) = outputs[0]
            .try_extract_tensor::<f32>()
            .context("Failed to extract embedding tensor")?;

        let dims: Vec<usize> = shape.iter().map(|&d| d as usize).collect();
        if dims.len() < 3 {
            return Err(anyhow!("Unexpected embedding output shape: {:?}", dims));
        }

        let n_tokens = dims[1];
        let dim = dims[2];

        // Mean pooling over token dimension
        let data: Vec<f32> = output_data.to_vec();
        let mut pooled = vec![0f32; dim];
        for token_idx in 0..n_tokens {
            for (p, &val) in pooled.iter_mut().zip(&data[token_idx * dim..]) {
                *p += val;
            }
        }
        let n = n_tokens as f32;
        for p in &mut pooled {
            *p /= n;
        }

        // L2 normalize
        let norm: f32 = pooled.iter().map(|x| x * x).sum::<f32>().sqrt();
        if norm > 0.0 {
            for p in &mut pooled {
                *p /= norm;
            }
        }

        Ok(pooled)
    }

    pub fn embed_batch(&mut self, texts: &[&str]) -> anyhow::Result<Vec<Vec<f32>>> {
        texts.iter().map(|t| self.embed(t)).collect()
    }

    pub fn dimensions(&self) -> usize {
        EMBEDDING_DIM
    }
}
