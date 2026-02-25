//! macOS permission checks and requests for Microphone, Screen Recording, and Calendar.
//!
//! Uses raw ObjC FFI (`objc_msgSend`) and the `block2` crate for completion-handler blocks.

use objc2::runtime::{AnyObject, Bool as ObjcBool};
use serde::Serialize;
use std::ffi::{c_char, c_void};

// ── ObjC runtime FFI ──────────────────────────────────────────────────────────

type Id = *mut AnyObject;
type Class = *mut AnyObject;
type Sel = *const c_void;

extern "C" {
    fn objc_getClass(name: *const c_char) -> Class;
    fn sel_registerName(name: *const c_char) -> Sel;
    fn objc_msgSend();
}

// ── AVFoundation extern symbols ───────────────────────────────────────────────

#[link(name = "AVFoundation", kind = "framework")]
extern "C" {
    /// `AVMediaTypeAudio` – an NSString constant.
    static AVMediaTypeAudio: Id;
}

// ── CoreGraphics screen-capture helpers ───────────────────────────────────────

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
}

// ── EventKit framework link ───────────────────────────────────────────────────

#[link(name = "EventKit", kind = "framework")]
extern "C" {}

// ── Public types ──────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
pub struct PermissionStatus {
    pub microphone: String,
    pub screen_recording: bool,
    pub calendar: String,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Convert an AVAuthorizationStatus / EKAuthorizationStatus integer to a human-readable string.
fn authorization_status_to_string(status: i64) -> String {
    match status {
        0 => "undetermined".to_string(),
        1 => "denied".to_string(), // restricted – treat as denied for UI purposes
        2 => "denied".to_string(),
        3 => "granted".to_string(),
        4 => "granted".to_string(), // EK writeOnly – treat as granted
        _ => "undetermined".to_string(),
    }
}

// ── Microphone (AVFoundation) ─────────────────────────────────────────────────

/// Check `[AVCaptureDevice authorizationStatusForMediaType:AVMediaTypeAudio]`.
pub fn check_microphone() -> String {
    unsafe {
        let cls = objc_getClass(c"AVCaptureDevice".as_ptr());
        if cls.is_null() {
            return "undetermined".to_string();
        }
        let sel = sel_registerName(c"authorizationStatusForMediaType:".as_ptr());
        let msg_send: unsafe extern "C" fn(Class, Sel, Id) -> i64 =
            std::mem::transmute(objc_msgSend as unsafe extern "C" fn());
        let status = msg_send(cls, sel, AVMediaTypeAudio);
        authorization_status_to_string(status)
    }
}

/// Request microphone access. Returns `true` if granted.
///
/// Uses `[AVCaptureDevice requestAccessForMediaType:completionHandler:]` with a `block2` block
/// that bridges the callback to a `tokio::sync::oneshot` channel.
pub async fn request_microphone() -> bool {
    let (tx, rx) = tokio::sync::oneshot::channel::<bool>();

    // Scope the block so it is dropped before the .await, keeping the future Send.
    {
        let tx = std::sync::Mutex::new(Some(tx));

        // The ObjC completion handler signature is: void (^)(BOOL granted)
        let block = block2::RcBlock::new(move |granted: ObjcBool| {
            if let Ok(mut guard) = tx.lock() {
                if let Some(sender) = guard.take() {
                    let _ = sender.send(granted.as_bool());
                }
            }
        });

        unsafe {
            let cls = objc_getClass(c"AVCaptureDevice".as_ptr());
            if cls.is_null() {
                return false;
            }
            let sel = sel_registerName(c"requestAccessForMediaType:completionHandler:".as_ptr());
            let msg_send: unsafe extern "C" fn(
                Class,
                Sel,
                Id,
                *const block2::Block<dyn Fn(ObjcBool)>,
            ) = std::mem::transmute(objc_msgSend as unsafe extern "C" fn());
            msg_send(cls, sel, AVMediaTypeAudio, &*block);
        }
    }

    rx.await.unwrap_or(false)
}

// ── Screen Recording (CoreGraphics) ───────────────────────────────────────────

pub fn check_screen_recording() -> bool {
    unsafe { CGPreflightScreenCaptureAccess() }
}

pub fn request_screen_recording() -> bool {
    unsafe { CGRequestScreenCaptureAccess() }
}

// ── Calendar (EventKit) ───────────────────────────────────────────────────────

/// Check `[EKEventStore authorizationStatusForEntityType:EKEntityTypeEvent]`.
/// `EKEntityTypeEvent` == 0.
pub fn check_calendar() -> String {
    unsafe {
        let cls = objc_getClass(c"EKEventStore".as_ptr());
        if cls.is_null() {
            return "undetermined".to_string();
        }
        let sel = sel_registerName(c"authorizationStatusForEntityType:".as_ptr());
        let msg_send: unsafe extern "C" fn(Class, Sel, u64) -> i64 =
            std::mem::transmute(objc_msgSend as unsafe extern "C" fn());
        let status = msg_send(cls, sel, 0u64); // 0 = EKEntityTypeEvent
        authorization_status_to_string(status)
    }
}

/// Request full calendar access. Returns `true` if granted.
///
/// 1. `[[EKEventStore alloc] init]` to get an instance.
/// 2. Call `requestFullAccessToEventsWithCompletion:` with a block.
pub async fn request_calendar() -> bool {
    let (tx, rx) = tokio::sync::oneshot::channel::<bool>();

    // Scope the block and ObjC calls so they are dropped before the .await,
    // keeping the future Send.
    {
        let tx = std::sync::Mutex::new(Some(tx));

        // The completion handler signature is: void (^)(BOOL granted, NSError *error)
        let block = block2::RcBlock::new(move |granted: ObjcBool, _error: *mut AnyObject| {
            if let Ok(mut guard) = tx.lock() {
                if let Some(sender) = guard.take() {
                    let _ = sender.send(granted.as_bool());
                }
            }
        });

        unsafe {
            let cls = objc_getClass(c"EKEventStore".as_ptr());
            if cls.is_null() {
                return false;
            }

            // [[EKEventStore alloc] init]
            let alloc_sel = sel_registerName(c"alloc".as_ptr());
            let init_sel = sel_registerName(c"init".as_ptr());

            let msg_send_id: unsafe extern "C" fn(Class, Sel) -> Id =
                std::mem::transmute(objc_msgSend as unsafe extern "C" fn());
            let msg_send_init: unsafe extern "C" fn(Id, Sel) -> Id =
                std::mem::transmute(objc_msgSend as unsafe extern "C" fn());

            let obj = msg_send_id(cls, alloc_sel);
            if obj.is_null() {
                return false;
            }
            let store = msg_send_init(obj, init_sel);
            if store.is_null() {
                return false;
            }

            // [store requestFullAccessToEventsWithCompletion:]
            let sel = sel_registerName(c"requestFullAccessToEventsWithCompletion:".as_ptr());
            let msg_send_block: unsafe extern "C" fn(
                Id,
                Sel,
                *const block2::Block<dyn Fn(ObjcBool, *mut AnyObject)>,
            ) = std::mem::transmute(objc_msgSend as unsafe extern "C" fn());
            msg_send_block(store, sel, &*block);
        }
    }

    rx.await.unwrap_or(false)
}

// ── Aggregated check ──────────────────────────────────────────────────────────

pub fn check_all() -> PermissionStatus {
    PermissionStatus {
        microphone: check_microphone(),
        screen_recording: check_screen_recording(),
        calendar: check_calendar(),
    }
}
