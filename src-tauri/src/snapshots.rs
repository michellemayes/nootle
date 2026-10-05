//! Snapshots: pictures of what's shared on screen during a meeting.
//!
//! While a recording runs (and the user has turned snapshots on), the meeting
//! app's own window is captured every few seconds. A frame is kept when
//! someone is sharing their screen and the shared content has changed, so a
//! slide deck yields one picture per slide. Only the meeting window is ever
//! captured, never the rest of the screen.
//!
//! Text is read off each snapshot on-device so summaries, chat and search can
//! answer questions like "what did the revenue chart say?".

use crate::audio::RecordedClock;
use crate::db::{Database, Snapshot};
use crate::detection::DetectedMeeting;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::Arc;
use std::time::Duration;
use tauri::Emitter;

/// App setting that turns snapshots on. Off unless set to "true".
pub const SETTING_KEY: &str = "snapshots_enabled";

/// How often the meeting window is looked at.
const POLL_INTERVAL: Duration = Duration::from_secs(3);
/// Keeps a runaway meeting from filling the disk.
const MAX_PER_MEETING: usize = 300;
/// Longest edge, in pixels, of the small frame captured each poll to spot
/// changes; the full-size capture only happens once one looks worth reading.
const THUMB_EDGE: f64 = 96.0;
/// Longest edge of a saved snapshot: sharp enough to read slide text, small
/// enough to keep each image to a few hundred KB.
const SNAPSHOT_EDGE: f64 = 2560.0;

pub fn enabled(db: &Database) -> bool {
    db.get_bool_setting(SETTING_KEY, false)
}

/// Where a meeting's snapshot images live.
pub fn dir_for(recordings_dir: &Path, meeting_id: &str) -> PathBuf {
    recordings_dir.join("snapshots").join(meeting_id)
}

// ---------------------------------------------------------------------------
// Picking the meeting window
// ---------------------------------------------------------------------------

/// What's needed of an on-screen window to decide whether it's the meeting.
#[derive(Debug, Clone)]
pub struct WindowInfo {
    pub bundle_id: String,
    pub title: String,
    pub width: f64,
    pub height: f64,
    pub on_screen: bool,
    /// 0 for normal app windows; menus, toolbars and overlays sit higher.
    pub layer: isize,
}

/// Browser window titles (the active tab) that mean a web meeting is showing.
const WEB_MEETING_TITLES: &[&str] = &[
    "google meet",
    "zoom",
    "microsoft teams",
    "webex",
    "whereby",
    "jitsi",
];

/// Whether a window of a meeting app is the meeting itself, judged by its
/// title. Browsers and chat apps only count while a call is the visible tab
/// or window, so ordinary browsing or chat is never captured.
fn is_meeting_title(app: &str, title: &str) -> bool {
    let title = title.to_lowercase();
    if crate::detection::is_browser(app) {
        // Google Meet tabs are titled "Meet - abc-defg-hij".
        return title.starts_with("meet ") || WEB_MEETING_TITLES.iter().any(|t| title.contains(t));
    }
    match app {
        "Slack" => title.contains("huddle"),
        // Discord's window is mostly chat; there's no reliable call title.
        "Discord" => false,
        // Zoom's home window, as opposed to the meeting.
        "Zoom" => !title.contains("workplace"),
        _ => true,
    }
}

/// The meeting window to capture: the largest normal on-screen window of the
/// app in the call whose title says it's the meeting.
pub fn pick_meeting_window(windows: &[WindowInfo], call: &DetectedMeeting) -> Option<usize> {
    windows
        .iter()
        .enumerate()
        .filter(|(_, w)| w.on_screen && w.layer == 0 && w.width >= 480.0 && w.height >= 320.0)
        .filter(|(_, w)| {
            crate::detection::meeting_app_for_bundle(&w.bundle_id)
                .is_some_and(|app| app.display_name == call.display_name)
        })
        .filter(|(_, w)| is_meeting_title(&call.display_name, &w.title))
        .max_by(|(_, a), (_, b)| (a.width * a.height).total_cmp(&(b.width * b.height)))
        .map(|(i, _)| i)
}

// ---------------------------------------------------------------------------
// Deciding which frames to keep
// ---------------------------------------------------------------------------

const SIG_W: u32 = 48;
const SIG_H: u32 = 27;

/// A tiny greyscale thumbnail, enough to tell whether two frames differ.
#[derive(Debug, Clone, PartialEq)]
pub struct Signature(Vec<u8>);

impl Signature {
    pub fn from_image(bytes: &[u8]) -> anyhow::Result<Self> {
        let img = image::load_from_memory(bytes)?;
        let small = img.resize_exact(SIG_W, SIG_H, image::imageops::FilterType::Triangle);
        Ok(Self(small.to_luma8().into_raw()))
    }

    /// Fraction of pixels that changed noticeably.
    fn changed_fraction(&self, other: &Self) -> f32 {
        let changed = self
            .0
            .iter()
            .zip(&other.0)
            .filter(|(a, b)| a.abs_diff(**b) > 24)
            .count();
        changed as f32 / self.0.len().max(1) as f32
    }
}

/// Cheap visual gate in front of text recognition. A frame is worth a closer
/// look once it has held still (shared slides and docs do; video doesn't) and
/// looks different from the last frame examined.
#[derive(Default)]
pub struct ChangeGate {
    previous: Option<Signature>,
    last_examined: Option<Signature>,
}

impl ChangeGate {
    /// At most this much of the frame may move between polls for it to count
    /// as still; faces in a filmstrip beside the share keep moving.
    const STILL: f32 = 0.05;
    /// This much must differ from the last examined frame to look again.
    const CHANGED: f32 = 0.02;

    pub fn observe(&mut self, frame: Signature) -> bool {
        let still = self
            .previous
            .as_ref()
            .is_some_and(|p| p.changed_fraction(&frame) < Self::STILL);
        let changed = self
            .last_examined
            .as_ref()
            .is_none_or(|e| e.changed_fraction(&frame) > Self::CHANGED);
        let examine = still && changed;
        if examine {
            self.last_examined = Some(frame.clone());
        }
        self.previous = Some(frame);
        examine
    }

    pub fn reset(&mut self) {
        *self = Self::default();
    }
}

/// On-screen wording meeting apps show while someone shares their screen,
/// e.g. Zoom's "You are viewing Sam's screen" or Meet's "Sam is presenting".
const SHARE_CUES: &[&str] = &[
    "presenting",
    "'s screen",
    "\u{2019}s screen",
    "is sharing",
    "are sharing",
    "sharing screen",
    "sharing their screen",
    "sharing your screen",
    "shared screen",
    "screen share",
];

pub fn shows_screen_share(text: &str) -> bool {
    let text = text.to_lowercase();
    SHARE_CUES.iter().any(|cue| text.contains(cue))
}

/// Words that identify a snapshot's content. Short tokens are mostly noise:
/// OCR fragments and the call timer.
fn words(text: &str) -> HashSet<String> {
    text.split(|c: char| !c.is_alphanumeric())
        .filter(|w| w.chars().count() >= 3)
        .map(str::to_lowercase)
        .collect()
}

/// Whether recognised text shows something new compared with the last
/// snapshot kept. Comparing words rather than pixels ignores the meeting's own
/// chrome and moving video, so each slide is kept once.
fn is_new_content(text: &HashSet<String>, last: &HashSet<String>) -> bool {
    const MIN_WORDS: usize = 5;
    const MIN_DIFFERENT: usize = 6;
    text.len() >= MIN_WORDS && text.symmetric_difference(last).count() >= MIN_DIFFERENT
}

// ---------------------------------------------------------------------------
// Context for summaries, chat and search
// ---------------------------------------------------------------------------

/// Snapshot text to add to a meeting's transcript wherever the LLM reads it.
/// Empty when the meeting has no snapshots with text.
pub fn context_section(db: &Database, meeting_id: &str) -> String {
    let snapshots = db.get_snapshots(meeting_id).unwrap_or_default();
    format_context(&snapshots)
}

fn format_context(snapshots: &[Snapshot]) -> String {
    let lines: Vec<String> = snapshots
        .iter()
        .filter(|s| !s.text.trim().is_empty())
        .map(|s| {
            format!(
                "[{}] {}",
                crate::summarization::format_ms(s.offset_ms),
                s.text.split_whitespace().collect::<Vec<_>>().join(" ")
            )
        })
        .collect();
    if lines.is_empty() {
        return String::new();
    }
    format!(
        "\n\nText read from slides, documents and charts shared on screen during the meeting \
         (it may include some of the meeting app's own interface):\n{}",
        lines.join("\n")
    )
}

// ---------------------------------------------------------------------------
// Running alongside a recording
// ---------------------------------------------------------------------------

/// Background capture for one recording. Stopping waits for the thread so
/// every snapshot is stored before post-meeting processing reads them.
pub struct Snapshotter {
    /// Dropping it wakes and ends the thread.
    stop: mpsc::Sender<()>,
    handle: std::thread::JoinHandle<()>,
}

impl Snapshotter {
    pub fn start(
        db: Arc<Database>,
        app: tauri::AppHandle,
        meeting_id: String,
        dir: PathBuf,
        is_paused: Arc<AtomicBool>,
        clock: RecordedClock,
    ) -> Self {
        let (stop, stopped) = mpsc::channel();
        let run = Run {
            db,
            app,
            meeting_id,
            dir,
            is_paused,
            clock,
            stopped,
        };
        let handle = std::thread::spawn(move || run.run());
        Self { stop, handle }
    }

    pub fn stop(self) {
        drop(self.stop);
        if self.handle.join().is_err() {
            tracing::error!("Snapshot thread panicked");
        }
    }
}

struct Run {
    db: Arc<Database>,
    app: tauri::AppHandle,
    meeting_id: String,
    dir: PathBuf,
    is_paused: Arc<AtomicBool>,
    clock: RecordedClock,
    stopped: mpsc::Receiver<()>,
}

impl Run {
    fn run(self) {
        let mut capturer = match platform::Capturer::new() {
            Ok(c) => c,
            Err(e) => {
                tracing::warn!("Snapshots unavailable: {e:#}");
                return;
            }
        };
        if let Err(e) = std::fs::create_dir_all(&self.dir) {
            tracing::warn!("Can't create snapshot folder: {e}");
            return;
        }

        let mut gate = ChangeGate::default();
        let mut last_words = HashSet::new();
        let mut taken = 0;

        while self.wait() && taken < MAX_PER_MEETING {
            let Some(thumb) = self.capture(&mut capturer, THUMB_EDGE) else {
                gate.reset();
                continue;
            };
            let Ok(sig) = Signature::from_image(&thumb) else {
                continue;
            };
            if !gate.observe(sig) {
                continue;
            }
            let Some(frame) = self.capture(&mut capturer, SNAPSHOT_EDGE) else {
                continue;
            };
            match self.examine(&frame, &mut last_words) {
                Ok(true) => taken += 1,
                Ok(false) => {}
                Err(e) => tracing::warn!("Snapshot failed: {e:#}"),
            }
        }
        tracing::info!("Took {taken} snapshots for meeting {}", self.meeting_id);
    }

    /// Sleep until the next poll. False once the recording has stopped.
    fn wait(&self) -> bool {
        matches!(
            self.stopped.recv_timeout(POLL_INTERVAL),
            Err(mpsc::RecvTimeoutError::Timeout)
        )
    }

    /// The meeting window as a JPEG, while recording (not paused) a call
    /// whose window is showing. Only ever the meeting app's window.
    fn capture(&self, capturer: &mut platform::Capturer, max_edge: f64) -> Option<Vec<u8>> {
        if self.is_paused.load(Ordering::Acquire) {
            return None;
        }
        let call = crate::detection::meeting_app_using_mic()?;
        capturer
            .capture_meeting_window(&call, max_edge)
            .unwrap_or_else(|e| {
                tracing::debug!("Snapshot capture failed: {e:#}");
                None
            })
    }

    /// Read the frame's text and keep it if it's newly shared content.
    fn examine(&self, jpeg: &[u8], last_words: &mut HashSet<String>) -> anyhow::Result<bool> {
        let offset_ms = self.clock.recorded().as_millis() as i64;
        let path = self.dir.join(format!("{}.jpg", uuid::Uuid::new_v4()));
        std::fs::write(&path, jpeg)?;

        let text = platform::recognize_text(&path).unwrap_or_else(|e| {
            tracing::debug!("Text recognition failed: {e:#}");
            String::new()
        });
        let found = words(&text);
        if !shows_screen_share(&text) || !is_new_content(&found, last_words) {
            let _ = std::fs::remove_file(&path);
            return Ok(false);
        }

        let snapshot =
            self.db
                .create_snapshot(&self.meeting_id, &path.to_string_lossy(), &text, offset_ms)?;
        *last_words = found;
        let _ = self.app.emit("snapshot-taken", &snapshot);
        Ok(true)
    }
}

// ---------------------------------------------------------------------------
// Platform: ScreenCaptureKit for the window, Vision for the text
// ---------------------------------------------------------------------------

#[cfg(all(target_os = "macos", feature = "system-audio"))]
mod platform {
    use super::{pick_meeting_window, WindowInfo};
    use crate::detection::DetectedMeeting;
    use anyhow::{anyhow, Context};
    use cidre::{cf, cg, ns, sc, ut, vn};
    use std::path::Path;

    pub struct Capturer {
        // ScreenCaptureKit is async; this thread drives it.
        rt: tokio::runtime::Runtime,
    }

    impl Capturer {
        pub fn new() -> anyhow::Result<Self> {
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()?;
            Ok(Self { rt })
        }

        /// The meeting window as a JPEG no larger than `max_edge` pixels,
        /// or None when it isn't on screen.
        pub fn capture_meeting_window(
            &mut self,
            call: &DetectedMeeting,
            max_edge: f64,
        ) -> anyhow::Result<Option<Vec<u8>>> {
            self.rt.block_on(capture(call, max_edge))
        }
    }

    async fn capture(call: &DetectedMeeting, max_edge: f64) -> anyhow::Result<Option<Vec<u8>>> {
        let content = sc::ShareableContent::current()
            .await
            .map_err(|e| anyhow!("list windows (check Screen Recording permission): {e:?}"))?;
        let windows = content.windows();
        let windows: Vec<&sc::Window> = windows.iter().collect();
        let infos: Vec<WindowInfo> = windows
            .iter()
            .map(|w| {
                let frame = w.frame();
                WindowInfo {
                    bundle_id: w
                        .owning_app()
                        .map(|a| a.bundle_id().to_string())
                        .unwrap_or_default(),
                    title: w.title().map(|t| t.to_string()).unwrap_or_default(),
                    width: frame.size.width,
                    height: frame.size.height,
                    on_screen: w.is_on_screen(),
                    layer: w.window_layer(),
                }
            })
            .collect();
        let Some(index) = pick_meeting_window(&infos, call) else {
            return Ok(None);
        };
        let window = windows[index];

        // Points to pixels at Retina density, capped.
        let (w, h) = (infos[index].width * 2.0, infos[index].height * 2.0);
        let scale = (max_edge / w.max(h)).min(1.0);
        let mut cfg = sc::StreamCfg::new();
        cfg.set_width((w * scale) as usize);
        cfg.set_height((h * scale) as usize);
        cfg.set_shows_cursor(false);

        let filter = sc::ContentFilter::with_desktop_independent_window(window);
        let image = sc::ScreenshotManager::capture_image(&filter, &cfg)
            .await
            .map_err(|e| anyhow!("capture window: {e:?}"))?;
        encode_jpeg(&image).map(Some)
    }

    fn encode_jpeg(image: &cg::Image) -> anyhow::Result<Vec<u8>> {
        let mut data = cf::DataMut::with_capacity(0);
        let jpeg = ut::Type::jpeg().id();
        let mut dst =
            cg::ImageDst::with_data(&mut data, jpeg.as_cf(), 1).context("create JPEG encoder")?;
        dst.add_image(image, None);
        anyhow::ensure!(dst.finalize(), "encode JPEG");
        drop(dst);
        Ok(data.as_slice().to_vec())
    }

    /// Text in the image, top to bottom, recognised on-device.
    pub fn recognize_text(path: &Path) -> anyhow::Result<String> {
        let url = ns::Url::with_fs_path_str(&path.to_string_lossy(), false);
        let handler = vn::ImageRequestHandler::with_url(&url, None);
        let mut request = vn::RecognizeTextRequest::new();
        request.set_recognition_level(vn::RequestTextRecognitionLevel::Accurate);
        request.set_uses_lang_correction(true);
        let requests = ns::Array::<vn::Request>::from_slice(&[&request]);
        handler
            .perform(&requests)
            .map_err(|e| anyhow!("recognize text: {e:?}"))?;

        let Some(results) = request.results() else {
            return Ok(String::new());
        };
        let lines: Vec<String> = results
            .iter()
            .filter_map(|obs| {
                obs.top_candidates(1)
                    .first()
                    .map(|c| c.string().to_string())
            })
            .collect();
        Ok(lines.join("\n"))
    }
}

#[cfg(not(all(target_os = "macos", feature = "system-audio")))]
mod platform {
    use crate::detection::DetectedMeeting;
    use std::path::Path;

    /// Window capture needs ScreenCaptureKit; elsewhere snapshots are off.
    pub struct Capturer;

    impl Capturer {
        pub fn new() -> anyhow::Result<Self> {
            anyhow::bail!("snapshots need macOS with the system-audio feature")
        }

        pub fn capture_meeting_window(
            &mut self,
            _call: &DetectedMeeting,
            _max_edge: f64,
        ) -> anyhow::Result<Option<Vec<u8>>> {
            Ok(None)
        }
    }

    pub fn recognize_text(_path: &Path) -> anyhow::Result<String> {
        Ok(String::new())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn window(bundle_id: &str, title: &str, width: f64, height: f64) -> WindowInfo {
        WindowInfo {
            bundle_id: bundle_id.into(),
            title: title.into(),
            width,
            height,
            on_screen: true,
            layer: 0,
        }
    }

    fn call(bundle_id: &str) -> DetectedMeeting {
        crate::detection::meeting_app_for_bundle(bundle_id).unwrap()
    }

    #[test]
    fn picks_largest_zoom_meeting_window() {
        let windows = [
            window("us.zoom.xos", "Zoom Workplace", 1400.0, 900.0),
            window("us.zoom.xos", "Zoom Meeting", 1200.0, 800.0),
            window("us.zoom.xos", "", 200.0, 40.0), // floating toolbar
            window("com.apple.Notes", "Secret notes", 1600.0, 1000.0),
        ];
        assert_eq!(pick_meeting_window(&windows, &call("us.zoom.xos")), Some(1));
    }

    #[test]
    fn browser_only_while_a_meeting_tab_is_showing() {
        let chrome = call("com.google.Chrome.helper");
        let browsing = [window("com.google.Chrome", "Inbox - Gmail", 1400.0, 900.0)];
        assert_eq!(pick_meeting_window(&browsing, &chrome), None);
        let meet = [window(
            "com.google.Chrome",
            "Meet - abc-defg-hij",
            1400.0,
            900.0,
        )];
        assert_eq!(pick_meeting_window(&meet, &chrome), Some(0));
    }

    #[test]
    fn safari_window_matches_webkit_mic_process() {
        let windows = [window("com.apple.Safari", "Zoom Meeting", 1400.0, 900.0)];
        assert_eq!(
            pick_meeting_window(&windows, &call("com.apple.WebKit.GPU")),
            Some(0)
        );
    }

    #[test]
    fn ignores_other_apps_and_hidden_windows() {
        let mut hidden = window("com.microsoft.teams2", "Meeting", 1400.0, 900.0);
        hidden.on_screen = false;
        let windows = [hidden, window("us.zoom.xos", "Zoom Meeting", 1400.0, 900.0)];
        assert_eq!(
            pick_meeting_window(&windows, &call("com.microsoft.teams2")),
            None
        );
    }

    #[test]
    fn slack_only_in_a_huddle() {
        let slack = call("com.tinyspeck.slackmacgap");
        let chat = [window(
            "com.tinyspeck.slackmacgap",
            "general - Acme",
            1400.0,
            900.0,
        )];
        assert_eq!(pick_meeting_window(&chat, &slack), None);
        let huddle = [window(
            "com.tinyspeck.slackmacgap",
            "Huddle: design",
            1400.0,
            900.0,
        )];
        assert_eq!(pick_meeting_window(&huddle, &slack), Some(0));
    }

    fn sig(fill: u8, changed: usize) -> Signature {
        let mut px = vec![fill; (SIG_W * SIG_H) as usize];
        for p in px.iter_mut().take(changed) {
            *p = fill.wrapping_add(100);
        }
        Signature(px)
    }

    #[test]
    fn gate_waits_for_a_still_frame() {
        let mut gate = ChangeGate::default();
        assert!(!gate.observe(sig(10, 0)), "nothing to compare with yet");
        assert!(gate.observe(sig(10, 0)), "held still");
        assert!(!gate.observe(sig(10, 0)), "already examined");
    }

    #[test]
    fn gate_skips_moving_video() {
        let mut gate = ChangeGate::default();
        let n = (SIG_W * SIG_H) as usize;
        assert!(!gate.observe(sig(10, 0)));
        assert!(!gate.observe(sig(200, n / 2)));
        assert!(!gate.observe(sig(10, n / 3)));
    }

    #[test]
    fn gate_examines_a_new_slide_once_settled() {
        let mut gate = ChangeGate::default();
        let n = (SIG_W * SIG_H) as usize;
        gate.observe(sig(10, 0));
        assert!(gate.observe(sig(10, 0)));
        // Next slide: a tenth of the frame changes, then holds.
        assert!(!gate.observe(sig(10, n / 10)), "still changing");
        assert!(gate.observe(sig(10, n / 10)), "settled on the new slide");
    }

    #[test]
    fn recognises_share_cues() {
        assert!(shows_screen_share(
            "You are viewing Sam's screen\nQ3 revenue"
        ));
        assert!(shows_screen_share("Sam (Presenting)"));
        assert!(shows_screen_share("Sam\u{2019}s screen"));
        assert!(!shows_screen_share("Mute  Stop Video  Participants  Chat"));
    }

    #[test]
    fn keeps_each_slide_once() {
        let slide1 = words("Q3 revenue grew 12% across all regions, led by EMEA");
        let slide1_again = words("Q3 revenue grew 12% across all regions, led by EMEA 10:42");
        let slide2 = words("Roadmap: launch billing, migrate search, hire two designers");
        assert!(is_new_content(&slide1, &HashSet::new()));
        assert!(!is_new_content(&slide1_again, &slide1));
        assert!(is_new_content(&slide2, &slide1));
        assert!(!is_new_content(&words("Sam Lee"), &HashSet::new()));
    }

    #[test]
    fn context_lists_snapshot_text_with_times() {
        let snap = |text: &str, offset_ms| Snapshot {
            id: "s".into(),
            meeting_id: "m".into(),
            image_path: "/x.jpg".into(),
            text: text.into(),
            offset_ms,
            created_at: String::new(),
        };
        assert_eq!(format_context(&[snap("  ", 0)]), "");
        let ctx = format_context(&[snap("Revenue\nQ3: $4.2M", 65_000)]);
        assert!(ctx.ends_with("[01:05] Revenue Q3: $4.2M"), "{ctx}");
    }

    #[test]
    fn signature_reads_a_jpeg() {
        let img = image::RgbImage::from_pixel(64, 36, image::Rgb([200, 10, 10]));
        let mut bytes = std::io::Cursor::new(Vec::new());
        img.write_to(&mut bytes, image::ImageFormat::Jpeg).unwrap();
        let sig = Signature::from_image(bytes.get_ref()).unwrap();
        assert_eq!(sig.0.len(), (SIG_W * SIG_H) as usize);
        assert_eq!(sig.changed_fraction(&sig), 0.0);
    }
}
