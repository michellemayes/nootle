//! Decodes an existing audio or video file into the 16 kHz mono stream the
//! transcription pipeline expects, so recordings made elsewhere (a phone memo,
//! a Zoom cloud recording, a podcast) can be transcribed like a live meeting.

use anyhow::{anyhow, Context};
use std::path::Path;
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::{Decoder, DecoderOptions, CODEC_TYPE_NULL};
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::{FormatOptions, FormatReader};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

use crate::audio::{StreamResampler, SAMPLE_RATE as TARGET_RATE};

/// Extensions offered in the file picker. Video files work when their audio
/// track is AAC, ALAC, MP3, FLAC, Vorbis or PCM.
pub const SUPPORTED_EXTENSIONS: &[&str] = &[
    "mp3", "m4a", "aac", "wav", "aif", "aiff", "caf", "flac", "ogg", "oga", "mp4", "m4v", "mov",
    "mkv",
];

/// An opened file, ready to decode its first audio track.
pub struct ImportSource {
    format: Box<dyn FormatReader>,
    decoder: Box<dyn Decoder>,
    track_id: u32,
    sample_rate: u32,
}

impl ImportSource {
    /// Probe `path` and set up a decoder, failing fast on files that can't
    /// be read so nothing is created for them.
    pub fn open(path: &Path) -> anyhow::Result<Self> {
        let file = std::fs::File::open(path)
            .with_context(|| format!("Couldn't open {}", path.display()))?;
        let stream = MediaSourceStream::new(Box::new(file), Default::default());
        let mut hint = Hint::new();
        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            hint.with_extension(ext);
        }
        let probed = symphonia::default::get_probe()
            .format(
                &hint,
                stream,
                &FormatOptions::default(),
                &MetadataOptions::default(),
            )
            .map_err(|e| anyhow!("Unsupported or unreadable file: {e}"))?;
        let format = probed.format;
        let track = format
            .tracks()
            .iter()
            .find(|t| {
                t.codec_params.codec != CODEC_TYPE_NULL && t.codec_params.sample_rate.is_some()
            })
            .ok_or_else(|| anyhow!("No audio track found in this file"))?;
        let track_id = track.id;
        let sample_rate = track.codec_params.sample_rate.unwrap_or(TARGET_RATE);
        let decoder = symphonia::default::get_codecs()
            .make(&track.codec_params, &DecoderOptions::default())
            .map_err(|e| anyhow!("Unsupported audio codec: {e}"))?;
        Ok(Self {
            format,
            decoder,
            track_id,
            sample_rate,
        })
    }

    /// Decode the whole track as 16 kHz mono, handing `sink` one packet's
    /// worth at a time so long files never sit in memory. Returns the number
    /// of samples produced.
    pub fn decode(
        mut self,
        mut sink: impl FnMut(&[f32]) -> anyhow::Result<()>,
    ) -> anyhow::Result<u64> {
        let mut resampler = StreamResampler::new(self.sample_rate, TARGET_RATE);
        let mut interleaved: Option<SampleBuffer<f32>> = None;
        let mut mono = Vec::new();
        let mut out = Vec::new();
        let mut total = 0u64;

        loop {
            let packet = match self.format.next_packet() {
                Ok(p) => p,
                Err(SymphoniaError::IoError(e))
                    if e.kind() == std::io::ErrorKind::UnexpectedEof =>
                {
                    break
                }
                Err(SymphoniaError::ResetRequired) => break,
                Err(e) => return Err(e.into()),
            };
            if packet.track_id() != self.track_id {
                continue;
            }
            let decoded = match self.decoder.decode(&packet) {
                Ok(d) => d,
                // A corrupt frame shouldn't sink the whole import.
                Err(SymphoniaError::DecodeError(e)) => {
                    tracing::warn!("Skipping undecodable packet: {e}");
                    continue;
                }
                Err(e) => return Err(e.into()),
            };

            let spec = *decoded.spec();
            let channels = spec.channels.count().max(1);
            let frames = decoded.capacity() as u64;
            let buf = match interleaved.as_mut() {
                Some(b) if b.capacity() >= decoded.capacity() * channels => b,
                _ => interleaved.insert(SampleBuffer::new(frames, spec)),
            };
            buf.copy_interleaved_ref(decoded);

            mono.clear();
            mono.extend(
                buf.samples()
                    .chunks(channels)
                    .map(|frame| frame.iter().sum::<f32>() / channels as f32),
            );
            out.clear();
            resampler.process(&mono, &mut out);
            if !out.is_empty() {
                total += out.len() as u64;
                sink(&out)?;
            }
        }

        if total == 0 {
            return Err(anyhow!("This file has no audio to transcribe"));
        }
        Ok(total)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_stereo_wav_to_16k_mono() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("memo.wav");
        let spec = hound::WavSpec {
            channels: 2,
            sample_rate: 44_100,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut w = hound::WavWriter::create(&path, spec).unwrap();
        for _ in 0..44_100 {
            w.write_sample(8_000i16).unwrap(); // left
            w.write_sample(-8_000i16).unwrap(); // right cancels it out
        }
        w.finalize().unwrap();

        let mut samples = Vec::new();
        let total = ImportSource::open(&path)
            .unwrap()
            .decode(|chunk| {
                samples.extend_from_slice(chunk);
                Ok(())
            })
            .unwrap();
        assert_eq!(total as usize, samples.len());
        assert!(
            (samples.len() as i64 - 16_000).abs() <= 1,
            "{}",
            samples.len()
        );
        assert!(samples.iter().all(|s| s.abs() < 1e-3));
    }

    #[test]
    fn rejects_files_without_audio() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("notes.mp3");
        std::fs::write(&path, "definitely not audio").unwrap();
        let err = ImportSource::open(&path).err().unwrap().to_string();
        assert!(err.contains("Unsupported or unreadable"), "{err}");
    }
}
