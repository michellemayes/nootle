use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::sync::mpsc;

pub struct RecordingSession {
    meeting_id: String,
    is_active: Arc<AtomicBool>,
    audio_path: PathBuf,
    /// Channel to send audio chunks for transcription
    audio_tx: Option<mpsc::Sender<Vec<f32>>>,
    audio_rx: Option<mpsc::Receiver<Vec<f32>>>,
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
        let (audio_tx, audio_rx) = mpsc::channel::<Vec<f32>>(100);

        Ok(Self {
            meeting_id: meeting_id.to_string(),
            is_active: Arc::new(AtomicBool::new(false)),
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
    pub fn take_audio_rx(&mut self) -> Option<mpsc::Receiver<Vec<f32>>> {
        self.audio_rx.take()
    }

    pub fn start(&self) {
        self.is_active.store(true, Ordering::Release);
    }

    pub fn stop(&self) {
        self.is_active.store(false, Ordering::Release);
    }

    /// Get a clone of the is_active flag for the capture thread.
    pub fn is_active_flag(&self) -> Arc<AtomicBool> {
        self.is_active.clone()
    }

    pub fn set_capture_handle(&mut self, handle: std::thread::JoinHandle<()>) {
        self.capture_handle = Some(handle);
    }

    pub fn take_capture_handle(&mut self) -> Option<std::thread::JoinHandle<()>> {
        self.capture_handle.take()
    }

    pub fn take_audio_tx(&mut self) -> Option<mpsc::Sender<Vec<f32>>> {
        self.audio_tx.take()
    }
}
