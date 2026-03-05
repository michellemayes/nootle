use anyhow::Result;
use ort::session::Session;
use ort::value::Tensor;

/// Real-time audio denoiser using DeepFilterNet3 ONNX.
/// Processes 16kHz mono f32 audio in-place.
pub struct DenoiseEngine {
    encoder: Session,
    decoder: Session,
    // DeepFilterNet3 uses internal state for temporal context
    enc_state: Vec<f32>,
    dec_state: Vec<f32>,
}

impl DenoiseEngine {
    /// Check if the denoising model files are available on disk.
    pub fn is_available() -> bool {
        let model = match crate::model_registry::get_model("deepfilternet3") {
            Some(m) => m,
            None => return false,
        };
        let dir = crate::model_registry::model_dir(model);
        dir.join("deepfilternet3.onnx").exists()
            && dir.join("deepfilternet3_dec.onnx").exists()
    }

    /// Load the DeepFilterNet3 ONNX sessions.
    pub fn load() -> Result<Self> {
        let model = crate::model_registry::get_model("deepfilternet3")
            .ok_or_else(|| anyhow::anyhow!("deepfilternet3 model not found in registry"))?;
        let dir = crate::model_registry::model_dir(model);
        let enc_path = dir.join("deepfilternet3.onnx");
        let dec_path = dir.join("deepfilternet3_dec.onnx");

        let encoder = Session::builder()?
            .with_execution_providers([
                ort::execution_providers::CoreMLExecutionProvider::default().build(),
            ])?
            .commit_from_file(&enc_path)?;

        let decoder = Session::builder()?
            .with_execution_providers([
                ort::execution_providers::CoreMLExecutionProvider::default().build(),
            ])?
            .commit_from_file(&dec_path)?;

        let enc_state = vec![0.0f32; 256];
        let dec_state = vec![0.0f32; 256];

        Ok(Self {
            encoder,
            decoder,
            enc_state,
            dec_state,
        })
    }

    /// Denoise a chunk of 16kHz mono f32 audio in-place.
    pub fn process(&mut self, samples: &mut [f32]) -> Result<()> {
        if samples.is_empty() {
            return Ok(());
        }

        let frame_size = samples.len();
        let input_tensor = Tensor::from_array(([1_usize, 1, frame_size], samples.to_vec()))?;

        let enc_output = self.encoder.run(ort::inputs![input_tensor])?;

        // Extract encoder output and reconstruct as a Tensor for the decoder
        let (enc_shape, enc_data) = enc_output[0].try_extract_tensor::<f32>()?;
        let enc_dims: Vec<usize> = enc_shape.iter().map(|&d| d as usize).collect();
        let enc_tensor = Tensor::from_array((enc_dims, enc_data.to_vec()))?;

        let dec_output = self.decoder.run(ort::inputs![enc_tensor])?;

        let (_, denoised_data) = dec_output[0].try_extract_tensor::<f32>()?;

        let copy_len = samples.len().min(denoised_data.len());
        samples[..copy_len].copy_from_slice(&denoised_data[..copy_len]);

        Ok(())
    }

    /// Reset internal state (call between recordings).
    pub fn reset(&mut self) {
        self.enc_state.fill(0.0);
        self.dec_state.fill(0.0);
    }
}
