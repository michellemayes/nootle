// System audio capture via Core Audio Process Tap (macOS 14.2+).
//
// With `--features system-audio`: real cidre-based capture.
// Without: silent stub so the project always compiles.

#[cfg(feature = "system-audio")]
mod core_audio_impl {
    use anyhow::Context;
    use ringbuf::traits::{Consumer, Producer, Split};
    use ringbuf::HeapRb;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;

    use cidre::core_audio::aggregate_device_keys as agg_keys;
    use cidre::core_audio::hardware::StartedDevice;
    use cidre::core_audio::sub_device_keys as sub_keys;
    use cidre::{cat, cf, core_audio as ca, ns, os};

    struct AudioContext {
        producer: ringbuf::HeapProd<f32>,
        is_recording: Arc<AtomicBool>,
    }

    extern "C" fn audio_io_proc(
        _device: ca::Device,
        _now: &cat::AudioTimeStamp,
        input_data: &cat::AudioBufList<1>,
        _input_time: &cat::AudioTimeStamp,
        _output_data: &mut cat::AudioBufList<1>,
        _output_time: &cat::AudioTimeStamp,
        ctx: Option<&mut AudioContext>,
    ) -> os::Status {
        let Some(ctx) = ctx else {
            return os::Status::default();
        };

        if !ctx.is_recording.load(Ordering::Relaxed) {
            return os::Status::default();
        }

        let buf = &input_data.buffers[0];
        let byte_count = buf.data_bytes_size as usize;
        let sample_count = byte_count / std::mem::size_of::<f32>();

        if sample_count == 0 || buf.data.is_null() {
            return os::Status::default();
        }

        let samples = unsafe { std::slice::from_raw_parts(buf.data as *const f32, sample_count) };
        ctx.producer.push_slice(samples);

        os::Status::default()
    }

    /// Captures system audio output via Core Audio Process Tap.
    /// Requires macOS 14.2+ and the Screen Recording permission.
    pub struct SystemAudioCapture {
        consumer: ringbuf::HeapCons<f32>,
        is_recording: Arc<AtomicBool>,
        pub sample_rate: u32,
        // Field order is the teardown contract: dropping `_started_device`
        // stops the IOProc, which holds a raw pointer into `_ctx`. Reordering
        // would let the audio thread fire after the producer is freed.
        _started_device: StartedDevice<ca::AggregateDevice>,
        _tap_guard: ca::TapGuard,
        _ctx: Box<AudioContext>,
    }

    impl SystemAudioCapture {
        pub fn new() -> anyhow::Result<Self> {
            let tap_desc = ca::TapDesc::with_mono_global_tap_excluding_processes(&ns::Array::new());

            let tap_guard = tap_desc
                .create_process_tap()
                .with_context(|| "create process tap (check Screen Recording permission)")?;

            let asbd = tap_guard.asbd().context("read tap stream format")?;
            let sample_rate = asbd.sample_rate as u32;
            tracing::info!(sample_rate, "Core Audio Process Tap created");

            let output_device =
                ca::System::default_output_device().context("get default output device")?;
            let output_uid = output_device.uid().context("read output device UID")?;
            let tap_uid = tap_guard.uid().context("read tap UID")?;

            let sub_device =
                cf::DictionaryOf::with_keys_values(&[sub_keys::uid()], &[output_uid.as_type_ref()]);
            let sub_tap =
                cf::DictionaryOf::with_keys_values(&[sub_keys::uid()], &[tap_uid.as_type_ref()]);

            let agg_uid = cf::Uuid::new().to_cf_string();
            let agg_name = cf::str!(c"Nootle System Audio");

            let dict = cf::DictionaryOf::with_keys_values(
                &[
                    agg_keys::is_private(),
                    agg_keys::is_stacked(),
                    agg_keys::tap_auto_start(),
                    agg_keys::name(),
                    agg_keys::main_sub_device(),
                    agg_keys::uid(),
                    agg_keys::sub_device_list(),
                    agg_keys::tap_list(),
                ],
                &[
                    cf::Boolean::value_true().as_type_ref(),
                    cf::Boolean::value_false(),
                    cf::Boolean::value_true(),
                    agg_name,
                    &output_uid,
                    &agg_uid,
                    &cf::ArrayOf::from_slice(&[sub_device.as_ref()]),
                    &cf::ArrayOf::from_slice(&[sub_tap.as_ref()]),
                ],
            );

            let agg_device =
                ca::AggregateDevice::with_desc(&dict).context("create aggregate device")?;

            let rb = HeapRb::<f32>::new(sample_rate as usize * 5);
            let (producer, consumer) = rb.split();
            let is_recording = Arc::new(AtomicBool::new(false));

            let mut ctx = Box::new(AudioContext {
                producer,
                is_recording: Arc::clone(&is_recording),
            });

            let proc_id = agg_device
                .create_io_proc_id(audio_io_proc, Some(ctx.as_mut()))
                .context("create IO proc")?;

            let started_device =
                ca::device_start(agg_device, Some(proc_id)).context("start audio device")?;

            tracing::info!("Core Audio aggregate device and IO proc running");

            Ok(Self {
                consumer,
                is_recording,
                sample_rate,
                _started_device: started_device,
                _tap_guard: tap_guard,
                _ctx: ctx,
            })
        }

        pub fn start(&self) -> anyhow::Result<()> {
            self.is_recording.store(true, Ordering::Relaxed);
            tracing::debug!("System audio capture started");
            Ok(())
        }

        pub fn stop(&self) -> anyhow::Result<()> {
            self.is_recording.store(false, Ordering::Relaxed);
            tracing::debug!("System audio capture stopped");
            Ok(())
        }

        pub fn read_samples(&mut self, buf: &mut [f32]) -> usize {
            self.consumer.pop_slice(buf)
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

#[cfg(all(test, not(feature = "system-audio")))]
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
