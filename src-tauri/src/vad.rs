use anyhow::Result;
use ort::session::Session;
use ort::value::Tensor;

/// Voice Activity Detection using NeMo MarbleNet.
/// Detects whether audio contains speech.
pub struct VadEngine {
    session: Session,
}

impl VadEngine {
    pub fn is_available() -> bool {
        let model = match crate::model_registry::get_model("vad-marblenet") {
            Some(m) => m,
            None => return false,
        };
        let dir = crate::model_registry::model_dir(model);
        dir.join("marblenet.onnx").exists()
    }

    pub fn load() -> Result<Self> {
        let model = crate::model_registry::get_model("vad-marblenet")
            .ok_or_else(|| anyhow::anyhow!("vad-marblenet model not found in registry"))?;
        let dir = crate::model_registry::model_dir(model);

        let session = Session::builder()?
            .with_execution_providers([
                ort::execution_providers::CoreMLExecutionProvider::default().build(),
            ])?
            .commit_from_file(dir.join("marblenet.onnx"))?;

        Ok(Self { session })
    }

    /// Run VAD on a chunk of 16kHz mono f32 audio.
    /// Returns a probability (0.0-1.0) that the audio contains speech.
    pub fn detect_speech(&mut self, samples: &[f32]) -> Result<f32> {
        if samples.is_empty() {
            return Ok(0.0);
        }

        // MarbleNet expects [batch, 1, samples] at 16kHz
        let n_samples = samples.len();
        let audio_tensor = Tensor::from_array(([1_usize, 1, n_samples], samples.to_vec()))?;

        // Also needs audio_signal_length input
        let length_tensor = Tensor::from_array(([1_usize], vec![n_samples as i64]))?;

        let outputs = self.session.run(ort::inputs![
            "audio_signal" => audio_tensor,
            "length" => length_tensor,
        ])?;

        // Output is [batch, 2] logits — index 1 is speech probability
        let (shape, logits_data) = outputs[0].try_extract_tensor::<f32>()?;
        let dims: Vec<usize> = shape.iter().map(|&d| d as usize).collect();

        // Expect shape [1, 2] — two logits: [no_speech, speech]
        if dims.len() < 2 || dims[dims.len() - 1] < 2 {
            return Err(anyhow::anyhow!(
                "Unexpected VAD output shape: {:?}",
                dims
            ));
        }

        let no_speech_logit = logits_data[0];
        let speech_logit = logits_data[1];

        // Softmax to get probability
        let max = speech_logit.max(no_speech_logit);
        let exp_speech = (speech_logit - max).exp();
        let exp_no_speech = (no_speech_logit - max).exp();
        let probability = exp_speech / (exp_speech + exp_no_speech);

        Ok(probability)
    }
}
