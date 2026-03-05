use nootle_app_lib::db::{
    Database, NewCategory, NewLinearTicket, NewMeeting, NewPrompt, NewSummary, NewTemplate,
    NewTranscriptSegment,
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
            template_id: None,
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
        template_id: None,
    })
    .unwrap();
    db.create_meeting(NewMeeting {
        title: "Meeting 2".to_string(),
        category_id: None,
        calendar_event_id: None,
        template_id: None,
    })
    .unwrap();

    let meetings = db.list_meetings(None, None, false).unwrap();
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
            template_id: None,
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
            template_id: None,
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
            template_id: None,
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
            template_id: None,
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
            template_id: None,
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
fn test_create_and_list_linear_tickets() {
    let db = Database::new_in_memory().unwrap();
    let meeting = db
        .create_meeting(NewMeeting {
            title: "Linear Sync".into(),
            category_id: None,
            calendar_event_id: None,
            template_id: None,
        })
        .unwrap();
    let summary = db
        .create_summary(NewSummary {
            meeting_id: meeting.id.clone(),
            prompt_id: None,
            provider: "openai".into(),
            model: "gpt-4o".into(),
            content: "Action items for ticket creation".into(),
        })
        .unwrap();

    let created = db
        .create_linear_ticket(NewLinearTicket {
            summary_id: &summary.id,
            meeting_id: &meeting.id,
            linear_issue_id: "issue_123",
            linear_issue_url: "https://linear.app/nootle/issue/NOOTLE-123/example",
            linear_identifier: "NOOTLE-123",
            title: "Follow up on action items",
            team_id: "team_abc",
            project_id: Some("project_xyz"),
        })
        .unwrap();

    assert_eq!(created.summary_id, summary.id);
    assert_eq!(created.meeting_id, meeting.id);
    assert_eq!(created.linear_identifier, "NOOTLE-123");
    assert_eq!(created.project_id, Some("project_xyz".to_string()));

    let tickets = db.get_linear_tickets(&meeting.id).unwrap();
    assert_eq!(tickets.len(), 1);
    assert_eq!(tickets[0].id, created.id);
    assert_eq!(tickets[0].title, "Follow up on action items");
}

#[test]
fn test_search_transcripts() {
    let db = Database::new_in_memory().unwrap();
    let m1 = db
        .create_meeting(NewMeeting {
            title: "Sprint Review".into(),
            category_id: None,
            calendar_event_id: None,
            template_id: None,
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
    // The DB seeds 8 built-in templates on init
    let initial_templates = db.list_templates().unwrap();
    assert_eq!(initial_templates.len(), 8);
    assert!(initial_templates.iter().all(|t| t.is_builtin));

    // Create a custom template
    let custom = db
        .create_template(NewTemplate {
            name: "Standup".into(),
            description: "Quick daily sync".into(),
            category_id: None,
            sections: r#"["Blockers","Updates"]"#.into(),
            auto_apply_rules: "{}".into(),
            prompt: "Summarize the standup.".into(),
        })
        .unwrap();
    assert_eq!(custom.name, "Standup");
    assert_eq!(custom.description, "Quick daily sync");
    assert_eq!(custom.prompt, "Summarize the standup.");
    assert!(!custom.is_builtin);

    let templates = db.list_templates().unwrap();
    assert_eq!(templates.len(), 9);

    // Update the custom template
    let updated = db
        .update_template(
            &custom.id,
            "Daily Sync",
            "Updated description",
            None,
            r#"["Blockers","Updates","Next Steps"]"#,
            "{}",
            "Updated prompt.",
        )
        .unwrap();
    assert_eq!(updated.name, "Daily Sync");
    assert_eq!(updated.description, "Updated description");
    assert_eq!(updated.prompt, "Updated prompt.");

    // Delete the custom template
    db.delete_template(&custom.id).unwrap();
    let templates = db.list_templates().unwrap();
    assert_eq!(templates.len(), 8);
}

#[test]
fn test_builtin_templates_have_prompts() {
    let db = Database::new_in_memory().unwrap();
    let templates = db.list_templates().unwrap();
    for t in &templates {
        assert!(t.is_builtin);
        assert!(!t.prompt.is_empty(), "Template '{}' should have a prompt", t.name);
        assert!(!t.description.is_empty(), "Template '{}' should have a description", t.name);
    }
}

#[test]
fn test_meeting_with_template_id() {
    let db = Database::new_in_memory().unwrap();
    let templates = db.list_templates().unwrap();
    let template_id = templates[0].id.clone();

    let meeting = db
        .create_meeting(NewMeeting {
            title: "Templated Meeting".into(),
            category_id: None,
            calendar_event_id: None,
            template_id: Some(template_id.clone()),
        })
        .unwrap();
    assert_eq!(meeting.template_id, Some(template_id.clone()));

    let fetched = db.get_meeting(&meeting.id).unwrap();
    assert_eq!(fetched.template_id, Some(template_id));
}

#[test]
fn test_create_and_list_tags() {
    let db = Database::new_in_memory().unwrap();
    let tag = db.create_tag("Engineering", "#4EEABB").unwrap();
    assert_eq!(tag.name, "Engineering");
    assert_eq!(tag.color, "#4EEABB");
    let tags = db.list_tags().unwrap();
    assert_eq!(tags.len(), 1);
}

#[test]
fn test_update_tag() {
    let db = Database::new_in_memory().unwrap();
    let tag = db.create_tag("Engineering", "#4EEABB").unwrap();
    let updated = db.update_tag(&tag.id, "Eng", "#C084FC").unwrap();
    assert_eq!(updated.name, "Eng");
    assert_eq!(updated.color, "#C084FC");
}

#[test]
fn test_delete_tag() {
    let db = Database::new_in_memory().unwrap();
    let tag = db.create_tag("Engineering", "#4EEABB").unwrap();
    db.delete_tag(&tag.id).unwrap();
    let tags = db.list_tags().unwrap();
    assert_eq!(tags.len(), 0);
}

#[test]
fn test_meeting_tags() {
    let db = Database::new_in_memory().unwrap();
    let meeting = db
        .create_meeting(NewMeeting {
            title: "Test".into(),
            category_id: None,
            calendar_event_id: None,
            template_id: None,
        })
        .unwrap();
    let tag1 = db.create_tag("Engineering", "#4EEABB").unwrap();
    let tag2 = db.create_tag("Sprint 42", "#C084FC").unwrap();

    db.add_meeting_tag(&meeting.id, &tag1.id).unwrap();
    db.add_meeting_tag(&meeting.id, &tag2.id).unwrap();

    let tags = db.get_meeting_tags(&meeting.id).unwrap();
    assert_eq!(tags.len(), 2);

    db.remove_meeting_tag(&meeting.id, &tag1.id).unwrap();
    let tags = db.get_meeting_tags(&meeting.id).unwrap();
    assert_eq!(tags.len(), 1);
    assert_eq!(tags[0].name, "Sprint 42");
}

#[test]
fn test_get_all_meeting_tags() {
    let db = Database::new_in_memory().unwrap();
    let m1 = db
        .create_meeting(NewMeeting {
            title: "Meeting 1".into(),
            category_id: None,
            calendar_event_id: None,
            template_id: None,
        })
        .unwrap();
    let m2 = db
        .create_meeting(NewMeeting {
            title: "Meeting 2".into(),
            category_id: None,
            calendar_event_id: None,
            template_id: None,
        })
        .unwrap();
    let tag = db.create_tag("Shared", "#3B82F6").unwrap();
    db.add_meeting_tag(&m1.id, &tag.id).unwrap();
    db.add_meeting_tag(&m2.id, &tag.id).unwrap();

    let all = db.get_all_meeting_tags().unwrap();
    assert_eq!(all.len(), 2);
}

#[test]
fn test_scratch_notes() {
    let db = Database::new_in_memory().unwrap();
    let meeting = db
        .create_meeting(NewMeeting {
            title: "Test".into(),
            category_id: None,
            calendar_event_id: None,
            template_id: None,
        })
        .unwrap();

    let note = db
        .add_scratch_note(&meeting.id, "Important pricing discussion", 323000)
        .unwrap();
    assert_eq!(note.content, "Important pricing discussion");
    assert_eq!(note.timestamp_ms, 323000);

    let notes = db.get_scratch_notes(&meeting.id).unwrap();
    assert_eq!(notes.len(), 1);

    db.delete_scratch_note(&note.id).unwrap();
    let notes = db.get_scratch_notes(&meeting.id).unwrap();
    assert_eq!(notes.len(), 0);
}
