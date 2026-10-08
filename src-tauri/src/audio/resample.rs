/// Linear-interpolation resampler that carries its position across buffers,
/// so feeding audio burst by burst (file packets, device reads) doesn't drop a fraction of a sample at
/// every boundary (which drifts by seconds over an hour-long recording).
pub struct StreamResampler {
    /// Input samples consumed per output sample.
    step: f64,
    /// Where the next output sample falls, relative to the start of the next
    /// input buffer. Negative values sit between `prev` and that buffer.
    pos: f64,
    prev: Option<f32>,
}

impl StreamResampler {
    pub fn new(from_rate: u32, to_rate: u32) -> Self {
        Self {
            step: from_rate as f64 / to_rate as f64,
            pos: 0.0,
            prev: None,
        }
    }

    pub fn process(&mut self, input: &[f32], out: &mut Vec<f32>) {
        let Some(&last) = input.last() else {
            return;
        };
        if self.step == 1.0 {
            out.extend_from_slice(input);
            return;
        }
        let at = |i: isize| -> f32 {
            if i < 0 {
                self.prev.unwrap_or(input[0])
            } else {
                input[i as usize]
            }
        };
        let end = (input.len() - 1) as f64;
        while self.pos <= end {
            let idx = self.pos.floor();
            let frac = (self.pos - idx) as f32;
            let i = idx as isize;
            let a = at(i);
            let b = if frac > 0.0 { at(i + 1) } else { a };
            out.push(a + (b - a) * frac);
            self.pos += self.step;
        }
        self.pos -= input.len() as f64;
        self.prev = Some(last);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audio::SAMPLE_RATE as TARGET_RATE;

    #[test]
    fn resampler_keeps_long_streams_in_sync() {
        // One second at 44.1 kHz in MP3-sized packets should come out as one
        // second at 16 kHz, give or take a sample.
        let mut r = StreamResampler::new(44_100, TARGET_RATE);
        let input = vec![0.25f32; 44_100];
        let mut out = Vec::new();
        for packet in input.chunks(1152) {
            r.process(packet, &mut out);
        }
        assert!((out.len() as i64 - 16_000).abs() <= 1, "{}", out.len());
        assert!(out.iter().all(|s| (s - 0.25).abs() < 1e-6));
    }

    #[test]
    fn resampler_interpolates_across_packet_boundaries() {
        let mut r = StreamResampler::new(2, 1);
        let mut out = Vec::new();
        r.process(&[0.0, 1.0, 2.0], &mut out);
        r.process(&[3.0, 4.0], &mut out);
        assert_eq!(out, vec![0.0, 2.0, 4.0]);

        let mut up = StreamResampler::new(1, 2);
        let mut out = Vec::new();
        up.process(&[0.0, 1.0], &mut out);
        up.process(&[2.0], &mut out);
        assert_eq!(out, vec![0.0, 0.5, 1.0, 1.5, 2.0]);
    }
}
