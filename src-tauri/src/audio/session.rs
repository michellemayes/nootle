use super::AudioChunk;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::sync::mpsc;

/// Wall-clock bookkeeping so the UI can show recorded time, not time since
/// start, once a recording has been paused.
struct Clock {
    started: Instant,
    paused_since: Option<Instant>,
    paused_total: Duration,
}

pub struct RecordingSession {
    meeting_id: String,
    is_active: Arc<AtomicBool>,
    /// While set, the capture thread drains the devices but drops the audio,
    /// so nothing is written or transcribed.
    is_paused: Arc<AtomicBool>,
    clock: Mutex<Clock>,
    audio_path: PathBuf,
    /// Channel to send audio chunks for transcription
    audio_tx: Option<mpsc::Sender<AudioChunk>>,
    audio_rx: Option<mpsc::Receiver<AudioChunk>>,
    capture_handle: Option<std::thread::JoinHandle<()>>,
}

impl RecordingSession {
    pub fn new(
        recordings_dir: &std::path::Path,
        meeting_id: &str,
        _sample_rate: u32,
    ) -> anyhow::Result<Self> {
        std::fs::create_dir_all(recordings_dir)?;
        let audio_path = recordings_dir.join(format!("{meeting_id}.wav"));
        let (audio_tx, audio_rx) = mpsc::channel::<AudioChunk>(100);

        Ok(Self {
            meeting_id: meeting_id.to_string(),
            is_active: Arc::new(AtomicBool::new(false)),
            is_paused: Arc::new(AtomicBool::new(false)),
            clock: Mutex::new(Clock {
                started: Instant::now(),
                paused_since: None,
                paused_total: Duration::ZERO,
            }),
            audio_path,
            audio_tx: Some(audio_tx),
            audio_rx: Some(audio_rx),
            capture_handle: None,
        })
    }

    pub fn meeting_id(&self) -> &str {
        &self.meeting_id
    }

    pub fn audio_path(&self) -> &std::path::Path {
        &self.audio_path
    }

    pub fn is_active(&self) -> bool {
        self.is_active.load(Ordering::Relaxed)
    }

    /// Take the audio receiver (for the transcription pipeline).
    /// Can only be called once.
    pub fn take_audio_rx(&mut self) -> Option<mpsc::Receiver<AudioChunk>> {
        self.audio_rx.take()
    }

    pub fn start(&self) {
        self.clock.lock().unwrap().started = Instant::now();
        self.is_active.store(true, Ordering::Release);
    }

    pub fn is_paused(&self) -> bool {
        self.is_paused.load(Ordering::Acquire)
    }

    pub fn set_paused(&self, paused: bool) {
        let mut clock = self.clock.lock().unwrap();
        match (paused, clock.paused_since) {
            (true, None) => clock.paused_since = Some(Instant::now()),
            (false, Some(since)) => {
                clock.paused_total += since.elapsed();
                clock.paused_since = None;
            }
            _ => {}
        }
        self.is_paused.store(paused, Ordering::Release);
    }

    /// Time actually recorded so far, leaving out paused stretches.
    pub fn recorded(&self) -> Duration {
        let clock = self.clock.lock().unwrap();
        let paused =
            clock.paused_total + clock.paused_since.map_or(Duration::ZERO, |s| s.elapsed());
        clock.started.elapsed().saturating_sub(paused)
    }

    pub fn stop(&self) {
        self.is_active.store(false, Ordering::Release);
    }

    /// Get a clone of the is_active flag for the capture thread.
    pub fn is_active_flag(&self) -> Arc<AtomicBool> {
        self.is_active.clone()
    }

    pub fn is_paused_flag(&self) -> Arc<AtomicBool> {
        self.is_paused.clone()
    }

    pub fn set_capture_handle(&mut self, handle: std::thread::JoinHandle<()>) {
        self.capture_handle = Some(handle);
    }

    pub fn take_capture_handle(&mut self) -> Option<std::thread::JoinHandle<()>> {
        self.capture_handle.take()
    }

    pub fn take_audio_tx(&mut self) -> Option<mpsc::Sender<AudioChunk>> {
        self.audio_tx.take()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn paused_time_is_left_out_of_recorded_time() {
        let dir = tempfile::tempdir().unwrap();
        let session = RecordingSession::new(dir.path(), "m", 16_000).unwrap();
        session.start();
        session.set_paused(true);
        session.set_paused(true); // repeated pauses don't restart the clock
        assert!(session.is_paused());
        std::thread::sleep(Duration::from_millis(60));
        session.set_paused(false);
        assert!(!session.is_paused());
        assert!(session.recorded() < Duration::from_millis(50));
    }
}
