use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use ringbuf::traits::{Consumer, Producer, Split};
use ringbuf::HeapRb;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

/// Virtual devices that meeting and routing apps install. When one of them
/// is the default input (Zoom switches to `ZoomAudioDevice` while sharing
/// computer sound, for instance) it carries call audio or silence rather
/// than the user's voice.
const VIRTUAL_INPUTS: &[&str] = &[
    "zoomaudiodevice",
    "microsoft teams audio",
    "blackhole",
    "loopback audio",
    "soundflower",
];

fn is_virtual_input(name: &str) -> bool {
    let name = name.to_lowercase();
    VIRTUAL_INPUTS.iter().any(|v| name.contains(v))
}

/// The default input, unless it's a virtual device; then the first real mic.
fn pick_input_device(host: &cpal::Host) -> Option<cpal::Device> {
    let default = host.default_input_device();
    let default_name = default.as_ref().and_then(|d| d.name().ok());
    if !default_name.as_deref().is_some_and(is_virtual_input) {
        return default;
    }
    let real = host
        .input_devices()
        .ok()?
        .find(|d| d.name().is_ok_and(|n| !is_virtual_input(&n)));
    if let Some(device) = &real {
        tracing::info!(
            "Default input {:?} is virtual; recording from {:?}",
            default_name.unwrap_or_default(),
            device.name().unwrap_or_default()
        );
    }
    real.or(default)
}

pub struct MicCapture {
    stream: cpal::Stream,
    consumer: ringbuf::HeapCons<f32>,
    is_recording: Arc<AtomicBool>,
    pub sample_rate: u32,
}

impl MicCapture {
    pub fn new() -> anyhow::Result<Self> {
        let host = cpal::default_host();
        let device =
            pick_input_device(&host).ok_or_else(|| anyhow::anyhow!("No input device found"))?;

        let config = device.default_input_config()?;
        let sample_rate = config.sample_rate().0;
        let channels = config.channels() as usize;

        // Ring buffer: ~5 seconds at 48kHz mono
        let rb = HeapRb::<f32>::new(sample_rate as usize * 5);
        let (mut producer, consumer) = rb.split();
        let is_recording = Arc::new(AtomicBool::new(false));
        let recording_flag = is_recording.clone();

        let stream = device.build_input_stream(
            &config.into(),
            move |data: &[f32], _: &cpal::InputCallbackInfo| {
                if !recording_flag.load(Ordering::Relaxed) {
                    return;
                }
                // Downmix to mono if stereo
                if channels == 1 {
                    let _ = producer.push_slice(data);
                } else {
                    for chunk in data.chunks(channels) {
                        let mono = chunk.iter().sum::<f32>() / channels as f32;
                        let _ = producer.push_iter(std::iter::once(mono));
                    }
                }
            },
            |err| eprintln!("Audio input error: {err}"),
            None,
        )?;

        Ok(Self {
            stream,
            consumer,
            is_recording,
            sample_rate,
        })
    }

    pub fn start(&self) -> anyhow::Result<()> {
        self.is_recording.store(true, Ordering::Relaxed);
        self.stream.play()?;
        Ok(())
    }

    pub fn stop(&self) -> anyhow::Result<()> {
        self.is_recording.store(false, Ordering::Relaxed);
        self.stream.pause()?;
        Ok(())
    }

    pub fn read_samples(&mut self, buf: &mut [f32]) -> usize {
        self.consumer.pop_slice(buf)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_virtual_inputs_are_recognised() {
        assert!(is_virtual_input("ZoomAudioDevice"));
        assert!(is_virtual_input("Microsoft Teams Audio"));
        assert!(is_virtual_input("BlackHole 2ch"));
        assert!(!is_virtual_input("MacBook Pro Microphone"));
        assert!(!is_virtual_input("AirPods Pro"));
    }
}
