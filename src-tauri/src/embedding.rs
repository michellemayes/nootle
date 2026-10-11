//! Sentence embedding engine using all-MiniLM-L6-v2 via ONNX Runtime.
//!
//! Produces 384-dimensional normalized embeddings for semantic search.

use anyhow::{anyhow, Context};
use ort::session::Session;
use ort::value::Tensor;
use std::path::PathBuf;

const MODEL_DIR_NAME: &str = "embedding-minilm";
const EMBEDDING_DIM: usize = 384;
/// all-MiniLM-L6-v2 was trained on sequences of at most 256 wordpieces;
/// anything past that is ignored by the model card's own pipeline.
pub const MAX_SEQ_TOKENS: usize = 256;

pub struct EmbeddingEngine {
    session: Session,
    tokenizer: Tokenizer,
}

/// BERT's uncased WordPiece tokenizer, as all-MiniLM-L6-v2 was trained with:
/// clean and lowercase, strip accents, split off punctuation and CJK
/// characters, then break each word into the longest vocabulary pieces
/// ("budgeting," → "budget", "##ing", ","). Matching whole words only would
/// turn most real words into `[UNK]`.
struct Tokenizer {
    vocab: std::collections::HashMap<String, i64>,
    cls_id: i64,
    sep_id: i64,
    unk_id: i64,
}

/// Words longer than this are a single `[UNK]`, as in BERT.
const MAX_WORD_CHARS: usize = 100;

impl Tokenizer {
    fn load(vocab_path: &std::path::Path) -> anyhow::Result<Self> {
        let content =
            std::fs::read_to_string(vocab_path).context("Failed to read tokenizer vocab")?;
        Ok(Self::from_vocab(&content))
    }

    fn from_vocab(content: &str) -> Self {
        let vocab: std::collections::HashMap<String, i64> = content
            .lines()
            .enumerate()
            .map(|(i, line)| (line.to_string(), i as i64))
            .collect();
        let cls_id = *vocab.get("[CLS]").unwrap_or(&101);
        let sep_id = *vocab.get("[SEP]").unwrap_or(&102);
        let unk_id = *vocab.get("[UNK]").unwrap_or(&100);
        Self {
            vocab,
            cls_id,
            sep_id,
            unk_id,
        }
    }

    fn encode(&self, text: &str, max_length: usize) -> (Vec<i64>, Vec<i64>, Vec<i64>) {
        let mut input_ids = vec![self.cls_id];
        'words: for word in basic_tokenize(text) {
            for id in self.wordpiece(&word) {
                if input_ids.len() >= max_length - 1 {
                    break 'words;
                }
                input_ids.push(id);
            }
        }
        input_ids.push(self.sep_id);
        let len = input_ids.len();
        let attention_mask = vec![1i64; len];
        let token_type_ids = vec![0i64; len];
        (input_ids, attention_mask, token_type_ids)
    }

    /// Greedy longest-match-first split of one word into vocabulary pieces.
    fn wordpiece(&self, word: &str) -> Vec<i64> {
        let chars: Vec<char> = word.chars().collect();
        if chars.len() > MAX_WORD_CHARS {
            return vec![self.unk_id];
        }
        let mut ids = Vec::new();
        let mut start = 0;
        while start < chars.len() {
            let mut end = chars.len();
            let mut found = None;
            while start < end {
                let piece: String = chars[start..end].iter().collect();
                let piece = if start > 0 {
                    format!("##{piece}")
                } else {
                    piece
                };
                if let Some(&id) = self.vocab.get(&piece) {
                    found = Some(id);
                    break;
                }
                end -= 1;
            }
            match found {
                Some(id) => ids.push(id),
                // No piece fits: the whole word is unknown.
                None => return vec![self.unk_id],
            }
            start = end;
        }
        ids
    }
}

/// Splits text into lowercase, accent-free words and single punctuation or
/// CJK characters, dropping control characters.
fn basic_tokenize(text: &str) -> Vec<String> {
    use unicode_normalization::char::is_combining_mark;
    use unicode_normalization::UnicodeNormalization;

    let mut words = Vec::new();
    let mut current = String::new();
    for c in text.to_lowercase().nfd() {
        if is_combining_mark(c) || c == '\u{0}' || c == '\u{fffd}' {
            continue;
        }
        if c.is_whitespace() || c.is_control() {
            if !current.is_empty() {
                words.push(std::mem::take(&mut current));
            }
        } else if is_punctuation(c) || is_cjk(c) {
            if !current.is_empty() {
                words.push(std::mem::take(&mut current));
            }
            words.push(c.to_string());
        } else {
            current.push(c);
        }
    }
    if !current.is_empty() {
        words.push(current);
    }
    words
}

/// BERT counts every non-alphanumeric ASCII symbol as punctuation, plus the
/// Unicode punctuation blocks.
fn is_punctuation(c: char) -> bool {
    c.is_ascii_punctuation()
        || matches!(c,
            '\u{a1}'..='\u{bf}' | '\u{d7}' | '\u{f7}'
            | '\u{2000}'..='\u{206f}'
            | '\u{2e00}'..='\u{2e7f}'
            | '\u{3000}'..='\u{303f}'
            | '\u{ff01}'..='\u{ff0f}' | '\u{ff1a}'..='\u{ff20}'
            | '\u{ff3b}'..='\u{ff40}' | '\u{ff5b}'..='\u{ff65}')
}

fn is_cjk(c: char) -> bool {
    matches!(c,
        '\u{4e00}'..='\u{9fff}'
        | '\u{3400}'..='\u{4dbf}'
        | '\u{20000}'..='\u{2a6df}'
        | '\u{2a700}'..='\u{2b73f}'
        | '\u{2b740}'..='\u{2b81f}'
        | '\u{2b820}'..='\u{2ceaf}'
        | '\u{f900}'..='\u{faff}'
        | '\u{2f800}'..='\u{2fa1f}')
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
        let (input_ids, attention_mask, token_type_ids) =
            self.tokenizer.encode(text, MAX_SEQ_TOKENS);
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

#[cfg(test)]
mod tests {
    use super::*;

    fn tokenizer() -> Tokenizer {
        Tokenizer::from_vocab(
            "[PAD]\n[UNK]\n[CLS]\n[SEP]\nthe\nbudget\n##ing\n,\n.\nq\n##3\ncafe\nnoot\n##le\n?\n中\n文",
        )
    }

    fn pieces(t: &Tokenizer, text: &str) -> Vec<String> {
        let by_id: std::collections::HashMap<i64, &String> =
            t.vocab.iter().map(|(k, v)| (*v, k)).collect();
        let (ids, _, _) = t.encode(text, 512);
        ids[1..ids.len() - 1]
            .iter()
            .map(|id| by_id[id].to_string())
            .collect()
    }

    #[test]
    fn splits_punctuation_and_subwords() {
        let t = tokenizer();
        assert_eq!(
            pieces(&t, "The budgeting, Q3."),
            ["the", "budget", "##ing", ",", "q", "##3", "."]
        );
    }

    #[test]
    fn strips_accents_and_keeps_unknown_words_whole() {
        let t = tokenizer();
        assert_eq!(
            pieces(&t, "Café xyz Nootle?"),
            ["cafe", "[UNK]", "noot", "##le", "?"]
        );
    }

    #[test]
    fn separates_cjk_characters() {
        let t = tokenizer();
        assert_eq!(pieces(&t, "中文"), ["中", "文"]);
    }

    #[test]
    fn truncates_to_max_length_with_sep() {
        let t = tokenizer();
        let (ids, mask, types) = t.encode("the the the the the the", 4);
        assert_eq!(ids, vec![t.cls_id, 4, 4, t.sep_id]);
        assert_eq!(mask.len(), 4);
        assert_eq!(types.len(), 4);
    }
}
