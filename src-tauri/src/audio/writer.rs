use hound::{WavSpec, WavWriter};
use std::fs::File;
use std::io::{BufWriter, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};

/// Writes 16-bit PCM WAV. Call [`AudioWriter::flush`] now and then: it
/// rewrites the header for the samples so far, so a crash mid-recording
/// leaves a playable file rather than one that claims to be empty.
pub struct AudioWriter {
    writer: WavWriter<BufWriter<File>>,
    path: PathBuf,
}

impl AudioWriter {
    /// Mono 16-bit PCM at `sample_rate`.
    pub fn new(path: &Path, sample_rate: u32) -> anyhow::Result<Self> {
        Self::with_channels(path, sample_rate, 1)
    }

    /// Stereo 16-bit PCM: the microphone on the left, system audio on the
    /// right, so the two sides of a call can be told apart afterwards.
    pub fn stereo(path: &Path, sample_rate: u32) -> anyhow::Result<Self> {
        Self::with_channels(path, sample_rate, 2)
    }

    fn with_channels(path: &Path, sample_rate: u32, channels: u16) -> anyhow::Result<Self> {
        let spec = WavSpec {
            channels,
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

    /// Write f32 samples (converting to i16). For stereo, samples are
    /// interleaved left/right.
    pub fn write_samples(&mut self, samples: &[f32]) -> anyhow::Result<()> {
        for &sample in samples {
            self.writer.write_sample(to_i16(sample))?;
        }
        Ok(())
    }

    /// Write one stereo frame per pair of `left` and `right` samples.
    pub fn write_stereo(&mut self, left: &[f32], right: &[f32]) -> anyhow::Result<()> {
        for (&l, &r) in left.iter().zip(right) {
            self.writer.write_sample(to_i16(l))?;
            self.writer.write_sample(to_i16(r))?;
        }
        Ok(())
    }

    /// Make everything written so far a valid file on disk.
    pub fn flush(&mut self) -> anyhow::Result<()> {
        self.writer.flush()?;
        Ok(())
    }

    /// Finalize the WAV file and return the path
    pub fn finalize(self) -> anyhow::Result<PathBuf> {
        self.writer.finalize()?;
        Ok(self.path)
    }
}

fn to_i16(sample: f32) -> i16 {
    (sample.clamp(-1.0, 1.0) * 32767.0) as i16
}

/// Where a recording's separate mic/system channels are kept, next to the
/// mixed file used for playback.
pub fn stems_path(audio_path: &Path) -> PathBuf {
    audio_path.with_extension("stems.wav")
}

/// Fixes the size fields of a WAV file whose writer never finished (the app
/// crashed or was killed mid-recording), so every sample on disk is readable.
/// Returns whether anything changed.
pub fn repair_wav_header(path: &Path) -> anyhow::Result<bool> {
    let mut file = std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(path)?;
    let len = file.metadata()?.len();
    let mut header = [0u8; 12];
    file.read_exact(&mut header)?;
    if &header[0..4] != b"RIFF" || &header[8..12] != b"WAVE" {
        anyhow::bail!("{} is not a WAV file", path.display());
    }

    // Walk the chunks to the data chunk.
    let mut pos = 12u64;
    let (data_size_at, data_start) = loop {
        if pos + 8 > len {
            anyhow::bail!("{} has no data chunk", path.display());
        }
        file.seek(SeekFrom::Start(pos))?;
        let mut chunk = [0u8; 8];
        file.read_exact(&mut chunk)?;
        let size = u32::from_le_bytes(chunk[4..8].try_into().unwrap()) as u64;
        if &chunk[0..4] == b"data" {
            break (pos + 4, pos + 8);
        }
        pos += 8 + size + (size & 1);
    };

    // Whole 4-byte blocks (one stereo or two mono frames), so a sample torn
    // by the crash is dropped rather than misaligning the stream.
    let data_len = ((len - data_start) / 4 * 4).min(u32::MAX as u64) as u32;
    let riff_len = (data_start - 8 + data_len as u64).min(u32::MAX as u64) as u32;
    let mut current = [0u8; 4];
    file.seek(SeekFrom::Start(data_size_at))?;
    file.read_exact(&mut current)?;
    if u32::from_le_bytes(current) == data_len {
        return Ok(false);
    }
    file.seek(SeekFrom::Start(4))?;
    file.write_all(&riff_len.to_le_bytes())?;
    file.seek(SeekFrom::Start(data_size_at))?;
    file.write_all(&data_len.to_le_bytes())?;
    file.sync_all()?;
    Ok(true)
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

    #[test]
    fn stereo_keeps_channels_apart() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("stems.wav");
        let mut writer = AudioWriter::stereo(&path, 16000).unwrap();
        writer.write_stereo(&[0.5; 100], &[-0.5; 100]).unwrap();
        writer.finalize().unwrap();

        let mut reader = hound::WavReader::open(&path).unwrap();
        assert_eq!(reader.spec().channels, 2);
        let samples: Vec<i16> = reader.samples::<i16>().map(Result::unwrap).collect();
        assert_eq!(samples.len(), 200);
        assert!(samples[0] > 0 && samples[1] < 0);
    }

    #[test]
    fn repairs_a_recording_cut_off_by_a_crash() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("crashed.wav");
        let mut writer = AudioWriter::new(&path, 16000).unwrap();
        writer.write_samples(&[0.25; 8000]).unwrap();
        writer.flush().unwrap();
        // Crash: never finalized, and samples written after the last flush
        // reached disk without the header learning about them.
        std::mem::forget(writer);
        let mut f = fs::OpenOptions::new().append(true).open(&path).unwrap();
        f.write_all(&[0u8; 2 * 8000]).unwrap();
        drop(f);
        assert_eq!(hound::WavReader::open(&path).unwrap().duration(), 8000);

        assert!(repair_wav_header(&path).unwrap());
        assert_eq!(hound::WavReader::open(&path).unwrap().duration(), 16000);
        assert!(!repair_wav_header(&path).unwrap(), "already consistent");
    }

    #[test]
    fn stems_sit_next_to_the_recording() {
        assert_eq!(
            stems_path(Path::new("/r/abc.wav")),
            PathBuf::from("/r/abc.stems.wav")
        );
    }
}
