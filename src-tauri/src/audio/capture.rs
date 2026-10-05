use super::SAMPLE_RATE as TARGET_RATE;
use super::{AudioMixer, AudioWriter, MicCapture, SystemAudioCapture};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

/// Validate that the microphone device is available and can be accessed.
/// System audio is optional and not validated here.
pub fn validate_audio_devices() -> anyhow::Result<()> {
    let _mic = MicCapture::new()?;
    Ok(())
}

/// ~2 s of 16 kHz audio for the transcription pipeline. The mic and system
/// streams ride along with the mix so speakers can be told apart by source.
pub struct AudioChunk {
    /// What gets transcribed (and written to the WAV): mic + system, denoised.
    pub mixed: Vec<f32>,
    pub mic: Vec<f32>,
    /// Empty when system audio isn't being captured.
    pub system: Vec<f32>,
}

impl AudioChunk {
    /// Split off the first `n` samples of every stream.
    fn take_front(&mut self, n: usize) -> AudioChunk {
        let take = |v: &mut Vec<f32>| v.drain(..n.min(v.len())).collect();
        AudioChunk {
            mixed: take(&mut self.mixed),
            mic: take(&mut self.mic),
            system: take(&mut self.system),
        }
    }
}

/// Runs on a dedicated std::thread. Reads audio from hardware, resamples to
/// 16 kHz, mixes mic + system audio, writes a WAV file, and feeds chunks to
/// the transcription pipeline via `audio_tx`.
///
/// NOTE: The caller is responsible for providing an `audio_path` that is not
/// concurrently written to. Currently `RecordingSession` creates the path but
/// does not open the file — only this function writes to it.
pub fn run_audio_capture(
    audio_tx: tokio::sync::mpsc::Sender<AudioChunk>,
    is_active: Arc<AtomicBool>,
    is_paused: Arc<AtomicBool>,
    audio_path: std::path::PathBuf,
    denoise: Option<&mut crate::denoise::DenoiseEngine>,
) -> anyhow::Result<()> {
    const POLL_MS: u64 = 50;
    // Send a chunk to the transcription pipeline every ~2 seconds.
    const SEND_SAMPLES: usize = TARGET_RATE as usize * 2;

    // --- Microphone (required) ---
    let mut mic = MicCapture::new()?;
    let mic_rate = mic.sample_rate;
    mic.start()?;

    // --- System audio (optional) ---
    let mut sys_audio: Option<SystemAudioCapture> = match SystemAudioCapture::new() {
        Ok(s) => {
            if let Err(e) = s.start() {
                tracing::warn!("Failed to start system audio: {e}");
                None
            } else {
                Some(s)
            }
        }
        Err(e) => {
            tracing::warn!("System audio not available: {e}");
            None
        }
    };
    let sys_rate = sys_audio.as_ref().map(|s| s.sample_rate).unwrap_or(48_000);

    let mixer = AudioMixer::new();
    let mut writer = AudioWriter::new(&audio_path, TARGET_RATE)?;

    // Read buffers sized for one poll interval at native sample rates.
    let mic_buf_len = (mic_rate as usize * POLL_MS as usize) / 1000;
    let sys_buf_len = (sys_rate as usize * POLL_MS as usize) / 1000;
    let mut mic_buf = vec![0.0f32; mic_buf_len];
    let mut sys_buf = vec![0.0f32; sys_buf_len];

    let mut accumulator = AudioChunk {
        mixed: Vec::with_capacity(SEND_SAMPLES),
        mic: Vec::with_capacity(SEND_SAMPLES),
        system: Vec::new(),
    };

    let result = capture_loop(
        &is_active,
        &is_paused,
        &mut mic,
        mic_rate,
        &mut sys_audio,
        sys_rate,
        &mixer,
        &mut writer,
        &mut mic_buf,
        &mut sys_buf,
        &mut accumulator,
        &audio_tx,
        denoise,
    );

    // Cleanup always runs regardless of how the loop exited
    let _ = mic.stop();
    if let Some(ref sys) = sys_audio {
        let _ = sys.stop();
    }
    writer.finalize()?;

    tracing::info!("Audio capture loop finished");
    result
}

#[allow(clippy::too_many_arguments)]
fn capture_loop(
    is_active: &AtomicBool,
    is_paused: &AtomicBool,
    mic: &mut MicCapture,
    mic_rate: u32,
    sys_audio: &mut Option<SystemAudioCapture>,
    sys_rate: u32,
    mixer: &AudioMixer,
    writer: &mut AudioWriter,
    mic_buf: &mut [f32],
    sys_buf: &mut [f32],
    accumulator: &mut AudioChunk,
    audio_tx: &tokio::sync::mpsc::Sender<AudioChunk>,
    mut denoise: Option<&mut crate::denoise::DenoiseEngine>,
) -> anyhow::Result<()> {
    const POLL_MS: u64 = 50;
    const SEND_SAMPLES: usize = TARGET_RATE as usize * 2;

    while is_active.load(Ordering::Acquire) {
        // Read from mic ring buffer
        let mic_n = mic.read_samples(mic_buf);
        let mic_samples = &mic_buf[..mic_n];

        // Read from system audio ring buffer
        let sys_samples: &[f32] = if let Some(ref mut sys) = sys_audio {
            let n = sys.read_samples(sys_buf);
            &sys_buf[..n]
        } else {
            &[]
        };

        // Paused: the reads above keep the device buffers drained, so
        // resuming picks up live audio rather than a backlog.
        if is_paused.load(Ordering::Acquire) {
            std::thread::sleep(std::time::Duration::from_millis(POLL_MS));
            continue;
        }

        // Resample both to 16 kHz
        let mic_16k = resample(mic_samples, mic_rate, TARGET_RATE);
        let sys_16k = if !sys_samples.is_empty() {
            resample(sys_samples, sys_rate, TARGET_RATE)
        } else {
            vec![]
        };

        // Mix (or pass through mic-only), keeping both sources aligned.
        let (mic_16k, sys_16k, mut mixed) = if sys_audio.is_some() {
            let len = mic_16k.len().max(sys_16k.len());
            let (mut mic_padded, mut sys_padded) = (mic_16k, sys_16k);
            mic_padded.resize(len, 0.0);
            sys_padded.resize(len, 0.0);
            let mixed = mixer.mix(&sys_padded, &mic_padded);
            (mic_padded, sys_padded, mixed)
        } else {
            let mixed = mic_16k.clone();
            (mic_16k, sys_16k, mixed)
        };

        if !mixed.is_empty() {
            if let Some(ref mut engine) = denoise {
                if let Err(e) = engine.process(&mut mixed) {
                    tracing::warn!("Denoising failed, using raw audio: {e}");
                }
            }
            writer.write_samples(&mixed)?;
            accumulator.mixed.extend_from_slice(&mixed);
            accumulator.mic.extend_from_slice(&mic_16k);
            accumulator.system.extend_from_slice(&sys_16k);
        }

        // Send consistent-sized chunks to transcription pipeline
        while accumulator.mixed.len() >= SEND_SAMPLES {
            let chunk = accumulator.take_front(SEND_SAMPLES);
            if audio_tx.blocking_send(chunk).is_err() {
                return Ok(()); // receiver dropped
            }
        }

        std::thread::sleep(std::time::Duration::from_millis(POLL_MS));
    }

    // Flush remaining samples
    if !accumulator.mixed.is_empty() {
        let chunk = accumulator.take_front(accumulator.mixed.len());
        let _ = audio_tx.blocking_send(chunk);
    }

    Ok(())
}

/// Linear-interpolation resampler (sufficient for speech).
///
/// TODO: Replace with a proper polyphase or sinc-based resampler (e.g. the
/// `rubato` crate) to add anti-aliasing filtering. The current implementation
/// introduces aliasing artifacts when downsampling (e.g. 48kHz → 16kHz) because
/// frequencies above the Nyquist limit (8kHz) fold back. For speech this is
/// tolerable since most energy is below 4kHz, but consonant sibilants in the
/// 4–8kHz range can produce audible distortion that may affect transcription
/// accuracy.
fn resample(samples: &[f32], from_rate: u32, to_rate: u32) -> Vec<f32> {
    if samples.is_empty() || from_rate == to_rate {
        return samples.to_vec();
    }
    let ratio = from_rate as f64 / to_rate as f64;
    let out_len = (samples.len() as f64 / ratio) as usize;
    let mut out = Vec::with_capacity(out_len);
    for i in 0..out_len {
        let src = i as f64 * ratio;
        let idx = src as usize;
        let frac = src - idx as f64;
        let s = if idx + 1 < samples.len() {
            samples[idx] as f64 * (1.0 - frac) + samples[idx + 1] as f64 * frac
        } else if idx < samples.len() {
            samples[idx] as f64
        } else {
            0.0
        };
        out.push(s as f32);
    }
    out
}
