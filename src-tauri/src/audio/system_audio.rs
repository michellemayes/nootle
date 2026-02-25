use ringbuf::HeapRb;
use ringbuf::traits::{Consumer, Split};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

/// Captures system audio output via Core Audio Process Tap.
/// Requires macOS 14.2+ and Screen Recording permission.
///
/// The Core Audio Process Tap flow (to be implemented):
/// 1. Create a `TapDesc` for a mono global tap (captures all system audio)
/// 2. Create a `TapGuard` from the tap description
/// 3. Get the tap's UID and audio stream basic description (ASBD)
/// 4. Build an aggregate device that includes the tap
/// 5. Register an IO proc callback on the aggregate device
/// 6. The callback pushes audio samples to a ring buffer
///
/// Currently implemented as a stub with the correct interface.
/// The actual Core Audio integration will be filled in during
/// integration testing on a real macOS system with `cidre`.
pub struct SystemAudioCapture {
    consumer: ringbuf::HeapCons<f32>,
    is_recording: Arc<AtomicBool>,
    pub sample_rate: u32,
    // Core Audio resources will be held here once implemented:
    // _tap_guard: Option<cidre::at::audio::TapGuard>,
    // _aggregate_device: Option<...>,
}

impl SystemAudioCapture {
    /// Create a new system audio capture.
    ///
    /// On macOS 14.2+, this will create a Core Audio Process Tap to capture
    /// all system audio output. Currently returns a stub that compiles but
    /// does not capture real audio.
    ///
    /// # Errors
    ///
    /// Returns an error if the system doesn't support process taps or if
    /// Core Audio initialization fails.
    pub fn new() -> anyhow::Result<Self> {
        let sample_rate = 48000u32;

        // Ring buffer: ~5 seconds at 48kHz mono
        let rb = HeapRb::<f32>::new(sample_rate as usize * 5);
        let (_producer, consumer) = rb.split();
        let is_recording = Arc::new(AtomicBool::new(false));

        // TODO: Initialize Core Audio Process Tap
        // 1. Create TapDesc with mono global tap
        // 2. Create TapGuard
        // 3. Get tap UID and ASBD
        // 4. Build aggregate device with tap
        // 5. Register IO proc that pushes to producer
        // 6. Store guards to prevent drop

        tracing::warn!(
            "System audio capture is a stub - \
             will be implemented with cidre Core Audio integration"
        );

        Ok(Self {
            consumer,
            is_recording,
            sample_rate,
        })
    }

    /// Start capturing system audio.
    ///
    /// Once the Core Audio integration is complete, this will start
    /// the aggregate device's IO proc.
    pub fn start(&self) -> anyhow::Result<()> {
        self.is_recording.store(true, Ordering::Relaxed);
        // TODO: Start aggregate device IO proc
        tracing::debug!("System audio capture started (stub)");
        Ok(())
    }

    /// Stop capturing system audio.
    ///
    /// Once the Core Audio integration is complete, this will stop
    /// the aggregate device's IO proc.
    pub fn stop(&self) -> anyhow::Result<()> {
        self.is_recording.store(false, Ordering::Relaxed);
        // TODO: Stop aggregate device IO proc
        tracing::debug!("System audio capture stopped (stub)");
        Ok(())
    }

    /// Read captured audio samples into the provided buffer.
    ///
    /// Returns the number of samples actually read from the ring buffer.
    /// This may be less than `buf.len()` if not enough data is available.
    pub fn read_samples(&mut self, buf: &mut [f32]) -> usize {
        self.consumer.pop_slice(buf)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_system_audio_capture_stub_creates() {
        let capture = SystemAudioCapture::new();
        assert!(capture.is_ok());
        let capture = capture.unwrap();
        assert_eq!(capture.sample_rate, 48000);
    }

    #[test]
    fn test_system_audio_capture_start_stop() {
        let capture = SystemAudioCapture::new().unwrap();
        assert!(capture.start().is_ok());
        assert!(capture.stop().is_ok());
    }

    #[test]
    fn test_system_audio_capture_read_empty() {
        let mut capture = SystemAudioCapture::new().unwrap();
        let mut buf = [0.0f32; 1024];
        let n = capture.read_samples(&mut buf);
        // Stub produces no audio, so should read 0 samples
        assert_eq!(n, 0);
    }
}
