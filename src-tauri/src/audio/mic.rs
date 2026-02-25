use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use ringbuf::HeapRb;
use ringbuf::traits::{Consumer, Producer, Split};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

pub struct MicCapture {
    stream: cpal::Stream,
    consumer: ringbuf::HeapCons<f32>,
    is_recording: Arc<AtomicBool>,
    pub sample_rate: u32,
}

impl MicCapture {
    pub fn new() -> anyhow::Result<Self> {
        let host = cpal::default_host();
        let device = host
            .default_input_device()
            .ok_or_else(|| anyhow::anyhow!("No input device found"))?;

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
