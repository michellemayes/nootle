use serde::Serialize;
use std::collections::HashSet;
use sysinfo::System;

const MEETING_APPS: &[(&str, &str)] = &[
    ("zoom.us", "Zoom"),
    ("Microsoft Teams", "Teams"),
    ("Google Chrome", "Google Meet"), // Meet runs in Chrome
    ("Brave Browser", "Google Meet"),
    ("Arc", "Google Meet"),
    ("Safari", "Google Meet"),
    ("Firefox", "Google Meet"),
];

#[derive(Debug, Clone, Serialize)]
pub struct DetectedMeeting {
    pub app_name: String,
    pub display_name: String,
}

pub struct MeetingDetector {
    system: System,
    known_active: HashSet<String>,
}

impl MeetingDetector {
    pub fn new() -> Self {
        Self {
            system: System::new(),
            known_active: HashSet::new(),
        }
    }

    /// Check for newly started meeting apps.
    /// Returns only newly detected meetings (not ones already known).
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

        // Update known active set
        self.known_active = currently_running;

        detected
    }

    /// Get list of currently active meeting apps
    pub fn active_apps(&self) -> Vec<String> {
        self.known_active.iter().cloned().collect()
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
        // Just verify it runs without crashing
        let _ = detector.check();
    }
}
