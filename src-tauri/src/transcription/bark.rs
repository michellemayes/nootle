// Underdog Bark 3.0 Plus (Conway Research, CC-BY-4.0): a post-trained,
// compressed Parakeet TDT 0.6B v3. English only, about 200 MB on disk, and as
// accurate as Parakeet (better on meetings).
//
// Pipeline: audio -> mel frontend (CPU) -> FastConformer encoder (Core ML)
//           -> TDT decoder (CPU, int8 weights) -> text
//
// The frontend and decoder are ported from the model's reference runtime,
// coreml/ane/bark_coreml.py on Hugging Face; keep them in step with it.

use super::{argmax_with_prob, sentences, Emission, TranscriptionSegment};
use anyhow::{anyhow, bail, Context};
use ndarray::{s, Array1, Array2, ArrayView1, ArrayView2};
use rustfft::num_complex::Complex;
use rustfft::{Fft, FftPlanner};
use std::collections::HashMap;
use std::io::Read;
use std::path::Path;
use std::sync::Arc;

pub(super) const ENCODER: &str = "bark/BarkEncoder.mlpackage";
const DECODER: &str = "bark/decoder.npz";
const VOCAB: &str = "bark/vocab.json";

const SR: usize = 16000;
const HOP: usize = 160;
const N_FFT: usize = 512;
const WIN: usize = 400;
const N_MELS: usize = 128;
const PREEMPHASIS: f32 = 0.97;
/// The encoder reads 15 s windows (its `w15` function).
const WINDOW_S: usize = 15;
/// Silence put before each piece: the setting the model was scored with.
const PAD: usize = SR / 4;
/// Three stride-2 convolutions: one encoder frame per 8 feature frames.
const FRAME_SAMPLES: usize = HOP * 8;
const FRAME_MS: f64 = (FRAME_SAMPLES * 1000 / SR) as f64;

/// Whether Bark is downloaded in `dir`.
pub(super) fn is_downloaded(dir: &Path) -> bool {
    [ENCODER, DECODER, VOCAB]
        .iter()
        .all(|f| dir.join(f).exists())
}

/// Whether this Mac can run Bark: its Core ML encoder needs macOS 15.
pub(super) fn is_supported() -> bool {
    Encoder::is_supported()
}

pub(super) struct Bark {
    frontend: Frontend,
    decoder: Decoder,
    encoder: Encoder,
}

impl Bark {
    pub(super) fn load(dir: &Path) -> anyhow::Result<Self> {
        let decoder = Decoder::load(&dir.join(DECODER), &dir.join(VOCAB))?;
        let frontend = Frontend::new(decoder.mel_filters.clone());
        let encoder = Encoder::load(&dir.join(ENCODER), &format!("w{WINDOW_S}"))?;
        tracing::info!("Transcription engine loaded: Bark 3.0 Plus on Core ML");
        Ok(Self {
            frontend,
            decoder,
            encoder,
        })
    }

    /// Transcribe a chunk of audio (16kHz mono f32 samples).
    pub(super) fn transcribe(
        &mut self,
        audio: &[f32],
        offset_ms: u64,
    ) -> anyhow::Result<Vec<TranscriptionSegment>> {
        let mut emissions = Vec::new();
        let mut start = 0;
        for piece in segments(audio) {
            for e in self.piece(piece)? {
                // Back from encoder frames of the padded piece to the chunk.
                let sample = (start + e.frame * FRAME_SAMPLES).saturating_sub(PAD);
                emissions.push(Emission {
                    frame: sample / FRAME_SAMPLES,
                    ..e
                });
            }
            start += piece.len();
        }
        let audio_ms = (audio.len() * 1000 / SR) as u64;
        Ok(sentences(
            &self.decoder.pieces,
            &emissions,
            FRAME_MS,
            offset_ms,
            audio_ms,
        ))
    }

    /// Decodes one piece of at most a window, less the padding.
    fn piece(&self, audio: &[f32]) -> anyhow::Result<Vec<Emission>> {
        let mut x = vec![0.0; PAD];
        x.extend_from_slice(audio);
        let (feats, valid) = self.frontend.features(&x);
        let frames = WINDOW_S * 100 + 1;
        let mut input = Array2::<f32>::zeros((frames, N_MELS));
        let n = feats.nrows().min(frames);
        input
            .slice_mut(s![..n, ..])
            .assign(&feats.slice(s![..n, ..]));
        let encoded = self.encoder.encode(&input, valid.min(frames))?;
        let encoded = encoded.slice(s![..encoder_frames(valid).min(encoded.nrows()), ..]);
        if encoded.iter().any(|v| !v.is_finite()) {
            bail!("Core ML encoder returned non-finite values");
        }
        Ok(self.decoder.decode(encoded))
    }
}

fn encoder_frames(mut n: usize) -> usize {
    for _ in 0..3 {
        n = n.saturating_sub(1) / 2 + 1;
    }
    n
}

/// Cuts audio longer than a window at pauses: within each 5 s to 14.75 s
/// stretch, in the middle of the quietest 200 ms (smoothed 10 ms energy), so
/// no word is split.
fn segments(x: &[f32]) -> Vec<&[f32]> {
    let max = WINDOW_S * SR - PAD;
    let min = 5 * SR;
    if x.len() <= max {
        return vec![x];
    }
    let fr = SR / 100;
    let energy: Vec<f32> = x
        .chunks_exact(fr)
        .map(|c| c.iter().map(|v| v * v).sum::<f32>() / fr as f32)
        .collect();
    // np.convolve(energy, ones(20) / 20, mode="same")
    let smooth: Vec<f32> = (0..energy.len())
        .map(|i| {
            let lo = i.saturating_sub(10);
            let hi = (i + 10).min(energy.len());
            energy[lo..hi].iter().sum::<f32>() / 20.0
        })
        .collect();
    let mut out = Vec::new();
    let mut start = 0;
    while x.len() - start > max {
        let (lo, hi) = ((start + min) / fr, (start + max) / fr);
        let quietest = smooth[lo..hi]
            .iter()
            .enumerate()
            .min_by(|a, b| a.1.total_cmp(b.1))
            .map_or(0, |(i, _)| i);
        let cut = (lo + quietest) * fr + fr / 2;
        out.push(&x[start..cut]);
        start = cut;
    }
    out.push(&x[start..]);
    out
}

/// transformers' ParakeetFeatureExtractor: preemphasis, centred STFT, slaney
/// mel filters, log, per-utterance normalisation.
struct Frontend {
    mel: Array2<f32>,
    window: Vec<f32>,
    fft: Arc<dyn Fft<f64>>,
}

impl Frontend {
    fn new(mel: Array2<f32>) -> Self {
        // np.hanning(400), centred in the 512-sample frame.
        let mut window = vec![0.0; N_FFT];
        let off = (N_FFT - WIN) / 2;
        for (i, w) in window[off..off + WIN].iter_mut().enumerate() {
            let phase = 2.0 * std::f64::consts::PI * i as f64 / (WIN - 1) as f64;
            *w = (0.5 - 0.5 * phase.cos()) as f32;
        }
        Self {
            mel,
            window,
            fft: FftPlanner::new().plan_fft_forward(N_FFT),
        }
    }

    /// Features [frames, 128] and how many frames hold audio.
    fn features(&self, audio: &[f32]) -> (Array2<f32>, usize) {
        let mut padded = vec![0.0f32; audio.len() + N_FFT];
        for (i, &v) in audio.iter().enumerate() {
            let prev = if i == 0 { 0.0 } else { audio[i - 1] };
            padded[N_FFT / 2 + i] = v - PREEMPHASIS * prev;
        }
        let n_frames = 1 + audio.len() / HOP;
        let n_freq = N_FFT / 2 + 1;
        let mut power = Array2::<f32>::zeros((n_frames, n_freq));
        let mut buf = vec![Complex::new(0.0f64, 0.0); N_FFT];
        for (frame, mut row) in power.rows_mut().into_iter().enumerate() {
            let at = frame * HOP;
            for (b, (&x, &w)) in buf
                .iter_mut()
                .zip(padded[at..at + N_FFT].iter().zip(&self.window))
            {
                *b = Complex::new(f64::from(x * w), 0.0);
            }
            self.fft.process(&mut buf);
            for (p, c) in row.iter_mut().zip(&buf) {
                *p = c.norm_sqr() as f32;
            }
        }
        let mut feats = power.dot(&self.mel.t()).mapv(|e| (e + 2f32.powi(-24)).ln());

        let valid = (audio.len() / HOP).min(n_frames);
        let v = feats.slice(s![..valid, ..]);
        let mean = v
            .mean_axis(ndarray::Axis(0))
            .unwrap_or(Array1::zeros(N_MELS));
        let var = v
            .rows()
            .into_iter()
            .fold(Array1::<f32>::zeros(N_MELS), |acc, r| {
                acc + (&r - &mean).mapv(|d| d * d)
            })
            / valid.saturating_sub(1).max(1) as f32;
        let std = var.mapv(f32::sqrt);
        feats
            .rows_mut()
            .into_iter()
            .enumerate()
            .for_each(|(i, mut row)| {
                if i < valid {
                    row.zip_mut_with(&mean, |x, m| *x -= m);
                    row.zip_mut_with(&std, |x, s| *x /= s + 1e-5);
                } else {
                    row.fill(0.0);
                }
            });
        (feats, valid)
    }
}

/// Greedy TDT decoding (transformers' ParakeetForTDT.generate, batch 1).
struct Decoder {
    embedding: Array2<f32>,
    /// Per LSTM layer: input weights, hidden weights, both biases summed.
    lstm: Vec<(Array2<f32>, Array2<f32>, Array1<f32>)>,
    proj_w: Array2<f32>,
    proj_b: Array1<f32>,
    head_w: Array2<f32>,
    head_b: Array1<f32>,
    mel_filters: Array2<f32>,
    pieces: Vec<String>,
    vocab_size: usize,
    blank: usize,
    durations: Vec<usize>,
    max_symbols: usize,
    special: Vec<usize>,
}

#[derive(serde::Deserialize)]
struct Vocab {
    pieces: Vec<String>,
    special_ids: Vec<usize>,
    blank_id: usize,
    vocab_size: usize,
    durations: Vec<usize>,
    max_symbols_per_step: usize,
}

type LstmState = Vec<(Array1<f32>, Array1<f32>)>;

impl Decoder {
    fn load(npz: &Path, vocab: &Path) -> anyhow::Result<Self> {
        let vocab: Vocab = serde_json::from_slice(
            &std::fs::read(vocab).with_context(|| format!("Couldn't read {}", vocab.display()))?,
        )
        .context("Bark vocab.json is malformed")?;
        let a = &mut read_npz(npz)?;
        let lstm = (0..2)
            .map(|l| {
                Ok((
                    weight(a, &format!("decoder.lstm.weight_ih_l{l}"))?,
                    weight(a, &format!("decoder.lstm.weight_hh_l{l}"))?,
                    vector(a, &format!("decoder.lstm.bias_ih_l{l}"))?
                        + vector(a, &format!("decoder.lstm.bias_hh_l{l}"))?,
                ))
            })
            .collect::<anyhow::Result<Vec<_>>>()?;
        let embedding = weight(a, "decoder.embedding.weight")?;
        let proj_w = weight(a, "decoder.decoder_projector.weight")?;
        let proj_b = vector(a, "decoder.decoder_projector.bias")?;
        let head_w = weight(a, "joint.head.weight")?;
        let head_b = vector(a, "joint.head.bias")?;
        let mel_filters = weight(a, "mel_filters")?;

        if head_w.nrows() != vocab.vocab_size + vocab.durations.len()
            || mel_filters.dim() != (N_MELS, N_FFT / 2 + 1)
        {
            bail!("Bark decoder.npz doesn't match vocab.json");
        }
        Ok(Self {
            embedding,
            lstm,
            proj_w,
            proj_b,
            head_w,
            head_b,
            mel_filters,
            pieces: vocab.pieces,
            vocab_size: vocab.vocab_size,
            blank: vocab.blank_id,
            durations: vocab.durations,
            max_symbols: vocab.max_symbols_per_step,
            special: vocab.special_ids,
        })
    }

    fn step(&self, token: usize, state: &LstmState) -> (Array1<f32>, LstmState) {
        let mut x = self.embedding.row(token).to_owned();
        let mut next = Vec::with_capacity(state.len());
        for ((wi, wh, b), (h, c)) in self.lstm.iter().zip(state) {
            let gates = wi.dot(&x) + wh.dot(h) + b;
            let n = h.len();
            let sigmoid = |v: ArrayView1<f32>| v.mapv(|g| 1.0 / (1.0 + (-g).exp()));
            let i = sigmoid(gates.slice(s![..n]));
            let f = sigmoid(gates.slice(s![n..2 * n]));
            let g = gates.slice(s![2 * n..3 * n]).mapv(f32::tanh);
            let o = sigmoid(gates.slice(s![3 * n..]));
            let c = f * c + i * g;
            let h = o * c.mapv(f32::tanh);
            x = h.clone();
            next.push((h, c));
        }
        (self.proj_w.dot(&x) + &self.proj_b, next)
    }

    /// Tokens the decoder emits for projected encoder frames [T, 640].
    fn decode(&self, encoded: ArrayView2<f32>) -> Vec<Emission> {
        let hidden = self.embedding.ncols();
        let zeros = || (Array1::zeros(hidden), Array1::zeros(hidden));
        let (mut dec, mut state) =
            self.step(self.blank, &self.lstm.iter().map(|_| zeros()).collect());
        let (mut t, mut symbols) = (0, 0);
        let mut out = Vec::new();
        while t < encoded.nrows() {
            let joint = (&encoded.row(t) + &dec).mapv(|v| v.max(0.0));
            let logits = (self.head_w.dot(&joint) + &self.head_b)
                .into_raw_vec_and_offset()
                .0;
            let (token, prob) =
                argmax_with_prob(&logits[..self.vocab_size]).unwrap_or((self.blank, 0.0));
            let mut d =
                argmax_with_prob(&logits[self.vocab_size..]).map_or(0, |(i, _)| self.durations[i]);
            if token == self.blank {
                t += d.max(1);
                symbols = 0;
                continue;
            }
            if !self.special.contains(&token) {
                out.push(Emission {
                    token,
                    frame: t,
                    prob,
                });
            }
            (dec, state) = self.step(token, &state);
            symbols += 1;
            if d == 0 && symbols >= self.max_symbols {
                d = 1;
            }
            if d > 0 {
                symbols = 0;
            }
            t += d;
        }
        out
    }
}

// ── .npz reading ─────────────────────────────────────────────────────────────

/// An array from an .npz, as f32.
struct Npy {
    shape: Vec<usize>,
    data: Vec<f32>,
}

type Arrays = HashMap<String, Npy>;

fn take(arrays: &mut Arrays, name: &str) -> anyhow::Result<Npy> {
    arrays
        .remove(name)
        .ok_or_else(|| anyhow!("Bark decoder.npz has no {name}"))
}

fn vector(arrays: &mut Arrays, name: &str) -> anyhow::Result<Array1<f32>> {
    Ok(Array1::from_vec(take(arrays, name)?.data))
}

/// A matrix, dequantised when stored as int8 rows (`.q`) with fp16 scales (`.s`).
fn weight(arrays: &mut Arrays, name: &str) -> anyhow::Result<Array2<f32>> {
    let Some(q) = arrays.remove(&format!("{name}.q")) else {
        return matrix(take(arrays, name)?);
    };
    let mut w = matrix(q)?;
    let scale = take(arrays, &format!("{name}.s"))?.data;
    if scale.len() != w.nrows() {
        bail!("{name}: {} scales for {} rows", scale.len(), w.nrows());
    }
    for (mut row, s) in w.rows_mut().into_iter().zip(scale) {
        row *= s;
    }
    Ok(w)
}

fn matrix(a: Npy) -> anyhow::Result<Array2<f32>> {
    let [rows, cols] = a.shape[..] else {
        bail!("expected a matrix, got shape {:?}", a.shape);
    };
    Ok(Array2::from_shape_vec((rows, cols), a.data)?)
}

/// Reads every array in an .npz (a zip of .npy files).
fn read_npz(path: &Path) -> anyhow::Result<HashMap<String, Npy>> {
    let file =
        std::fs::File::open(path).with_context(|| format!("Couldn't open {}", path.display()))?;
    let mut zip = zip::ZipArchive::new(file).context("Bark decoder.npz isn't a zip")?;
    let mut arrays = HashMap::new();
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i)?;
        let Some(name) = entry.name().strip_suffix(".npy").map(str::to_string) else {
            continue;
        };
        let mut bytes = Vec::new();
        entry.read_to_end(&mut bytes)?;
        let array = parse_npy(&bytes).with_context(|| format!("Bark decoder.npz: {name}"))?;
        arrays.insert(name, array);
    }
    Ok(arrays)
}

/// Parses a C-ordered little-endian .npy of int8, float16 or float32.
fn parse_npy(bytes: &[u8]) -> anyhow::Result<Npy> {
    let rest = bytes
        .strip_prefix(b"\x93NUMPY")
        .ok_or_else(|| anyhow!("not an .npy"))?;
    let (header_len, rest) = match rest {
        [1, _, a, b, rest @ ..] => (u16::from_le_bytes([*a, *b]) as usize, rest),
        [2 | 3, _, a, b, c, d, rest @ ..] => (u32::from_le_bytes([*a, *b, *c, *d]) as usize, rest),
        _ => bail!("unsupported .npy version"),
    };
    if rest.len() < header_len {
        bail!("truncated .npy header");
    }
    let (header, data) = rest.split_at(header_len);
    let header = std::str::from_utf8(header)?;
    let field = |key: &str| {
        let at = header.find(&format!("'{key}':"))? + key.len() + 3;
        Some(header[at..].trim_start())
    };
    if field("fortran_order").is_some_and(|v| v.starts_with("True")) {
        bail!("Fortran-ordered arrays aren't supported");
    }
    let descr = field("descr")
        .and_then(|v| v.strip_prefix('\''))
        .and_then(|v| v.split('\'').next())
        .ok_or_else(|| anyhow!("no dtype"))?;
    let shape: Vec<usize> = field("shape")
        .and_then(|v| v.strip_prefix('('))
        .and_then(|v| v.split(')').next())
        .ok_or_else(|| anyhow!("no shape"))?
        .split(',')
        .map(str::trim)
        .filter(|d| !d.is_empty())
        .map(str::parse)
        .collect::<Result<_, _>>()?;
    let count: usize = shape.iter().product();
    let data: Vec<f32> = match descr {
        "|i1" => data.iter().map(|&b| f32::from(b as i8)).collect(),
        "<f2" => data
            .chunks_exact(2)
            .map(|b| half::f16::from_le_bytes([b[0], b[1]]).to_f32())
            .collect(),
        "<f4" => data
            .chunks_exact(4)
            .map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]]))
            .collect(),
        other => bail!("unsupported dtype {other}"),
    };
    if data.len() < count {
        bail!("truncated .npy data");
    }
    Ok(Npy {
        shape,
        data: data[..count].to_vec(),
    })
}

// ── Encoder ──────────────────────────────────────────────────────────────────

#[cfg(target_os = "macos")]
use super::coreml::Encoder;

/// Core ML only exists on macOS.
#[cfg(not(target_os = "macos"))]
struct Encoder;

#[cfg(not(target_os = "macos"))]
impl Encoder {
    fn is_supported() -> bool {
        false
    }

    fn load(_package: &Path, _function: &str) -> anyhow::Result<Self> {
        bail!("Bark needs Core ML, which only exists on macOS")
    }

    fn encode(&self, _features: &Array2<f32>, _valid: usize) -> anyhow::Result<Array2<f32>> {
        bail!("Bark needs Core ML, which only exists on macOS")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn npy(descr: &str, shape: &str, data: &[u8]) -> Vec<u8> {
        let header = format!("{{'descr': '{descr}', 'fortran_order': False, 'shape': {shape}, }}");
        let mut out = b"\x93NUMPY\x01\x00".to_vec();
        out.extend_from_slice(&(header.len() as u16).to_le_bytes());
        out.extend_from_slice(header.as_bytes());
        out.extend_from_slice(data);
        out
    }

    #[test]
    fn parses_npy_dtypes_and_shapes() {
        let a = parse_npy(&npy("|i1", "(2, 2)", &[1, 255, 3, 128])).unwrap();
        assert_eq!(a.shape, vec![2, 2]);
        assert_eq!(a.data, vec![1.0, -1.0, 3.0, -128.0]);

        let half: Vec<u8> = [1.5f32, -2.0]
            .iter()
            .flat_map(|&v| half::f16::from_f32(v).to_le_bytes())
            .collect();
        let a = parse_npy(&npy("<f2", "(2,)", &half)).unwrap();
        assert_eq!(a.shape, vec![2]);
        assert_eq!(a.data, vec![1.5, -2.0]);

        let a = parse_npy(&npy("<f4", "(1,)", &0.25f32.to_le_bytes())).unwrap();
        assert_eq!(a.data, vec![0.25]);
    }

    #[test]
    fn rejects_unsupported_npy() {
        assert!(parse_npy(b"not numpy").is_err());
        assert!(parse_npy(&npy("<f8", "(1,)", &[0; 8])).is_err());
        assert!(parse_npy(&npy("<f4", "(2,)", &[0; 4])).is_err());
    }

    #[test]
    fn encoder_frames_match_three_stride_two_convs() {
        assert_eq!(encoder_frames(1501), 188);
        assert_eq!(encoder_frames(8), 1);
        assert_eq!(encoder_frames(9), 2);
    }

    #[test]
    fn short_audio_is_one_segment() {
        let audio = vec![0.1; WINDOW_S * SR - PAD];
        assert_eq!(segments(&audio).len(), 1);
    }

    #[test]
    fn long_audio_is_cut_in_its_quietest_pause() {
        // 20 s of tone with a pause from 9 s to 9.5 s.
        let mut audio: Vec<f32> = (0..20 * SR).map(|i| (i as f32 * 0.05).sin()).collect();
        audio[9 * SR..9 * SR + SR / 2].fill(0.0);
        let pieces = segments(&audio);
        assert_eq!(pieces.len(), 2);
        let cut = pieces[0].len();
        assert!((9 * SR..9 * SR + SR / 2).contains(&cut), "cut at {cut}");
        assert_eq!(pieces.iter().map(|p| p.len()).sum::<usize>(), audio.len());
        assert!(pieces.iter().all(|p| p.len() <= WINDOW_S * SR - PAD));
    }

    #[test]
    fn frontend_normalises_the_frames_that_hold_audio() {
        let mel =
            Array2::from_shape_fn(
                (N_MELS, N_FFT / 2 + 1),
                |(m, k)| {
                    if k / 2 == m {
                        1.0
                    } else {
                        0.0
                    }
                },
            );
        let audio: Vec<f32> = (0..SR).map(|i| (i as f32 * 0.3).sin() * 0.1).collect();
        let (feats, valid) = Frontend::new(mel).features(&audio);
        assert_eq!(feats.dim(), (1 + SR / HOP, N_MELS));
        assert_eq!(valid, SR / HOP);
        let mean: f32 = feats.slice(s![..valid, 10]).mean().unwrap();
        assert!(mean.abs() < 1e-3, "mean {mean}");
        assert!(feats.row(valid).iter().all(|&v| v == 0.0));
    }
}
