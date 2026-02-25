/// Mix system audio and mic audio with RMS-based ducking.
/// When mic RMS exceeds threshold, reduce system audio volume.
pub struct AudioMixer {
    duck_threshold: f32,
    duck_ratio: f32,
}

impl AudioMixer {
    pub fn new() -> Self {
        Self {
            duck_threshold: 0.01, // RMS threshold for mic activity
            duck_ratio: 0.3,      // reduce system audio to 30% when ducking
        }
    }

    /// Mix system and mic samples. Both buffers should be the same length.
    /// Returns mixed output.
    pub fn mix(&self, system: &[f32], mic: &[f32]) -> Vec<f32> {
        let mic_rms = Self::rms(mic);
        let duck = if mic_rms > self.duck_threshold {
            self.duck_ratio
        } else {
            1.0
        };

        system
            .iter()
            .zip(mic.iter())
            .map(|(&s, &m)| {
                let mixed = s * duck + m;
                mixed.clamp(-1.0, 1.0) // prevent clipping
            })
            .collect()
    }

    fn rms(samples: &[f32]) -> f32 {
        if samples.is_empty() {
            return 0.0;
        }
        let sum: f32 = samples.iter().map(|s| s * s).sum();
        (sum / samples.len() as f32).sqrt()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mix_with_silence() {
        let mixer = AudioMixer::new();
        let system = vec![0.5; 100];
        let mic = vec![0.0; 100];
        let mixed = mixer.mix(&system, &mic);
        // No ducking when mic is silent
        assert!((mixed[0] - 0.5).abs() < 0.01);
    }

    #[test]
    fn test_mix_with_ducking() {
        let mixer = AudioMixer::new();
        let system = vec![0.5; 100];
        let mic = vec![0.1; 100]; // above threshold
        let mixed = mixer.mix(&system, &mic);
        // System should be ducked to 0.3x
        let expected = 0.5 * 0.3 + 0.1;
        assert!((mixed[0] - expected).abs() < 0.01);
    }

    #[test]
    fn test_clipping_prevention() {
        let mixer = AudioMixer::new();
        let system = vec![0.9; 100];
        let mic = vec![0.9; 100];
        let mixed = mixer.mix(&system, &mic);
        assert!(mixed.iter().all(|&s| s <= 1.0 && s >= -1.0));
    }
}
