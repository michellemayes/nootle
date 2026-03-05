use hound::{WavSpec, WavWriter};
use std::fs::File;
use std::io::BufWriter;
use std::path::{Path, PathBuf};

pub struct AudioWriter {
    writer: WavWriter<BufWriter<File>>,
    path: PathBuf,
}

impl AudioWriter {
    /// Create a new WAV writer at the specified path.
    /// Writes 16-bit PCM at the given sample rate, mono.
    pub fn new(path: &Path, sample_rate: u32) -> anyhow::Result<Self> {
        let spec = WavSpec {
            channels: 1,
            sample_rate,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let writer = WavWriter::create(path, spec)?;
        Ok(Self {
            writer,
            path: path.to_path_buf(),
        })
    }

    /// Write f32 samples (converting to i16)
    pub fn write_samples(&mut self, samples: &[f32]) -> anyhow::Result<()> {
        for &sample in samples {
            let s = (sample.clamp(-1.0, 1.0) * 32767.0) as i16;
            self.writer.write_sample(s)?;
        }
        Ok(())
    }

    /// Finalize the WAV file and return the path
    pub fn finalize(self) -> anyhow::Result<PathBuf> {
        self.writer.finalize()?;
        Ok(self.path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_write_and_read_wav() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("test.wav");

        let mut writer = AudioWriter::new(&path, 16000).unwrap();
        let samples: Vec<f32> = (0..16000).map(|i| (i as f32 * 0.001).sin()).collect();
        writer.write_samples(&samples).unwrap();
        let final_path = writer.finalize().unwrap();

        assert!(final_path.exists());
        let metadata = fs::metadata(&final_path).unwrap();
        assert!(metadata.len() > 0);
    }
}
