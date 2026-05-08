use nootle_app_lib::db::{
    Database, NewLinearTicket, NewMeeting, NewRecipe, NewSummary, NewTemplate,
    NewTranscriptSegment, UpdateTemplate,
};

#[test]
fn test_database_initializes_tables() {
    let db = Database::new_in_memory().unwrap();
    let tables = db.list_tables().unwrap();
    assert!(tables.contains(&"meetings".to_string()));
    assert!(tables.contains(&"transcripts".to_string()));
    assert!(tables.contains(&"summaries".to_string()));
    assert!(tables.contains(&"labels".to_string()));
    assert!(tables.contains(&"templates".to_string()));
    assert!(tables.contains(&"recipes".to_string()));
}

#[test]
fn test_create_and_get_meeting() {
    let db = Database::new_in_memory().unwrap();
    let meeting = db
        .create_meeting(NewMeeting {
            title: "Daily Standup".to_string(),
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
        calendar_event_id: None,
        template_id: None,
    })
    .unwrap();
    db.create_meeting(NewMeeting {
        title: "Meeting 2".to_string(),
        calendar_event_id: None,
        template_id: None,
    })
    .unwrap();

    let meetings = db.list_meetings(None, false).unwrap();
    assert_eq!(meetings.len(), 2);
}

#[test]
fn test_update_meeting_status() {
    let db = Database::new_in_memory().unwrap();
    let meeting = db
        .create_meeting(NewMeeting {
            title: "Test".to_string(),
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
            calendar_event_id: None,
            template_id: None,
        })
        .unwrap();

    db.delete_meeting(&meeting.id).unwrap();
    let result = db.get_meeting(&meeting.id);
    assert!(result.is_err());
}

#[test]
fn test_create_and_list_labels() {
    let db = Database::new_in_memory().unwrap();
    db.create_label("Standup", "#22c55e", Some("\u{1F7E2}"))
        .unwrap();
    db.create_label("1:1", "#3B82F6", None).unwrap();
    let labels = db.list_labels().unwrap();
    assert_eq!(labels.len(), 2);
    assert_eq!(labels[0].name, "1:1"); // alphabetical
}

#[test]
fn test_transcript_segments() {
    let db = Database::new_in_memory().unwrap();
    let meeting = db
        .create_meeting(NewMeeting {
            title: "Test".into(),
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
fn test_summaries() {
    let db = Database::new_in_memory().unwrap();
    let meeting = db
        .create_meeting(NewMeeting {
            title: "Test".into(),
            calendar_event_id: None,
            template_id: None,
        })
        .unwrap();
    db.create_summary(NewSummary {
        meeting_id: meeting.id.clone(),
        template_id: None,
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
            calendar_event_id: None,
            template_id: None,
        })
        .unwrap();
    let summary = db
        .create_summary(NewSummary {
            meeting_id: meeting.id.clone(),
            template_id: None,
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
fn test_update_workflow_can_change_integration_id() {
    let db = Database::new_in_memory().unwrap();
    let slack = db
        .create_integration("slack", "Slack", r#"{"bot_token":"xoxb-test"}"#)
        .unwrap();
    let github = db
        .create_integration("github", "GitHub", r#"{"token":"ghp_test"}"#)
        .unwrap();

    let workflow = db
        .create_workflow(
            "Post summary",
            Some("Send summary to Slack"),
            Some("💬"),
            &slack.id,
            "post_summary",
            "{\"channel\":\"#general\"}",
        )
        .unwrap();

    let updated = db
        .update_workflow(
            &workflow.id,
            "Create issues",
            Some("Turn action items into GitHub issues"),
            Some("🐙"),
            &github.id,
            "create_issues",
            r#"{"repo":"owner/repo"}"#,
            true,
        )
        .unwrap();

    assert_eq!(updated.integration_id, github.id);
    assert_eq!(updated.action_type, "create_issues");
    assert_eq!(updated.config_json, r#"{"repo":"owner/repo"}"#);
}

#[test]
fn test_search_transcripts() {
    let db = Database::new_in_memory().unwrap();
    let m1 = db
        .create_meeting(NewMeeting {
            title: "Sprint Review".into(),
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

    let custom = db
        .create_template(NewTemplate {
            name: "Standup".into(),
            description: "Quick daily sync".into(),
            sections: r#"["Blockers","Updates"]"#.into(),
            auto_apply_rules: "{}".into(),
            prompt: "Summarize the standup.".into(),
            is_favorite: false,
            is_auto_run: false,
        })
        .unwrap();
    assert_eq!(custom.name, "Standup");
    assert_eq!(custom.description, "Quick daily sync");
    assert_eq!(custom.prompt, "Summarize the standup.");
    assert!(!custom.is_builtin);

    let templates = db.list_templates().unwrap();
    assert_eq!(templates.len(), 9);

    let updated = db
        .update_template(&UpdateTemplate {
            id: custom.id.clone(),
            name: "Daily Sync".to_string(),
            description: "Updated description".to_string(),
            sections: r#"["Blockers","Updates","Next Steps"]"#.to_string(),
            auto_apply_rules: "{}".to_string(),
            prompt: "Updated prompt.".to_string(),
            is_favorite: true,
            is_auto_run: false,
        })
        .unwrap();
    assert_eq!(updated.name, "Daily Sync");
    assert_eq!(updated.description, "Updated description");
    assert_eq!(updated.prompt, "Updated prompt.");

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
        assert!(
            !t.prompt.is_empty(),
            "Template '{}' should have a prompt",
            t.name
        );
        assert!(
            !t.description.is_empty(),
            "Template '{}' should have a description",
            t.name
        );
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
            calendar_event_id: None,
            template_id: Some(template_id.clone()),
        })
        .unwrap();
    assert_eq!(meeting.template_id, Some(template_id.clone()));

    let fetched = db.get_meeting(&meeting.id).unwrap();
    assert_eq!(fetched.template_id, Some(template_id));
}

#[test]
fn test_create_and_list_labels_via_crud() {
    let db = Database::new_in_memory().unwrap();
    let label = db.create_label("Engineering", "#4EEABB", None).unwrap();
    assert_eq!(label.name, "Engineering");
    assert_eq!(label.color, "#4EEABB");
    let labels = db.list_labels().unwrap();
    assert_eq!(labels.len(), 1);
}

#[test]
fn test_update_label() {
    let db = Database::new_in_memory().unwrap();
    let label = db.create_label("Engineering", "#4EEABB", None).unwrap();
    let updated = db.update_label(&label.id, "Eng", "#C084FC", None).unwrap();
    assert_eq!(updated.name, "Eng");
    assert_eq!(updated.color, "#C084FC");
}

#[test]
fn test_delete_label() {
    let db = Database::new_in_memory().unwrap();
    let label = db.create_label("Engineering", "#4EEABB", None).unwrap();
    db.delete_label(&label.id).unwrap();
    let labels = db.list_labels().unwrap();
    assert_eq!(labels.len(), 0);
}

#[test]
fn test_meeting_labels() {
    let db = Database::new_in_memory().unwrap();
    let meeting = db
        .create_meeting(NewMeeting {
            title: "Test".into(),
            calendar_event_id: None,
            template_id: None,
        })
        .unwrap();
    let label1 = db.create_label("Engineering", "#4EEABB", None).unwrap();
    let label2 = db.create_label("Sprint 42", "#C084FC", None).unwrap();

    db.add_meeting_label(&meeting.id, &label1.id).unwrap();
    db.add_meeting_label(&meeting.id, &label2.id).unwrap();

    let labels = db.get_meeting_labels(&meeting.id).unwrap();
    assert_eq!(labels.len(), 2);

    db.remove_meeting_label(&meeting.id, &label1.id).unwrap();
    let labels = db.get_meeting_labels(&meeting.id).unwrap();
    assert_eq!(labels.len(), 1);
    assert_eq!(labels[0].name, "Sprint 42");
}

#[test]
fn test_get_all_meeting_labels() {
    let db = Database::new_in_memory().unwrap();
    let m1 = db
        .create_meeting(NewMeeting {
            title: "Meeting 1".into(),
            calendar_event_id: None,
            template_id: None,
        })
        .unwrap();
    let m2 = db
        .create_meeting(NewMeeting {
            title: "Meeting 2".into(),
            calendar_event_id: None,
            template_id: None,
        })
        .unwrap();
    let label = db.create_label("Shared", "#3B82F6", None).unwrap();
    db.add_meeting_label(&m1.id, &label.id).unwrap();
    db.add_meeting_label(&m2.id, &label.id).unwrap();

    let all = db.get_all_meeting_labels().unwrap();
    assert_eq!(all.len(), 2);
}

#[test]
fn test_scratch_notes() {
    let db = Database::new_in_memory().unwrap();
    let meeting = db
        .create_meeting(NewMeeting {
            title: "Test".into(),
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

#[test]
fn test_recipe_crud() {
    let db = Database::new_in_memory().unwrap();

    // Should have 5 built-in recipes from seed
    let recipes = db.list_recipes().unwrap();
    assert_eq!(recipes.len(), 5);
    assert!(recipes.iter().all(|r| r.is_builtin));

    let recipe = db
        .create_recipe(NewRecipe {
            name: "Custom".into(),
            description: "Test recipe".into(),
            slash_command: "custom".into(),
            prompt_template: "Do something with {{transcript}}".into(),
            output_format: "markdown".into(),
        })
        .unwrap();
    assert_eq!(recipe.slash_command, "custom");
    assert!(!recipe.is_builtin);

    let found = db.get_recipe_by_command("custom").unwrap();
    assert_eq!(found.id, recipe.id);

    let recipes = db.list_recipes().unwrap();
    assert_eq!(recipes.len(), 6);

    let updated = db
        .update_recipe(
            &recipe.id,
            "Custom Updated",
            "Updated description",
            "custom-v2",
            "New template {{transcript}}",
            "markdown",
        )
        .unwrap();
    assert_eq!(updated.name, "Custom Updated");
    assert_eq!(updated.slash_command, "custom-v2");

    db.delete_recipe(&recipe.id).unwrap();
    let recipes = db.list_recipes().unwrap();
    assert_eq!(recipes.len(), 5);
}
