use nootle_app_lib::db::{Database, NewMeeting};

#[test]
fn test_database_initializes_tables() {
    let db = Database::new_in_memory().unwrap();
    let tables = db.list_tables().unwrap();
    assert!(tables.contains(&"meetings".to_string()));
    assert!(tables.contains(&"transcripts".to_string()));
    assert!(tables.contains(&"summaries".to_string()));
    assert!(tables.contains(&"categories".to_string()));
    assert!(tables.contains(&"templates".to_string()));
    assert!(tables.contains(&"prompts".to_string()));
}

#[test]
fn test_create_and_get_meeting() {
    let db = Database::new_in_memory().unwrap();
    let meeting = db
        .create_meeting(NewMeeting {
            title: "Daily Standup".to_string(),
            category_id: None,
            calendar_event_id: None,
        })
        .unwrap();

    assert_eq!(meeting.title, "Daily Standup");
    assert_eq!(meeting.status, "recording");

    let fetched = db.get_meeting(&meeting.id).unwrap();
    assert_eq!(fetched.title, "Daily Standup");
}

#[test]
fn test_list_meetings() {
    let db = Database::new_in_memory().unwrap();
    db.create_meeting(NewMeeting {
        title: "Meeting 1".to_string(),
        category_id: None,
        calendar_event_id: None,
    })
    .unwrap();
    db.create_meeting(NewMeeting {
        title: "Meeting 2".to_string(),
        category_id: None,
        calendar_event_id: None,
    })
    .unwrap();

    let meetings = db.list_meetings(None, None).unwrap();
    assert_eq!(meetings.len(), 2);
}

#[test]
fn test_update_meeting_status() {
    let db = Database::new_in_memory().unwrap();
    let meeting = db
        .create_meeting(NewMeeting {
            title: "Test".to_string(),
            category_id: None,
            calendar_event_id: None,
        })
        .unwrap();

    db.update_meeting_status(&meeting.id, "summarized").unwrap();
    let updated = db.get_meeting(&meeting.id).unwrap();
    assert_eq!(updated.status, "summarized");
}

#[test]
fn test_delete_meeting() {
    let db = Database::new_in_memory().unwrap();
    let meeting = db
        .create_meeting(NewMeeting {
            title: "To Delete".to_string(),
            category_id: None,
            calendar_event_id: None,
        })
        .unwrap();

    db.delete_meeting(&meeting.id).unwrap();
    let result = db.get_meeting(&meeting.id);
    assert!(result.is_err());
}
