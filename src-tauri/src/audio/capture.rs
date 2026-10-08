use super::SAMPLE_RATE as TARGET_RATE;
use super::{rms, AudioLevels, AudioMixer, AudioWriter, MicCapture, SystemAudioCapture};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

/// Validate that the microphone device is available and can be accessed.
/// System audio is optional and not validated here.
pub fn validate_audio_devices() -> anyhow::Result<()> {
    let _mic = MicCapture::new()?;
    Ok(())
}

const POLL_MS: u64 = 50;
/// Send a chunk to the transcription pipeline every ~2 seconds.
const SEND_SAMPLES: usize = TARGET_RATE as usize * 2;

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
    levels: Arc<AudioLevels>,
    audio_path: std::path::PathBuf,
    denoise: Option<&mut crate::denoise::DenoiseEngine>,
) -> anyhow::Result<()> {
    // --- Microphone (required) ---
    let mut mic = MicCapture::new()?;
    let mic_rate = mic.sample_rate;

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
    // Started together, after the slow system-audio setup, so the mic has no
    // head start: speakers are told apart by comparing the two streams over
    // the same moments.
    mic.start()?;

    let mixer = AudioMixer::new();
    let mut writer = AudioWriter::new(&audio_path, TARGET_RATE)?;

    let mut accumulator = AudioChunk {
        mixed: Vec::with_capacity(SEND_SAMPLES),
        mic: Vec::with_capacity(SEND_SAMPLES),
        system: Vec::new(),
    };

    let result = capture_loop(
        &is_active,
        &is_paused,
        &levels,
        &mut mic,
        mic_rate,
        &mut sys_audio,
        sys_rate,
        &mixer,
        &mut writer,
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
    levels: &AudioLevels,
    mic: &mut MicCapture,
    mic_rate: u32,
    sys_audio: &mut Option<SystemAudioCapture>,
    sys_rate: u32,
    mixer: &AudioMixer,
    writer: &mut AudioWriter,
    accumulator: &mut AudioChunk,
    audio_tx: &tokio::sync::mpsc::Sender<AudioChunk>,
    mut denoise: Option<&mut crate::denoise::DenoiseEngine>,
) -> anyhow::Result<()> {
    // 16 kHz audio not yet paired with the other stream.
    let (mut mic_pending, mut sys_pending) = (Vec::new(), Vec::new());

    while is_active.load(Ordering::Acquire) {
        // Drain everything buffered. Each pass takes a little longer than
        // POLL_MS, so reading a fixed POLL_MS of audio would fall further
        // behind every pass, then drop audio once the ring buffers filled.
        let mic_samples = mic.read_all();
        let sys_samples = sys_audio
            .as_mut()
            .map(SystemAudioCapture::read_all)
            .unwrap_or_default();

        // Paused: the reads above keep the device buffers drained, so
        // resuming picks up live audio rather than a backlog.
        if is_paused.load(Ordering::Acquire) {
            levels.set(0.0, sys_audio.as_ref().map(|_| 0.0));
            mic_pending.clear();
            sys_pending.clear();
            std::thread::sleep(std::time::Duration::from_millis(POLL_MS));
            continue;
        }

        levels.set(
            rms(&mic_samples),
            sys_audio.as_ref().map(|_| rms(&sys_samples)),
        );

        // Resample both to 16 kHz
        mic_pending.extend(resample(&mic_samples, mic_rate, TARGET_RATE));
        sys_pending.extend(resample(&sys_samples, sys_rate, TARGET_RATE));

        // Mix (or pass through mic-only), keeping both sources aligned.
        let (mic_16k, sys_16k, mut mixed) = if sys_audio.is_some() {
            let (mic_16k, sys_16k) = take_aligned(&mut mic_pending, &mut sys_pending);
            let mixed = mixer.mix(&sys_16k, &mic_16k);
            (mic_16k, sys_16k, mixed)
        } else {
            let mic_16k = std::mem::take(&mut mic_pending);
            (mic_16k.clone(), Vec::new(), mic_16k)
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

/// How far one stream may run ahead of the other before the lagging one is
/// taken to have stalled and its gap filled with silence, so neither stream
/// is ever held back for long.
const MAX_SKEW_SAMPLES: usize = TARGET_RATE as usize / 5;

/// Take equal lengths of mic and system audio covering the same moments.
/// Each device delivers in its own burst sizes, so the stream that is ahead
/// keeps its surplus for the next poll instead of the other being padded
/// with silence every poll, which would stretch both out of step.
fn take_aligned(mic: &mut Vec<f32>, sys: &mut Vec<f32>) -> (Vec<f32>, Vec<f32>) {
    let (shorter, longer) = if mic.len() < sys.len() {
        (mic.len(), sys.len())
    } else {
        (sys.len(), mic.len())
    };
    let n = if longer - shorter > MAX_SKEW_SAMPLES {
        longer
    } else {
        shorter
    };
    let take = |v: &mut Vec<f32>| {
        let mut out: Vec<f32> = v.drain(..n.min(v.len())).collect();
        out.resize(n, 0.0);
        out
    };
    (take(mic), take(sys))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn take_aligned_holds_back_the_stream_that_is_ahead() {
        let mut mic = vec![1.0; 800];
        let mut sys = vec![2.0; 640];
        let (m, s) = take_aligned(&mut mic, &mut sys);
        assert_eq!((m.len(), s.len()), (640, 640));
        assert!(s.iter().all(|&x| x == 2.0));
        assert_eq!((mic.len(), sys.len()), (160, 0));
    }

    #[test]
    fn take_aligned_fills_a_stalled_stream_with_silence() {
        let mut mic = vec![1.0; MAX_SKEW_SAMPLES + 500];
        let mut sys = vec![2.0; 100];
        let (m, s) = take_aligned(&mut mic, &mut sys);
        assert_eq!(m.len(), MAX_SKEW_SAMPLES + 500);
        assert_eq!(s.len(), m.len());
        assert_eq!(s[99], 2.0);
        assert_eq!(s[100], 0.0);
        assert!(mic.is_empty() && sys.is_empty());
    }
}
