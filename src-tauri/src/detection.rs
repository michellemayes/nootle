use serde::Serialize;
use std::collections::HashSet;
use sysinfo::System;

const MEETING_APPS: &[(&str, &str)] = &[
    ("zoom.us", "Zoom"),
    ("Microsoft Teams", "Teams"),
    ("Google Chrome", "Google Meet"),
    ("Brave Browser", "Google Meet"),
    ("Arc", "Google Meet"),
    ("Safari", "Google Meet"),
    ("Firefox", "Google Meet"),
    ("Webex", "Webex"),
    ("Slack", "Slack Huddle"),
];

#[derive(Debug, Clone, Serialize)]
pub struct DetectedMeeting {
    pub app_name: String,
    pub display_name: String,
}

pub struct MeetingDetector {
    system: System,
    known_active: HashSet<String>,
    notified_session: bool,
    vad_positive_count: u32,
}

impl Default for MeetingDetector {
    fn default() -> Self {
        Self::new()
    }
}

impl MeetingDetector {
    pub fn new() -> Self {
        Self {
            system: System::new(),
            known_active: HashSet::new(),
            notified_session: false,
            vad_positive_count: 0,
        }
    }

    pub fn check(&mut self) -> Vec<DetectedMeeting> {
        self.system
            .refresh_processes(sysinfo::ProcessesToUpdate::All, true);
        let mut detected = Vec::new();
        let mut currently_running = HashSet::new();

        for process in self.system.processes().values() {
            let name = process.name().to_string_lossy().to_string();
            for &(process_name, display_name) in MEETING_APPS {
                if name.contains(process_name) {
                    currently_running.insert(process_name.to_string());
                    if !self.known_active.contains(process_name) {
                        detected.push(DetectedMeeting {
                            app_name: process_name.to_string(),
                            display_name: display_name.to_string(),
                        });
                    }
                }
            }
        }

        self.known_active = currently_running;
        detected
    }

    /// Update VAD state. Returns true if speech is consistently detected.
    pub fn update_vad(&mut self, speech_probability: f32) -> bool {
        if speech_probability > 0.7 {
            self.vad_positive_count += 1;
        } else {
            self.vad_positive_count = self.vad_positive_count.saturating_sub(1);
        }
        self.vad_positive_count >= 3
    }

    /// Check if we should notify. Returns true once per session.
    /// Requires meeting app running + VAD positive (2 signals).
    pub fn should_notify(&mut self, has_meeting_app: bool, has_speech: bool) -> bool {
        if self.notified_session {
            return false;
        }
        if has_meeting_app && has_speech {
            self.notified_session = true;
            return true;
        }
        false
    }

    /// Reset notification state when all meeting apps close.
    pub fn reset_session(&mut self) {
        if self.known_active.is_empty() {
            self.notified_session = false;
            self.vad_positive_count = 0;
        }
    }

    pub fn active_apps(&self) -> Vec<String> {
        self.known_active.iter().cloned().collect()
    }

    pub fn has_active_meeting_app(&self) -> bool {
        !self.known_active.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detector_creates() {
        let detector = MeetingDetector::new();
        assert!(detector.active_apps().is_empty());
    }

    #[test]
    fn test_check_returns_vec() {
        let mut detector = MeetingDetector::new();
        let _ = detector.check();
    }

    #[test]
    fn test_vad_requires_consecutive_positives() {
        let mut detector = MeetingDetector::new();
        assert!(!detector.update_vad(0.9)); // 1
        assert!(!detector.update_vad(0.9)); // 2
        assert!(detector.update_vad(0.9)); // 3 - triggers
    }

    #[test]
    fn test_vad_resets_on_negative() {
        let mut detector = MeetingDetector::new();
        detector.update_vad(0.9); // 1
        detector.update_vad(0.9); // 2
        detector.update_vad(0.3); // drops to 1
        assert!(!detector.update_vad(0.9)); // back to 2
    }

    #[test]
    fn test_should_notify_once_per_session() {
        let mut detector = MeetingDetector::new();
        assert!(detector.should_notify(true, true)); // first time
        assert!(!detector.should_notify(true, true)); // already notified
    }

    #[test]
    fn test_should_notify_requires_both_signals() {
        let mut detector = MeetingDetector::new();
        assert!(!detector.should_notify(true, false)); // app only
        assert!(!detector.should_notify(false, true)); // vad only
        assert!(detector.should_notify(true, true)); // both
    }

    #[test]
    fn test_reset_session_when_apps_close() {
        let mut detector = MeetingDetector::new();
        detector.should_notify(true, true); // notified
        assert!(!detector.should_notify(true, true)); // won't re-notify

        // Simulate apps closing (known_active becomes empty after check finds nothing)
        detector.known_active.clear();
        detector.reset_session();

        assert!(detector.should_notify(true, true)); // can notify again
    }
}
