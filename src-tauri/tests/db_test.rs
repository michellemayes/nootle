use nootle_app_lib::db::{
    Database, NewCategory, NewMeeting, NewPrompt, NewSummary, NewTemplate, NewTranscriptSegment,
};

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
fn test_finalize_meeting() {
    let db = Database::new_in_memory().unwrap();
    let meeting = db
        .create_meeting(NewMeeting {
            title: "Finalize Test".to_string(),
            category_id: None,
            calendar_event_id: None,
        })
        .unwrap();

    assert!(meeting.end_time.is_none());
    assert!(meeting.audio_path.is_none());

    db.finalize_meeting(
        &meeting.id,
        "2026-02-25T12:00:00Z",
        Some("/path/to/audio.wav"),
        "transcribing",
    )
    .unwrap();

    let updated = db.get_meeting(&meeting.id).unwrap();
    assert_eq!(updated.end_time, Some("2026-02-25T12:00:00Z".to_string()));
    assert_eq!(updated.audio_path, Some("/path/to/audio.wav".to_string()));
    assert_eq!(updated.status, "transcribing");
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

#[test]
fn test_create_and_list_categories() {
    let db = Database::new_in_memory().unwrap();
    db.create_category(NewCategory {
        name: "Standup".into(),
        color: Some("#22c55e".into()),
        icon: Some("\u{1F7E2}".into()),
    })
    .unwrap();
    db.create_category(NewCategory {
        name: "1:1".into(),
        color: None,
        icon: None,
    })
    .unwrap();
    let cats = db.list_categories().unwrap();
    assert_eq!(cats.len(), 2);
    assert_eq!(cats[0].name, "1:1"); // alphabetical
}

#[test]
fn test_transcript_segments() {
    let db = Database::new_in_memory().unwrap();
    let meeting = db
        .create_meeting(NewMeeting {
            title: "Test".into(),
            category_id: None,
            calendar_event_id: None,
        })
        .unwrap();
    db.create_transcript_segment(NewTranscriptSegment {
        meeting_id: meeting.id.clone(),
        speaker_label: "Speaker 1".into(),
        text: "Hello everyone".into(),
        start_ms: 0,
        end_ms: 2000,
        confidence: 0.95,
    })
    .unwrap();
    db.create_transcript_segment(NewTranscriptSegment {
        meeting_id: meeting.id.clone(),
        speaker_label: "Speaker 2".into(),
        text: "Hi there".into(),
        start_ms: 2000,
        end_ms: 3500,
        confidence: 0.92,
    })
    .unwrap();
    let segments = db.get_transcript(&meeting.id).unwrap();
    assert_eq!(segments.len(), 2);
    assert_eq!(segments[0].text, "Hello everyone");
}

#[test]
fn test_prompts_crud() {
    let db = Database::new_in_memory().unwrap();
    let prompt = db
        .create_prompt(NewPrompt {
            name: "Action Items".into(),
            content: "List action items".into(),
            is_favorite: true,
            is_auto_run: true,
        })
        .unwrap();
    assert!(prompt.is_favorite);
    db.create_prompt(NewPrompt {
        name: "Summary".into(),
        content: "Summarize".into(),
        is_favorite: false,
        is_auto_run: false,
    })
    .unwrap();
    let all = db.list_prompts().unwrap();
    assert_eq!(all.len(), 2);
    let auto = db.get_auto_run_prompts().unwrap();
    assert_eq!(auto.len(), 1);
    assert_eq!(auto[0].name, "Action Items");
}

#[test]
fn test_summaries() {
    let db = Database::new_in_memory().unwrap();
    let meeting = db
        .create_meeting(NewMeeting {
            title: "Test".into(),
            category_id: None,
            calendar_event_id: None,
        })
        .unwrap();
    db.create_summary(NewSummary {
        meeting_id: meeting.id.clone(),
        prompt_id: None,
        provider: "openai".into(),
        model: "gpt-4o".into(),
        content: "Key points...".into(),
    })
    .unwrap();
    let sums = db.get_summaries_for_meeting(&meeting.id).unwrap();
    assert_eq!(sums.len(), 1);
    assert_eq!(sums[0].provider, "openai");
}

#[test]
fn test_search_transcripts() {
    let db = Database::new_in_memory().unwrap();
    let m1 = db
        .create_meeting(NewMeeting {
            title: "Sprint Review".into(),
            category_id: None,
            calendar_event_id: None,
        })
        .unwrap();
    db.create_transcript_segment(NewTranscriptSegment {
        meeting_id: m1.id.clone(),
        speaker_label: "Alice".into(),
        text: "We shipped the authentication feature".into(),
        start_ms: 0,
        end_ms: 3000,
        confidence: 0.95,
    })
    .unwrap();
    db.create_transcript_segment(NewTranscriptSegment {
        meeting_id: m1.id.clone(),
        speaker_label: "Bob".into(),
        text: "The database migration is complete".into(),
        start_ms: 3000,
        end_ms: 6000,
        confidence: 0.90,
    })
    .unwrap();
    let results = db.search_transcripts("authentication").unwrap();
    assert_eq!(results.len(), 1);
    assert!(results[0].text.contains("authentication"));
    assert_eq!(results[0].meeting_title, "Sprint Review");
}

#[test]
fn test_templates_crud() {
    let db = Database::new_in_memory().unwrap();
    db.create_template(NewTemplate {
        name: "Standup".into(),
        category_id: None,
        sections: r#"["Blockers","Updates"]"#.into(),
        auto_apply_rules: "{}".into(),
    })
    .unwrap();
    let templates = db.list_templates().unwrap();
    assert_eq!(templates.len(), 1);
    assert_eq!(templates[0].name, "Standup");
}
