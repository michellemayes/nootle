//! Reads upcoming events from the macOS calendar (EventKit), so Nootle can
//! show what's next, name recordings after the meeting they capture, and
//! offer the call link.

use chrono::{DateTime, Duration, TimeZone, Utc};
use objc2::rc::{autoreleasepool, Retained};
use objc2::runtime::{AnyClass, AnyObject, Bool};
use objc2::{class, msg_send};
use serde::Serialize;
use std::ffi::{c_char, CStr};

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct CalendarEvent {
    pub id: String,
    pub title: String,
    /// RFC 3339.
    pub start: String,
    pub end: String,
    pub calendar: Option<String>,
    pub location: Option<String>,
    /// Zoom, Meet, Teams, … link found in the event's URL, location or notes.
    pub meeting_url: Option<String>,
    pub attendee_count: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct UpcomingEvents {
    /// Calendar permission: "granted", "denied" or "undetermined".
    pub status: String,
    pub events: Vec<CalendarEvent>,
}

/// How early a recording can start and still count as the next event.
const EARLY_START: i64 = 10;

/// Timed events overlapping the next `hours`, soonest first. Empty unless
/// calendar access has been granted.
pub fn upcoming(hours: i64) -> UpcomingEvents {
    let status = crate::permissions::check_calendar();
    let events = if status == "granted" {
        let now = Utc::now();
        let mut events = events_between(now, now + Duration::hours(hours));
        events.retain(|e| parse(&e.end).is_some_and(|end| end > now));
        events
    } else {
        Vec::new()
    };
    UpcomingEvents { status, events }
}

/// The event a recording starting now most likely belongs to.
pub fn current_event() -> Option<CalendarEvent> {
    if crate::permissions::check_calendar() != "granted" {
        return None;
    }
    let now = Utc::now();
    let events = events_between(
        now - Duration::hours(4),
        now + Duration::minutes(EARLY_START),
    );
    pick_current(events, now)
}

/// Of the events underway (or about to start), the one that began closest to
/// `now`: when a short call sits inside a long block, the call wins.
fn pick_current(events: Vec<CalendarEvent>, now: DateTime<Utc>) -> Option<CalendarEvent> {
    events
        .into_iter()
        .filter_map(|e| Some((parse(&e.start)?, parse(&e.end)?, e)))
        .filter(|(start, end, _)| *start <= now + Duration::minutes(EARLY_START) && *end > now)
        .min_by_key(|(start, _, _)| (*start - now).num_seconds().abs())
        .map(|(_, _, e)| e)
}

fn parse(rfc3339: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(rfc3339)
        .ok()
        .map(|d| d.with_timezone(&Utc))
}

/// Hosts whose links are a call to join, not just any URL in the notes.
const MEETING_HOSTS: &[&str] = &[
    "zoom.us",
    "meet.google.com",
    "teams.microsoft.com",
    "teams.live.com",
    "webex.com",
    "whereby.com",
    "meet.jit.si",
    "chime.aws",
    "gotomeeting.com",
    "meet.goto.com",
    "around.co",
    "app.slack.com/huddle",
    "discord.gg",
    "facetime.apple.com",
];

/// The first video-call link in `texts`, checked in order.
pub fn find_meeting_url<'a>(texts: impl IntoIterator<Item = &'a str>) -> Option<String> {
    texts.into_iter().find_map(|text| {
        text.match_indices("https://").find_map(|(i, _)| {
            let url: String = text[i..]
                .chars()
                .take_while(|c| !c.is_whitespace() && !"<>\"'()[]".contains(*c))
                .collect();
            let url = url.trim_end_matches(['.', ',', ';']);
            let rest = &url["https://".len()..];
            let host = rest.split(['/', '?', '#', ':']).next().unwrap_or_default();
            MEETING_HOSTS
                .iter()
                .any(|known| match known.split_once('/') {
                    // Path-scoped entries (Slack huddles) match by prefix.
                    Some(_) => rest.starts_with(known),
                    None => host == *known || host.ends_with(&format!(".{known}")),
                })
                .then(|| url.to_string())
        })
    })
}

/// Query EventKit for timed events overlapping `from..to`.
fn events_between(from: DateTime<Utc>, to: DateTime<Utc>) -> Vec<CalendarEvent> {
    let mut events = autoreleasepool(|_| unsafe { fetch(from, to) }).unwrap_or_default();
    events.sort_by(|a, b| a.start.cmp(&b.start));
    events
}

/// # Safety
/// Sends EventKit / Foundation messages; every object is nil-checked before use.
unsafe fn fetch(from: DateTime<Utc>, to: DateTime<Utc>) -> Option<Vec<CalendarEvent>> {
    let store_class = AnyClass::get(c"EKEventStore")?;
    let store: Option<Retained<AnyObject>> = msg_send![store_class, new];
    let store = store?;

    let start = ns_date(from)?;
    let end = ns_date(to)?;
    let all_calendars: *mut AnyObject = std::ptr::null_mut();
    let predicate: *mut AnyObject = msg_send![
        &*store,
        predicateForEventsWithStartDate: start,
        endDate: end,
        calendars: all_calendars
    ];
    let predicate = predicate.as_ref()?;
    let found: *mut AnyObject = msg_send![&*store, eventsMatchingPredicate: predicate];
    let found = found.as_ref()?;

    let count: usize = msg_send![found, count];
    let mut events = Vec::with_capacity(count);
    for i in 0..count {
        let event: *mut AnyObject = msg_send![found, objectAtIndex: i];
        let Some(event) = event.as_ref() else {
            continue;
        };
        // All-day entries are holidays and out-of-office, not meetings.
        let all_day: Bool = msg_send![event, isAllDay];
        if all_day.as_bool() {
            continue;
        }
        let (Some(id), Some(start), Some(end)) = (
            ns_string(msg_send![event, eventIdentifier]),
            date_of(msg_send![event, startDate]),
            date_of(msg_send![event, endDate]),
        ) else {
            continue;
        };

        let url: *mut AnyObject = msg_send![event, URL];
        let url = url
            .as_ref()
            .and_then(|u| ns_string(msg_send![u, absoluteString]));
        let location = ns_string(msg_send![event, location]).filter(|l| !l.trim().is_empty());
        let notes = ns_string(msg_send![event, notes]);
        let calendar: *mut AnyObject = msg_send![event, calendar];
        let calendar = calendar
            .as_ref()
            .and_then(|c| ns_string(msg_send![c, title]));
        let attendees: *mut AnyObject = msg_send![event, attendees];
        let attendee_count: usize = match attendees.as_ref() {
            Some(a) => msg_send![a, count],
            None => 0,
        };

        let meeting_url = find_meeting_url(
            [url.as_deref(), location.as_deref(), notes.as_deref()]
                .into_iter()
                .flatten(),
        );
        events.push(CalendarEvent {
            id,
            title: ns_string(msg_send![event, title])
                .filter(|t| !t.trim().is_empty())
                .unwrap_or_else(|| "Untitled event".to_string()),
            start: start.to_rfc3339(),
            end: end.to_rfc3339(),
            calendar,
            location,
            meeting_url,
            attendee_count,
        });
    }
    Some(events)
}

/// An autoreleased NSDate, valid until the enclosing pool drains.
unsafe fn ns_date(at: DateTime<Utc>) -> Option<*mut AnyObject> {
    let secs = at.timestamp() as f64;
    let date: *mut AnyObject = msg_send![class!(NSDate), dateWithTimeIntervalSince1970: secs];
    (!date.is_null()).then_some(date)
}

unsafe fn date_of(ns_date: *mut AnyObject) -> Option<DateTime<Utc>> {
    let date = ns_date.as_ref()?;
    let secs: f64 = msg_send![date, timeIntervalSince1970];
    Utc.timestamp_opt(secs as i64, 0).single()
}

unsafe fn ns_string(ns_string: *mut AnyObject) -> Option<String> {
    let s = ns_string.as_ref()?;
    let utf8: *const c_char = msg_send![s, UTF8String];
    (!utf8.is_null()).then(|| CStr::from_ptr(utf8).to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn event(id: &str, start: DateTime<Utc>, minutes: i64) -> CalendarEvent {
        CalendarEvent {
            id: id.into(),
            title: id.into(),
            start: start.to_rfc3339(),
            end: (start + Duration::minutes(minutes)).to_rfc3339(),
            calendar: None,
            location: None,
            meeting_url: None,
            attendee_count: 0,
        }
    }

    #[test]
    fn finds_call_links_but_not_other_urls() {
        assert_eq!(
            find_meeting_url([
                "Agenda: https://docs.example.com/plan.",
                "Join: https://us02web.zoom.us/j/123?pwd=abc.\nDial-in below"
            ]),
            Some("https://us02web.zoom.us/j/123?pwd=abc".into())
        );
        assert_eq!(
            find_meeting_url(["<https://meet.google.com/abc-defg-hij>"]),
            Some("https://meet.google.com/abc-defg-hij".into())
        );
        assert_eq!(
            find_meeting_url(["https://teams.microsoft.com/l/meetup-join/19%3a"]),
            Some("https://teams.microsoft.com/l/meetup-join/19%3a".into())
        );
        assert_eq!(find_meeting_url(["https://notzoom.us.evil.com/j/1"]), None);
        assert_eq!(find_meeting_url(["https://notzoom.us/j/1"]), None);
        assert_eq!(
            find_meeting_url(["https://app.slack.com/huddle/T1/C2"]),
            Some("https://app.slack.com/huddle/T1/C2".into())
        );
        assert_eq!(find_meeting_url(["Room 4B", "no link here"]), None);
    }

    #[test]
    fn picks_the_event_that_started_closest_to_now() {
        let now = Utc::now();
        let picked = pick_current(
            vec![
                event("offsite block", now - Duration::hours(2), 240),
                event("standup", now - Duration::minutes(2), 15),
                event("finished", now - Duration::minutes(40), 30),
            ],
            now,
        );
        assert_eq!(picked.unwrap().id, "standup");
    }

    #[test]
    fn counts_events_about_to_start() {
        let now = Utc::now();
        let soon = event("1:1", now + Duration::minutes(5), 30);
        assert_eq!(pick_current(vec![soon.clone()], now), Some(soon));
        let later = event("later", now + Duration::minutes(45), 30);
        assert_eq!(pick_current(vec![later], now), None);
    }
}
