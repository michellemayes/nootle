use serde::Serialize;
use std::time::{Duration, Instant};

/// Bundle-ID prefixes of apps people take meetings in. Prefixes also cover
/// helper processes (e.g. `com.google.Chrome.helper`), which is where
/// browsers actually open the microphone. Entries are
/// (bundle-ID prefix, display name, is a web browser).
const MEETING_APPS: &[(&str, &str, bool)] = &[
    ("us.zoom.xos", "Zoom", false),
    ("com.microsoft.teams", "Microsoft Teams", false),
    ("com.google.Chrome", "Google Chrome", true),
    ("com.brave.Browser", "Brave", true),
    ("company.thebrowser.Browser", "Arc", true),
    ("com.microsoft.edgemac", "Microsoft Edge", true),
    ("org.mozilla.firefox", "Firefox", true),
    ("com.apple.Safari", "Safari", true),
    // Safari captures the mic from WebKit's shared GPU process.
    ("com.apple.WebKit.GPU", "Safari", true),
    ("Cisco-Systems.Spark", "Webex", false),
    ("com.webex.meetingmanager", "Webex", false),
    ("com.tinyspeck.slackmacgap", "Slack", false),
    ("com.apple.FaceTime", "FaceTime", false),
    ("com.hnc.Discord", "Discord", false),
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DetectedMeeting {
    pub app_name: String,
    pub display_name: String,
}

pub fn meeting_app_for_bundle(bundle_id: &str) -> Option<DetectedMeeting> {
    MEETING_APPS
        .iter()
        .find(|(prefix, _, _)| bundle_id.starts_with(prefix))
        .map(|&(prefix, display_name, _)| DetectedMeeting {
            app_name: prefix.to_string(),
            display_name: display_name.to_string(),
        })
}

/// Whether a meeting app (by display name) is a web browser, where any page
/// could be showing rather than the call.
pub fn is_browser(display_name: &str) -> bool {
    MEETING_APPS
        .iter()
        .any(|&(_, name, browser)| browser && name == display_name)
}

/// A meeting app currently capturing the microphone, if any. Merely having
/// Chrome or Slack open says nothing about a meeting; holding the mic does.
#[cfg(all(target_os = "macos", feature = "system-audio"))]
pub fn meeting_app_using_mic() -> Option<DetectedMeeting> {
    use cidre::core_audio as ca;

    let own_pid = std::process::id() as i32;
    ca::System::processes()
        .ok()?
        .into_iter()
        .filter(|p| p.is_running_input().unwrap_or(false) && p.pid().ok() != Some(own_pid))
        .find_map(|p| meeting_app_for_bundle(&p.bundle_id().ok()?.to_string()))
}

#[cfg(not(all(target_os = "macos", feature = "system-audio")))]
pub fn meeting_app_using_mic() -> Option<DetectedMeeting> {
    // Keeps the bundle-ID table compiled (and tested) on every platform.
    let _ = meeting_app_for_bundle;
    None
}

/// How long the mic must stay free before a meeting counts as over, so that
/// muting in a browser call (which releases the mic) doesn't re-notify.
const MEETING_END_GRACE: Duration = Duration::from_secs(120);

/// Tracks whether a meeting is in progress so the user is told once per
/// meeting rather than once per poll.
#[derive(Default)]
pub struct MeetingDetector {
    /// Last time a meeting app held the mic.
    last_on_mic: Option<Instant>,
}

impl MeetingDetector {
    /// Poll the system. Returns the meeting when a new one has just started.
    pub fn check(&mut self) -> Option<DetectedMeeting> {
        self.observe(meeting_app_using_mic(), Instant::now())
    }

    /// Returns the app when a meeting starts; nothing while it carries on,
    /// including short gaps where the mic is released.
    fn observe(
        &mut self,
        on_mic: Option<DetectedMeeting>,
        now: Instant,
    ) -> Option<DetectedMeeting> {
        let in_meeting = self
            .last_on_mic
            .is_some_and(|t| now.duration_since(t) < MEETING_END_GRACE);
        if on_mic.is_some() {
            self.last_on_mic = Some(now);
        }
        on_mic.filter(|_| !in_meeting)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn zoom() -> DetectedMeeting {
        meeting_app_for_bundle("us.zoom.xos").unwrap()
    }

    #[test]
    fn test_matches_helper_processes() {
        let m = meeting_app_for_bundle("com.google.Chrome.helper").unwrap();
        assert_eq!(m.display_name, "Google Chrome");
        assert!(meeting_app_for_bundle("com.apple.Music").is_none());
    }

    #[test]
    fn test_no_meeting_without_mic() {
        let mut detector = MeetingDetector::default();
        assert_eq!(detector.observe(None, Instant::now()), None);
    }

    #[test]
    fn test_notifies_once_per_meeting() {
        let mut detector = MeetingDetector::default();
        let t = Instant::now();
        assert_eq!(detector.observe(Some(zoom()), t), Some(zoom()));
        assert_eq!(
            detector.observe(Some(zoom()), t + Duration::from_secs(5)),
            None
        );
    }

    #[test]
    fn test_brief_mic_release_is_same_meeting() {
        let mut detector = MeetingDetector::default();
        let t = Instant::now();
        detector.observe(Some(zoom()), t);
        detector.observe(None, t + Duration::from_secs(30)); // muted
        assert_eq!(
            detector.observe(Some(zoom()), t + Duration::from_secs(60)),
            None
        );
    }

    #[test]
    fn test_notifies_again_for_next_meeting() {
        let mut detector = MeetingDetector::default();
        let t = Instant::now();
        detector.observe(Some(zoom()), t);
        detector.observe(None, t + MEETING_END_GRACE); // call over
        let later = t + MEETING_END_GRACE * 2;
        assert_eq!(detector.observe(Some(zoom()), later), Some(zoom()));
    }
}
