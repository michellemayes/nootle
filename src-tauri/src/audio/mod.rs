/// Rate everything is recorded, stored, and transcribed at.
pub const SAMPLE_RATE: u32 = 16_000;

pub mod capture;
pub mod mic;
pub mod mixer;
pub mod resample;
pub mod session;
pub mod system_audio;
pub mod writer;

pub use capture::{run_audio_capture, validate_audio_devices, AudioChunk};
pub use mic::MicCapture;
pub use mixer::{rms, AudioMixer};
pub use resample::StreamResampler;
pub use session::{AudioLevels, RecordedClock, RecordingSession};
pub use system_audio::SystemAudioCapture;
pub use writer::AudioWriter;
