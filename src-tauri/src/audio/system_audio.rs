// System audio capture via Core Audio Process Tap (macOS 14.2+).
//
// With `--features system-audio`: real cidre-based capture.
// Without: silent stub so the project always compiles.

#[cfg(feature = "system-audio")]
mod core_audio_impl {
    use anyhow::anyhow;
    use ringbuf::traits::{Consumer, Producer, Split};
    use ringbuf::HeapRb;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;

    use cidre::at::audio;

    struct AudioContext {
        producer: ringbuf::HeapProd<f32>,
        is_recording: Arc<AtomicBool>,
    }

    unsafe impl Send for AudioContext {}
    unsafe impl Sync for AudioContext {}

    extern "C" fn audio_io_proc(
        _device: audio::DeviceId,
        _now: &audio::TimeStamp,
        input_data: &audio::BufList,
        _input_time: &audio::TimeStamp,
        _output_data: &mut audio::BufList,
        _output_time: &audio::TimeStamp,
        ctx: *mut std::ffi::c_void,
    ) -> i32 {
        if ctx.is_null() {
            return 0;
        }

        let ctx = unsafe { &mut *(ctx as *mut AudioContext) };

        if !ctx.is_recording.load(Ordering::Relaxed) {
            return 0;
        }

        let bufs = unsafe { input_data.buffers() };
        if bufs.is_empty() {
            return 0;
        }

        let buf = &bufs[0];
        let byte_count = buf.data_bytes_size as usize;
        let sample_count = byte_count / std::mem::size_of::<f32>();

        if sample_count == 0 || buf.data.is_null() {
            return 0;
        }

        let samples =
            unsafe { std::slice::from_raw_parts(buf.data as *const f32, sample_count) };

        ctx.producer.push_slice(samples);

        0 // noErr
    }

    /// Captures system audio output via Core Audio Process Tap.
    /// Requires macOS 14.2+ and the Screen Recording permission.
    pub struct SystemAudioCapture {
        consumer: ringbuf::HeapCons<f32>,
        is_recording: Arc<AtomicBool>,
        pub sample_rate: u32,
        _ctx: Box<AudioContext>,
        _tap_guard: audio::TapGuard,
        aggregate_device_id: audio::DeviceId,
        io_proc_id: audio::DeviceIoProcId,
    }

    impl SystemAudioCapture {
        pub fn new() -> anyhow::Result<Self> {
            let tap_desc = audio::TapDesc::mono_global_tap_excluding_processes(&[]);

            let tap_guard = tap_desc
                .tap()
                .map_err(|e| anyhow!("Failed to create process tap (check Screen Recording permission): {:?}", e))?;

            let sample_rate = tap_guard.stream_basic_desc().sample_rate as u32;
            tracing::info!(sample_rate, "Core Audio Process Tap created");

            let uid = format!("nootle-system-tap-{}", uuid::Uuid::new_v4());
            let aggregate_device_id = audio::AggregateDevice::create(
                &uid,
                "Nootle System Audio",
                &tap_guard,
            )
            .map_err(|e| anyhow!("Failed to create aggregate device: {:?}", e))?;

            let rb = HeapRb::<f32>::new(sample_rate as usize * 5);
            let (producer, consumer) = rb.split();
            let is_recording = Arc::new(AtomicBool::new(false));

            let ctx = Box::new(AudioContext {
                producer,
                is_recording: Arc::clone(&is_recording),
            });

            let ctx_ptr = &*ctx as *const AudioContext as *mut std::ffi::c_void;
            let io_proc_id = unsafe {
                audio::Device::create_io_proc_id(
                    aggregate_device_id,
                    audio_io_proc,
                    ctx_ptr,
                )
                .map_err(|e| anyhow!("Failed to create IO proc: {:?}", e))?
            };

            tracing::info!("Core Audio aggregate device and IO proc ready");

            Ok(Self {
                consumer,
                is_recording,
                sample_rate,
                _ctx: ctx,
                _tap_guard: tap_guard,
                aggregate_device_id,
                io_proc_id,
            })
        }

        pub fn start(&self) -> anyhow::Result<()> {
            self.is_recording.store(true, Ordering::Relaxed);
            unsafe {
                audio::Device::start(self.aggregate_device_id, self.io_proc_id)
                    .map_err(|e| anyhow!("Failed to start audio device: {:?}", e))?;
            }
            tracing::debug!("System audio capture started");
            Ok(())
        }

        pub fn stop(&self) -> anyhow::Result<()> {
            self.is_recording.store(false, Ordering::Relaxed);
            unsafe {
                audio::Device::stop(self.aggregate_device_id, self.io_proc_id)
                    .map_err(|e| anyhow!("Failed to stop audio device: {:?}", e))?;
            }
            tracing::debug!("System audio capture stopped");
            Ok(())
        }

        pub fn read_samples(&mut self, buf: &mut [f32]) -> usize {
            self.consumer.pop_slice(buf)
        }
    }

    impl Drop for SystemAudioCapture {
        fn drop(&mut self) {
            let _ = self.stop();
            tracing::debug!("System audio capture resources released");
        }
    }
}

#[cfg(not(feature = "system-audio"))]
mod fallback_impl {
    use ringbuf::traits::{Consumer, Split};
    use ringbuf::HeapRb;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;

    /// Stub system audio capture that produces silence.
    /// Used when the `system-audio` feature is not enabled.
    pub struct SystemAudioCapture {
        consumer: ringbuf::HeapCons<f32>,
        is_recording: Arc<AtomicBool>,
        pub sample_rate: u32,
    }

    impl SystemAudioCapture {
        pub fn new() -> anyhow::Result<Self> {
            let sample_rate = 48000u32;
            let rb = HeapRb::<f32>::new(sample_rate as usize * 5);
            let (_producer, consumer) = rb.split();
            let is_recording = Arc::new(AtomicBool::new(false));

            tracing::warn!(
                "System audio capture is a stub (built without system-audio feature). \
                 Rebuild with --features system-audio for real capture."
            );

            Ok(Self {
                consumer,
                is_recording,
                sample_rate,
            })
        }

        pub fn start(&self) -> anyhow::Result<()> {
            self.is_recording.store(true, Ordering::Relaxed);
            tracing::debug!("System audio capture started (stub)");
            Ok(())
        }

        pub fn stop(&self) -> anyhow::Result<()> {
            self.is_recording.store(false, Ordering::Relaxed);
            tracing::debug!("System audio capture stopped (stub)");
            Ok(())
        }

        pub fn read_samples(&mut self, buf: &mut [f32]) -> usize {
            self.consumer.pop_slice(buf)
        }
    }
}

#[cfg(feature = "system-audio")]
pub use core_audio_impl::SystemAudioCapture;

#[cfg(not(feature = "system-audio"))]
pub use fallback_impl::SystemAudioCapture;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_system_audio_capture_creates() {
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
        assert_eq!(n, 0);
    }
}
