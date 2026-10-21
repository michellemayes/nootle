// The Bark encoder on Core ML. The .mlpackage is compiled once into a
// .mlmodelc kept next to it, then loaded on the Neural Engine (CPU when the
// Neural Engine can't take it).

use anyhow::{anyhow, bail};
use block2::{Block, StackBlock};
use ndarray::Array2;
use objc2::rc::{autoreleasepool, Allocated, Retained};
use objc2::runtime::{AnyObject, Bool};
use objc2::{class, msg_send, sel};
use std::cell::RefCell;
use std::ffi::{c_char, c_void, CStr, CString};
use std::path::{Path, PathBuf};
use std::ptr;

#[link(name = "CoreML", kind = "framework")]
extern "C" {}

// MLComputeUnits
const CPU_ONLY: isize = 0;
const CPU_AND_NEURAL_ENGINE: isize = 3;
// MLMultiArrayDataType
const FLOAT16: isize = 0x10000 | 16;
const FLOAT32: isize = 0x10000 | 32;
const INT32: isize = 0x20000 | 32;

pub(super) struct Encoder {
    model: Retained<AnyObject>,
}

// MLModel predictions are thread-safe, and the engine is only used behind a
// lock or by the thread that owns it.
unsafe impl Send for Encoder {}

impl Encoder {
    /// The package holds one encoder function per window length; picking
    /// one (MLModelConfiguration.functionName) needs macOS 15.
    pub(super) fn is_supported() -> bool {
        autoreleasepool(|_| unsafe {
            let config: Retained<AnyObject> = msg_send![class!(MLModelConfiguration), new];
            let supported: Bool = msg_send![&*config, respondsToSelector: sel!(setFunctionName:)];
            supported.as_bool()
        })
    }

    /// Loads `function` of the encoder package at `package`.
    pub(super) fn load(package: &Path, function: &str) -> anyhow::Result<Self> {
        if !Self::is_supported() {
            bail!("Bark needs macOS 15 or later");
        }
        let compiled = compile(package)?;
        let model = autoreleasepool(|_| unsafe {
            load_model(&compiled, function, CPU_AND_NEURAL_ENGINE).or_else(|e| {
                tracing::warn!("Bark encoder: Neural Engine unavailable ({e:#}); using CPU");
                load_model(&compiled, function, CPU_ONLY)
            })
        });
        if model.is_err() {
            // Compile again next time, in case the compiled copy is damaged.
            let _ = std::fs::remove_dir_all(&compiled);
        }
        Ok(Self { model: model? })
    }

    /// Encodes one window of features [frames, 128], of which the first
    /// `valid` frames hold audio, into projected frames [frames / 8, 640].
    pub(super) fn encode(
        &self,
        features: &Array2<f32>,
        valid: usize,
    ) -> anyhow::Result<Array2<f32>> {
        let (frames, mels) = features.dim();
        let mut feats: Vec<u16> = features
            .iter()
            .map(|&v| half::f16::from_f32(v).to_bits())
            .collect();
        let mut mask: Vec<i32> = (0..frames).map(|i| i32::from(i < valid)).collect();
        autoreleasepool(|_| unsafe {
            let feats = multi_array(feats.as_mut_ptr().cast(), &[1, frames, mels], FLOAT16)?;
            let mask = multi_array(mask.as_mut_ptr().cast(), &[1, frames], INT32)?;
            let inputs = feature_provider(&[("features", &feats), ("mask", &mask)])?;
            let mut error: *mut AnyObject = ptr::null_mut();
            let out: Option<Retained<AnyObject>> =
                msg_send![&*self.model, predictionFromFeatures: &*inputs, error: &mut error];
            let out = out.ok_or_else(|| ns_error("The Bark encoder failed", error))?;
            let name = ns_string("encoded")?;
            let value: *mut AnyObject = msg_send![&*out, featureValueForName: &*name];
            let value = value
                .as_ref()
                .ok_or_else(|| anyhow!("The Bark encoder has no 'encoded' output"))?;
            let array: *mut AnyObject = msg_send![value, multiArrayValue];
            read_matrix(
                array
                    .as_ref()
                    .ok_or_else(|| anyhow!("The Bark encoder's output isn't an array"))?,
            )
        })
    }
}

/// The compiled model next to `package`, compiling it on first use.
fn compile(package: &Path) -> anyhow::Result<PathBuf> {
    let target = package.with_extension("mlmodelc");
    if target.exists() {
        return Ok(target);
    }
    tracing::info!("Compiling the Bark encoder for this Mac");
    let temp = autoreleasepool(|_| unsafe {
        let url = file_url(package)?;
        let mut error: *mut AnyObject = ptr::null_mut();
        let out: Option<Retained<AnyObject>> =
            msg_send![class!(MLModel), compileModelAtURL: &*url, error: &mut error];
        let out = out.ok_or_else(|| ns_error("Couldn't compile the Bark encoder", error))?;
        let path: *mut AnyObject = msg_send![&*out, path];
        rust_string(path)
            .map(PathBuf::from)
            .ok_or_else(|| anyhow!("The compiled Bark encoder has no path"))
    })?;
    // Core ML compiles into a temporary folder, possibly on another volume.
    if std::fs::rename(&temp, &target).is_err() {
        let staging = target.with_extension("mlmodelc.partial");
        let _ = std::fs::remove_dir_all(&staging);
        copy_dir(&temp, &staging)?;
        std::fs::rename(&staging, &target)?;
        let _ = std::fs::remove_dir_all(&temp);
    }
    Ok(target)
}

fn copy_dir(from: &Path, to: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(to)?;
    for entry in std::fs::read_dir(from)? {
        let entry = entry?;
        let dest = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir(&entry.path(), &dest)?;
        } else {
            std::fs::copy(entry.path(), dest)?;
        }
    }
    Ok(())
}

unsafe fn load_model(
    compiled: &Path,
    function: &str,
    units: isize,
) -> anyhow::Result<Retained<AnyObject>> {
    let config: Retained<AnyObject> = msg_send![class!(MLModelConfiguration), new];
    let _: () = msg_send![&*config, setComputeUnits: units];
    let function = ns_string(function)?;
    let _: () = msg_send![&*config, setFunctionName: &*function];
    let url = file_url(compiled)?;
    let mut error: *mut AnyObject = ptr::null_mut();
    let model: Option<Retained<AnyObject>> = msg_send![
        class!(MLModel),
        modelWithContentsOfURL: &*url,
        configuration: &*config,
        error: &mut error
    ];
    model.ok_or_else(|| ns_error("Couldn't load the Bark encoder", error))
}

/// An MLMultiArray over row-major `data`, which must outlive it.
unsafe fn multi_array(
    data: *mut c_void,
    shape: &[usize],
    data_type: isize,
) -> anyhow::Result<Retained<AnyObject>> {
    let mut strides = vec![1; shape.len()];
    for i in (0..shape.len().saturating_sub(1)).rev() {
        strides[i] = strides[i + 1] * shape[i + 1];
    }
    let shape = ns_numbers(shape);
    let strides = ns_numbers(&strides);
    let no_deallocator: Option<&Block<dyn Fn(*mut c_void)>> = None;
    let mut error: *mut AnyObject = ptr::null_mut();
    let array: Allocated<AnyObject> = msg_send![class!(MLMultiArray), alloc];
    let array: Option<Retained<AnyObject>> = msg_send![
        array,
        initWithDataPointer: data,
        shape: &*shape,
        dataType: data_type,
        strides: &*strides,
        deallocator: no_deallocator,
        error: &mut error
    ];
    array.ok_or_else(|| ns_error("Couldn't pass audio to the Bark encoder", error))
}

unsafe fn feature_provider(features: &[(&str, &AnyObject)]) -> anyhow::Result<Retained<AnyObject>> {
    let mut keys = Vec::new();
    let mut values = Vec::new();
    for &(name, array) in features {
        keys.push(ns_string(name)?);
        let value: Option<Retained<AnyObject>> =
            msg_send![class!(MLFeatureValue), featureValueWithMultiArray: array];
        values.push(value.ok_or_else(|| anyhow!("Couldn't wrap the {name} input"))?);
    }
    let (keys, values) = (pointers(&keys), pointers(&values));
    let dict: Option<Retained<AnyObject>> = msg_send![
        class!(NSDictionary),
        dictionaryWithObjects: values.as_ptr(),
        forKeys: keys.as_ptr(),
        count: keys.len()
    ];
    let dict = dict.ok_or_else(|| anyhow!("Couldn't build the encoder inputs"))?;
    let mut error: *mut AnyObject = ptr::null_mut();
    let provider: Allocated<AnyObject> = msg_send![class!(MLDictionaryFeatureProvider), alloc];
    let provider: Option<Retained<AnyObject>> =
        msg_send![provider, initWithDictionary: &*dict, error: &mut error];
    provider.ok_or_else(|| ns_error("Couldn't build the encoder inputs", error))
}

/// Copies a [1, rows, cols] fp16 or fp32 MLMultiArray into a matrix.
unsafe fn read_matrix(array: &AnyObject) -> anyhow::Result<Array2<f32>> {
    let shape = integers(msg_send![array, shape]);
    let strides = integers(msg_send![array, strides]);
    let data_type: isize = msg_send![array, dataType];
    let (&[1, rows, cols], &[_, row_stride, col_stride]) = (&shape[..], &strides[..]) else {
        bail!("Unexpected Bark encoder output shape {shape:?}");
    };
    let size = match data_type {
        FLOAT16 => 2,
        FLOAT32 => 4,
        other => bail!("Unexpected Bark encoder output type {other:#x}"),
    };
    let last = (rows.max(1) - 1) * row_stride + (cols.max(1) - 1) * col_stride;
    let out = RefCell::new(None);
    let read = StackBlock::new(|bytes: *const c_void, len: isize| {
        if bytes.is_null() || (last + 1) * size > len.max(0) as usize {
            return;
        }
        let at = |r: usize, c: usize| r * row_stride + c * col_stride;
        let matrix = if data_type == FLOAT16 {
            let data = std::slice::from_raw_parts(bytes.cast::<u16>(), last + 1);
            Array2::from_shape_fn((rows, cols), |(r, c)| {
                half::f16::from_bits(data[at(r, c)]).to_f32()
            })
        } else {
            let data = std::slice::from_raw_parts(bytes.cast::<f32>(), last + 1);
            Array2::from_shape_fn((rows, cols), |(r, c)| data[at(r, c)])
        };
        *out.borrow_mut() = Some(matrix);
    });
    let _: () = msg_send![array, getBytesWithHandler: &*read];
    out.into_inner()
        .ok_or_else(|| anyhow!("Couldn't read the Bark encoder's output"))
}

unsafe fn integers(array: *mut AnyObject) -> Vec<usize> {
    let Some(array) = array.as_ref() else {
        return Vec::new();
    };
    let count: usize = msg_send![array, count];
    (0..count)
        .map(|i| {
            let n: *mut AnyObject = msg_send![array, objectAtIndex: i];
            n.as_ref().map_or(0, |n| {
                let v: isize = msg_send![n, integerValue];
                v.max(0) as usize
            })
        })
        .collect()
}

unsafe fn ns_numbers(values: &[usize]) -> Retained<AnyObject> {
    let numbers: Vec<Retained<AnyObject>> = values
        .iter()
        .map(|&v| msg_send![class!(NSNumber), numberWithInteger: v as isize])
        .collect();
    let numbers = pointers(&numbers);
    msg_send![class!(NSArray), arrayWithObjects: numbers.as_ptr(), count: numbers.len()]
}

fn pointers(objects: &[Retained<AnyObject>]) -> Vec<*mut AnyObject> {
    objects
        .iter()
        .map(|o| Retained::as_ptr(o).cast_mut())
        .collect()
}

unsafe fn ns_string(s: &str) -> anyhow::Result<Retained<AnyObject>> {
    let c = CString::new(s)?;
    let string: Option<Retained<AnyObject>> =
        msg_send![class!(NSString), stringWithUTF8String: c.as_ptr()];
    string.ok_or_else(|| anyhow!("Couldn't make an NSString of {s:?}"))
}

unsafe fn file_url(path: &Path) -> anyhow::Result<Retained<AnyObject>> {
    let path = path
        .to_str()
        .ok_or_else(|| anyhow!("Non-UTF-8 path {}", path.display()))?;
    let path = ns_string(path)?;
    let url: Option<Retained<AnyObject>> = msg_send![class!(NSURL), fileURLWithPath: &*path];
    url.ok_or_else(|| anyhow!("Couldn't make a file URL"))
}

unsafe fn rust_string(ns_string: *mut AnyObject) -> Option<String> {
    let s = ns_string.as_ref()?;
    let utf8: *const c_char = msg_send![s, UTF8String];
    (!utf8.is_null()).then(|| CStr::from_ptr(utf8).to_string_lossy().into_owned())
}

unsafe fn ns_error(context: &str, error: *mut AnyObject) -> anyhow::Error {
    let detail = error
        .as_ref()
        .and_then(|e| rust_string(msg_send![e, localizedDescription]));
    anyhow!(
        "{context}: {}",
        detail.as_deref().unwrap_or("no details from Core ML")
    )
}
