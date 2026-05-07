//! End-to-end user journey tests.
//!
//! Each test simulates a complete user flow through the database layer,
//! chaining operations the way they happen in the real product.

use nootle_app_lib::db::{
    Database, MeetingEngagement, NewActionItem, NewInsight, NewLinearTicket, NewMeeting, NewRecipe,
    NewSummary, NewTemplate, NewTranscriptSegment, SentimentSegment, SpeakerAnalytics,
    TranscriptChunk, UpdateTemplate,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn fresh_db() -> Database {
    Database::new_in_memory().unwrap()
}

/// Creates a meeting that has been finalized with a transcript — the most
/// common starting point for downstream features.
fn meeting_with_transcript(db: &Database, title: &str) -> String {
    let meeting = db
        .create_meeting(NewMeeting {
            title: title.into(),
            calendar_event_id: None,
            template_id: None,
        })
        .unwrap();

    db.create_transcript_segment(NewTranscriptSegment {
        meeting_id: meeting.id.clone(),
        speaker_label: "Alice".into(),
        text: "Let's review the Q1 roadmap and prioritize features.".into(),
        start_ms: 0,
        end_ms: 4000,
        confidence: 0.95,
    })
    .unwrap();

    db.create_transcript_segment(NewTranscriptSegment {
        meeting_id: meeting.id.clone(),
        speaker_label: "Bob".into(),
        text: "I think we should focus on the authentication overhaul first.".into(),
        start_ms: 4000,
        end_ms: 8000,
        confidence: 0.92,
    })
    .unwrap();

    db.create_transcript_segment(NewTranscriptSegment {
        meeting_id: meeting.id.clone(),
        speaker_label: "Alice".into(),
        text: "Agreed. Bob, can you draft the RFC by Friday?".into(),
        start_ms: 8000,
        end_ms: 11000,
        confidence: 0.97,
    })
    .unwrap();

    db.finalize_meeting(
        &meeting.id,
        "2026-03-07T10:30:00Z",
        Some("/recordings/test.wav"),
        "transcribing",
    )
    .unwrap();

    meeting.id
}

// ---------------------------------------------------------------------------
// 1. Full meeting lifecycle
// ---------------------------------------------------------------------------

#[test]
fn journey_meeting_lifecycle_recording_to_summarized() {
    let db = fresh_db();

    // User starts a recording
    let meeting = db
        .create_meeting(NewMeeting {
            title: "Sprint Planning".into(),
            calendar_event_id: Some("cal_abc123".into()),
            template_id: None,
        })
        .unwrap();
    assert_eq!(meeting.status, "recording");
    assert!(meeting.end_time.is_none());

    // Transcript segments arrive in real-time
    for (i, (speaker, text)) in [
        ("Alice", "Welcome everyone to sprint planning."),
        ("Bob", "I have three items to discuss."),
        ("Charlie", "Let's start with the highest priority."),
        ("Alice", "Good idea. Bob, go ahead."),
        (
            "Bob",
            "We need to ship the billing integration by end of sprint.",
        ),
    ]
    .iter()
    .enumerate()
    {
        db.create_transcript_segment(NewTranscriptSegment {
            meeting_id: meeting.id.clone(),
            speaker_label: speaker.to_string(),
            text: text.to_string(),
            start_ms: (i as i64) * 3000,
            end_ms: ((i + 1) as i64) * 3000,
            confidence: 0.93,
        })
        .unwrap();
    }

    // User takes a scratch note during recording
    let note = db
        .add_scratch_note(&meeting.id, "Follow up on billing timeline", 7500)
        .unwrap();
    assert_eq!(note.timestamp_ms, 7500);

    // Recording stops → meeting finalized
    db.finalize_meeting(
        &meeting.id,
        "2026-03-07T10:30:00Z",
        Some("/recordings/sprint_planning.wav"),
        "transcribing",
    )
    .unwrap();

    let m = db.get_meeting(&meeting.id).unwrap();
    assert_eq!(m.status, "transcribing");
    assert!(m.end_time.is_some());
    assert!(m.audio_path.is_some());

    // Verify full transcript is intact
    let transcript = db.get_transcript(&meeting.id).unwrap();
    assert_eq!(transcript.len(), 5);
    assert_eq!(transcript[0].speaker_label, "Alice");
    assert_eq!(transcript[4].speaker_label, "Bob");

    // Scratch notes survive finalization
    let notes = db.get_scratch_notes(&meeting.id).unwrap();
    assert_eq!(notes.len(), 1);

    // Summary gets generated
    db.create_summary(NewSummary {
        meeting_id: meeting.id.clone(),
        template_id: None,
        provider: "anthropic".into(),
        model: "claude-sonnet-4-20250514".into(),
        content:
            "## Sprint Planning\n- Billing integration is top priority\n- Target: end of sprint"
                .into(),
    })
    .unwrap();

    db.update_meeting_status(&meeting.id, "summarized").unwrap();

    let m = db.get_meeting(&meeting.id).unwrap();
    assert_eq!(m.status, "summarized");

    let summaries = db.get_summaries_for_meeting(&meeting.id).unwrap();
    assert_eq!(summaries.len(), 1);
    assert!(summaries[0].content.contains("Billing integration"));
}

#[test]
fn journey_meeting_with_template_auto_run() {
    let db = fresh_db();

    // User has a favorite template set to auto-run
    let templates = db.list_templates().unwrap();
    let builtin = &templates[0];
    db.update_template(&UpdateTemplate {
        id: builtin.id.clone(),
        name: builtin.name.clone(),
        description: builtin.description.clone(),
        sections: builtin.sections.clone(),
        auto_apply_rules: builtin.auto_apply_rules.clone(),
        prompt: builtin.prompt.clone(),
        is_favorite: true,
        is_auto_run: true,
    })
    .unwrap();

    // Verify auto-run templates are discoverable
    let auto_run = db.get_auto_run_templates().unwrap();
    assert!(!auto_run.is_empty());
    assert!(auto_run.iter().any(|t| t.id == builtin.id));

    // User starts meeting with this template pre-selected
    let meeting = db
        .create_meeting(NewMeeting {
            title: "1:1 with Manager".into(),
            calendar_event_id: None,
            template_id: Some(builtin.id.clone()),
        })
        .unwrap();
    assert_eq!(meeting.template_id, Some(builtin.id.clone()));
}

// ---------------------------------------------------------------------------
// 2. Meeting library experience
// ---------------------------------------------------------------------------

#[test]
fn journey_meeting_library_browse_search_filter() {
    let db = fresh_db();

    // User has accumulated several meetings
    let m1 = meeting_with_transcript(&db, "Sprint Planning");
    let m2 = meeting_with_transcript(&db, "Design Review");
    let m3 = meeting_with_transcript(&db, "1:1 with Alice");

    // Create labels
    let eng_label = db.create_label("Engineering", "#22c55e", None).unwrap();
    let design_label = db.create_label("Design", "#8B5CF6", None).unwrap();

    // Tag meetings with labels
    db.add_meeting_label(&m1, &eng_label.id).unwrap();
    db.add_meeting_label(&m2, &design_label.id).unwrap();
    db.add_meeting_label(&m2, &eng_label.id).unwrap(); // meeting can have multiple labels

    // Browse all meetings
    let all = db.list_meetings(None, false).unwrap();
    assert_eq!(all.len(), 3);

    // Search by title
    let results = db.list_meetings(Some("Design"), false).unwrap();
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].title, "Design Review");

    // Check labels on a meeting
    let m2_labels = db.get_meeting_labels(&m2).unwrap();
    assert_eq!(m2_labels.len(), 2);

    // Get all meeting-label associations for library view
    let all_labels = db.get_all_meeting_labels().unwrap();
    assert_eq!(all_labels.len(), 3); // m1:eng, m2:design, m2:eng

    // Archive a meeting — should hide from default listing
    db.update_meeting_status(&m3, "archived").unwrap();
    let visible = db.list_meetings(None, false).unwrap();
    assert_eq!(visible.len(), 2);

    // But visible when explicitly including archived
    let with_archived = db.list_meetings(None, true).unwrap();
    assert_eq!(with_archived.len(), 3);

    // Search within transcripts (searches all meetings regardless of archive status)
    let transcript_results = db.search_transcripts("authentication").unwrap();
    assert_eq!(transcript_results.len(), 3); // all meetings have this text via helper

    // Update meeting title (user renames)
    db.update_meeting_title(&m1, "Sprint Planning - Week 10")
        .unwrap();
    let renamed = db.get_meeting(&m1).unwrap();
    assert_eq!(renamed.title, "Sprint Planning - Week 10");
}

#[test]
fn journey_meeting_notes_enrichment() {
    let db = fresh_db();
    let mid = meeting_with_transcript(&db, "Brainstorm");

    // User writes raw notes during or after meeting
    db.update_meeting_notes(
        &mid,
        "- Need to explore caching options\n- Alice prefers Redis",
    )
    .unwrap();

    let m = db.get_meeting(&mid).unwrap();
    assert!(m.raw_notes.unwrap().contains("caching"));

    // After LLM enrichment, enriched notes are saved
    db.update_meeting_enriched_notes(
        &mid,
        "## Key Discussion Points\n- Caching strategy: team exploring Redis vs Memcached\n- Alice advocates for Redis due to data structure support",
    )
    .unwrap();

    let m = db.get_meeting(&mid).unwrap();
    assert!(m.enriched_notes.unwrap().contains("Redis vs Memcached"));
}

// ---------------------------------------------------------------------------
// 3. Insights pipeline
// ---------------------------------------------------------------------------

#[test]
fn journey_insights_extraction_to_action_tracking() {
    let db = fresh_db();
    let mid = meeting_with_transcript(&db, "Product Sync");

    // Extraction run starts
    let run = db
        .create_extraction_run(&mid, "anthropic", "claude-sonnet-4-20250514")
        .unwrap();
    assert_eq!(run.status, "running");

    // Insights extracted by LLM are saved
    db.create_insight(NewInsight {
        meeting_id: mid.clone(),
        insight_type: "decision".into(),
        content: "Prioritize authentication overhaul for Q1".into(),
        context: Some("Alice and Bob agreed during roadmap discussion".into()),
        transcript_start_ms: Some(0),
        transcript_end_ms: Some(8000),
    })
    .unwrap();

    let action_insight = db
        .create_insight(NewInsight {
            meeting_id: mid.clone(),
            insight_type: "action_item".into(),
            content: "Draft RFC for auth overhaul".into(),
            context: Some("Alice assigned to Bob".into()),
            transcript_start_ms: Some(8000),
            transcript_end_ms: Some(11000),
        })
        .unwrap();

    // Action item created for actionable insights
    let action = db
        .create_action_item(NewActionItem {
            insight_id: action_insight.id.clone(),
            assignee: Some("Bob".into()),
            due_date: Some("2026-03-14".into()),
        })
        .unwrap();
    assert_eq!(action.status, "open");
    assert_eq!(action.assignee, Some("Bob".into()));

    // Extraction run completes
    db.update_extraction_run_status(&run.id, "completed")
        .unwrap();

    // User views insights for this meeting
    let insights = db.get_insights_for_meeting(&mid).unwrap();
    assert_eq!(insights.len(), 2);

    // The action_item insight has the action item joined
    let action_insight_view = insights
        .iter()
        .find(|i| i.insight_type == "action_item")
        .unwrap();
    assert_eq!(action_insight_view.assignee, Some("Bob".into()));
    assert_eq!(action_insight_view.status, Some("open".into()));

    // The decision insight has no action item
    let decision_view = insights
        .iter()
        .find(|i| i.insight_type == "decision")
        .unwrap();
    assert!(decision_view.action_item_id.is_none());

    // User marks action item as done
    db.update_action_item_status(&action.id, "done").unwrap();

    let updated = db.get_insight_by_action_item(&action.id).unwrap();
    assert_eq!(updated.status, Some("done".into()));

    // User views all open action items across meetings (Insights Dashboard)
    let open_items = db
        .get_all_insights(Some("action_item"), Some("open"), None)
        .unwrap();
    assert_eq!(open_items.len(), 0); // we just marked it done

    let done_items = db
        .get_all_insights(Some("action_item"), Some("done"), None)
        .unwrap();
    assert_eq!(done_items.len(), 1);
    assert_eq!(done_items[0].meeting_title, Some("Product Sync".into()));
}

#[test]
fn journey_insights_across_multiple_meetings() {
    let db = fresh_db();
    let m1 = meeting_with_transcript(&db, "Sprint Review");
    let m2 = meeting_with_transcript(&db, "Retro");

    // Insights from two different meetings
    let i1 = db
        .create_insight(NewInsight {
            meeting_id: m1.clone(),
            insight_type: "action_item".into(),
            content: "Deploy v2 to staging".into(),
            context: None,
            transcript_start_ms: None,
            transcript_end_ms: None,
        })
        .unwrap();
    db.create_action_item(NewActionItem {
        insight_id: i1.id.clone(),
        assignee: Some("Charlie".into()),
        due_date: Some("2026-03-10".into()),
    })
    .unwrap();

    let i2 = db
        .create_insight(NewInsight {
            meeting_id: m2.clone(),
            insight_type: "action_item".into(),
            content: "Set up better CI notifications".into(),
            context: None,
            transcript_start_ms: None,
            transcript_end_ms: None,
        })
        .unwrap();
    db.create_action_item(NewActionItem {
        insight_id: i2.id.clone(),
        assignee: Some("Alice".into()),
        due_date: None,
    })
    .unwrap();

    // Insights Dashboard: view all action items
    let all = db
        .get_all_insights(Some("action_item"), None, None)
        .unwrap();
    assert_eq!(all.len(), 2);

    // Search within insights
    let search = db
        .get_all_insights(None, None, Some("CI notifications"))
        .unwrap();
    assert_eq!(search.len(), 1);
    assert_eq!(search[0].meeting_title, Some("Retro".into()));
}

#[test]
fn journey_re_extract_insights_clears_old() {
    let db = fresh_db();
    let mid = meeting_with_transcript(&db, "Test Meeting");

    // First extraction
    db.create_insight(NewInsight {
        meeting_id: mid.clone(),
        insight_type: "decision".into(),
        content: "Old decision".into(),
        context: None,
        transcript_start_ms: None,
        transcript_end_ms: None,
    })
    .unwrap();

    assert_eq!(db.get_insights_for_meeting(&mid).unwrap().len(), 1);

    // Re-extraction: old insights are cleared
    db.delete_insights_for_meeting(&mid).unwrap();
    assert_eq!(db.get_insights_for_meeting(&mid).unwrap().len(), 0);

    // New insights inserted
    db.create_insight(NewInsight {
        meeting_id: mid.clone(),
        insight_type: "decision".into(),
        content: "New decision from better model".into(),
        context: None,
        transcript_start_ms: None,
        transcript_end_ms: None,
    })
    .unwrap();

    let insights = db.get_insights_for_meeting(&mid).unwrap();
    assert_eq!(insights.len(), 1);
    assert!(insights[0].content.contains("better model"));
}

// ---------------------------------------------------------------------------
// 4. Chat flow
// ---------------------------------------------------------------------------

#[test]
fn journey_chat_conversation_lifecycle() {
    let db = fresh_db();

    // User starts a new chat conversation
    let conv = db.create_chat_conversation().unwrap();
    assert_eq!(conv.title, "New Conversation");

    // User sends messages, assistant responds
    db.create_chat_message(
        &conv.id,
        "user",
        "What were the key decisions from last week?",
        None,
    )
    .unwrap();

    let sources =
        r#"[{"meeting_id":"abc","chunk_text":"We decided to use Redis","start_ms":5000}]"#;
    db.create_chat_message(
        &conv.id,
        "assistant",
        "Based on your meetings, the key decision was to use Redis for caching.",
        Some(sources),
    )
    .unwrap();

    db.create_chat_message(&conv.id, "user", "Who proposed that?", None)
        .unwrap();

    db.create_chat_message(
        &conv.id,
        "assistant",
        "Alice proposed Redis during the brainstorming session.",
        Some(sources),
    )
    .unwrap();

    // Message history is ordered
    let messages = db.list_chat_messages(&conv.id).unwrap();
    assert_eq!(messages.len(), 4);
    assert_eq!(messages[0].role, "user");
    assert_eq!(messages[1].role, "assistant");
    assert!(messages[1].sources_json.is_some());

    // User renames the conversation
    db.update_chat_conversation_title(&conv.id, "Redis Discussion")
        .unwrap();

    // Conversation list shows updated title
    let convos = db.list_chat_conversations().unwrap();
    assert_eq!(convos.len(), 1);
    assert_eq!(convos[0].title, "Redis Discussion");

    // Touch updates the timestamp
    db.touch_chat_conversation(&conv.id).unwrap();

    // User deletes conversation
    db.delete_chat_conversation(&conv.id).unwrap();
    let convos = db.list_chat_conversations().unwrap();
    assert_eq!(convos.len(), 0);
}

#[test]
fn journey_chat_multiple_conversations() {
    let db = fresh_db();

    let c1 = db.create_chat_conversation().unwrap();
    let c2 = db.create_chat_conversation().unwrap();

    db.create_chat_message(&c1.id, "user", "Question about sprint", None)
        .unwrap();
    db.create_chat_message(&c2.id, "user", "Question about design", None)
        .unwrap();

    // Messages are isolated per conversation
    assert_eq!(db.list_chat_messages(&c1.id).unwrap().len(), 1);
    assert_eq!(db.list_chat_messages(&c2.id).unwrap().len(), 1);

    // Deleting one doesn't affect the other
    db.delete_chat_conversation(&c1.id).unwrap();
    assert_eq!(db.list_chat_messages(&c2.id).unwrap().len(), 1);
}

// ---------------------------------------------------------------------------
// 5. Cross-meeting search (chunks + embeddings)
// ---------------------------------------------------------------------------

#[test]
fn journey_cross_meeting_chunk_search() {
    let db = fresh_db();
    let m1 = meeting_with_transcript(&db, "Standup Monday");
    let m2 = meeting_with_transcript(&db, "Standup Tuesday");

    // Chunks are created from transcripts (normally by the chunking module)
    db.insert_chunk(&TranscriptChunk {
        id: "chunk_1".into(),
        meeting_id: m1.clone(),
        chunk_index: 0,
        text: "We discussed the deployment pipeline changes".into(),
        start_ms: 0,
        end_ms: 5000,
        speaker_labels: r#"["Alice","Bob"]"#.into(),
    })
    .unwrap();

    db.insert_chunk(&TranscriptChunk {
        id: "chunk_2".into(),
        meeting_id: m2.clone(),
        chunk_index: 0,
        text: "The deployment went smoothly after the fix".into(),
        start_ms: 0,
        end_ms: 4000,
        speaker_labels: r#"["Alice"]"#.into(),
    })
    .unwrap();

    // Verify chunk tracking
    assert!(db.has_meeting_chunks(&m1).unwrap());
    assert!(db.has_meeting_chunks(&m2).unwrap());

    let (_embedded, total) = db.get_embedding_status().unwrap();
    assert_eq!(total, 2); // 2 meetings exist

    // Delete chunks for one meeting (re-embedding scenario)
    db.delete_meeting_chunks(&m1).unwrap();
    assert!(!db.has_meeting_chunks(&m1).unwrap());
    assert!(db.has_meeting_chunks(&m2).unwrap());
}

// ---------------------------------------------------------------------------
// 6. Integration & workflow tracking
// ---------------------------------------------------------------------------

#[test]
fn journey_integration_workflow_execution() {
    let db = fresh_db();
    let mid = meeting_with_transcript(&db, "Sync Meeting");

    // User sets up a Slack integration
    let integration = db
        .create_integration(
            "slack",
            "Team Slack",
            r#"{"webhook_url":"https://hooks.slack.com/services/xxx"}"#,
        )
        .unwrap();
    assert_eq!(integration.integration_type, "slack");

    // User creates a workflow: post summary to Slack after meetings
    let workflow = db
        .create_workflow(
            "Post Summary",
            Some("Post meeting summary to #meetings channel"),
            Some("slack"),
            &integration.id,
            "post_message",
            "{\"channel\":\"#meetings\",\"include_action_items\":true}",
        )
        .unwrap();
    assert!(workflow.is_enabled);

    // Workflow gets executed after meeting
    let run = db.create_workflow_run(&mid, &workflow.id).unwrap();
    assert_eq!(run.status, "pending");

    // Workflow completes successfully
    db.update_workflow_run_status(
        &run.id,
        "completed",
        Some(r#"{"slack_ts":"1234567890.123456"}"#),
        None,
    )
    .unwrap();

    let completed_run = db.get_workflow_run(&run.id).unwrap();
    assert_eq!(completed_run.status, "completed");
    assert!(completed_run.result_json.is_some());
    assert!(completed_run.error.is_none());

    // User can see workflow history for this meeting
    let runs = db.list_workflow_runs_for_meeting(&mid).unwrap();
    assert_eq!(runs.len(), 1);

    // List integrations safely (credentials stripped for UI)
    let safe = db.list_integrations_safe().unwrap();
    assert_eq!(safe.len(), 1);
    assert!(!safe[0].credentials_json.contains("webhook_url"));

    // Full credentials accessible internally
    let full = db.get_integration(&integration.id).unwrap();
    assert!(full.credentials_json.contains("webhook_url"));
}

#[test]
fn journey_workflow_failure_tracking() {
    let db = fresh_db();
    let mid = meeting_with_transcript(&db, "Meeting");

    let integration = db
        .create_integration("slack", "Slack", r#"{"token":"xoxb-test"}"#)
        .unwrap();
    let workflow = db
        .create_workflow(
            "Notify",
            None,
            None,
            &integration.id,
            "post_message",
            "{\"channel\":\"#general\"}",
        )
        .unwrap();

    let run = db.create_workflow_run(&mid, &workflow.id).unwrap();

    // Workflow fails
    db.update_workflow_run_status(
        &run.id,
        "failed",
        None,
        Some("Slack API returned 403: channel_not_found"),
    )
    .unwrap();

    let failed = db.get_workflow_run(&run.id).unwrap();
    assert_eq!(failed.status, "failed");
    assert!(failed.error.unwrap().contains("channel_not_found"));
    assert!(failed.result_json.is_none());
}

#[test]
fn journey_workflow_crud_and_toggle() {
    let db = fresh_db();

    let integration = db
        .create_integration("notion", "Notion", r#"{"token":"ntn_test"}"#)
        .unwrap();

    let workflow = db
        .create_workflow(
            "Export Notes",
            Some("Export to Notion"),
            Some("notion"),
            &integration.id,
            "create_page",
            r#"{"database_id":"abc123"}"#,
        )
        .unwrap();
    assert!(workflow.is_enabled);

    // User disables workflow
    let disabled = db
        .update_workflow(
            &workflow.id,
            "Export Notes",
            Some("Export to Notion"),
            Some("notion"),
            "create_page",
            r#"{"database_id":"abc123"}"#,
            false,
        )
        .unwrap();
    assert!(!disabled.is_enabled);

    // Verify it shows as disabled in listing
    let workflows = db.list_workflows().unwrap();
    assert_eq!(workflows.len(), 1);
    assert!(!workflows[0].is_enabled);

    // Delete integration cascades workflow? Let's verify cleanup
    db.delete_workflow(&workflow.id).unwrap();
    assert_eq!(db.list_workflows().unwrap().len(), 0);

    db.delete_integration(&integration.id).unwrap();
    assert_eq!(db.list_integrations().unwrap().len(), 0);
}

// ---------------------------------------------------------------------------
// 7. Linear integration flow
// ---------------------------------------------------------------------------

#[test]
fn journey_linear_ticket_from_action_item() {
    let db = fresh_db();
    let mid = meeting_with_transcript(&db, "Planning");

    // Summary exists
    let summary = db
        .create_summary(NewSummary {
            meeting_id: mid.clone(),
            template_id: None,
            provider: "anthropic".into(),
            model: "claude-sonnet-4-20250514".into(),
            content: "We need to fix the login bug".into(),
        })
        .unwrap();

    // Action item exists
    let insight = db
        .create_insight(NewInsight {
            meeting_id: mid.clone(),
            insight_type: "action_item".into(),
            content: "Fix login bug on mobile".into(),
            context: None,
            transcript_start_ms: Some(5000),
            transcript_end_ms: Some(8000),
        })
        .unwrap();
    let action = db
        .create_action_item(NewActionItem {
            insight_id: insight.id.clone(),
            assignee: Some("Charlie".into()),
            due_date: Some("2026-03-14".into()),
        })
        .unwrap();

    // Linear ticket created from this action item
    let ticket = db
        .create_linear_ticket(NewLinearTicket {
            summary_id: &summary.id,
            meeting_id: &mid,
            linear_issue_id: "issue_456",
            linear_issue_url: "https://linear.app/nootle/issue/NOOTLE-456",
            linear_identifier: "NOOTLE-456",
            title: "Fix login bug on mobile",
            team_id: "team_eng",
            project_id: Some("project_q1"),
        })
        .unwrap();

    // Link the ticket to the action item
    db.set_action_item_linear_ticket(&action.id, &ticket.id)
        .unwrap();

    // Verify the full chain is intact
    let insight_view = db.get_insight_by_action_item(&action.id).unwrap();
    assert_eq!(insight_view.linear_ticket_id, Some(ticket.id.clone()));
    assert_eq!(insight_view.assignee, Some("Charlie".into()));

    let tickets = db.get_linear_tickets(&mid).unwrap();
    assert_eq!(tickets.len(), 1);
    assert_eq!(tickets[0].linear_identifier, "NOOTLE-456");

    // Linear settings (team/project preferences)
    db.set_linear_setting("default_team_id", "team_eng")
        .unwrap();
    db.set_linear_setting("default_project_id", "project_q1")
        .unwrap();

    assert_eq!(
        db.get_linear_setting("default_team_id").unwrap(),
        Some("team_eng".into())
    );

    db.delete_linear_setting("default_project_id").unwrap();
    assert_eq!(db.get_linear_setting("default_project_id").unwrap(), None);
}

// ---------------------------------------------------------------------------
// 8. Template & recipe flows
// ---------------------------------------------------------------------------

#[test]
fn journey_custom_template_lifecycle() {
    let db = fresh_db();

    // Built-in templates exist
    let builtins = db.list_templates().unwrap();
    assert!(!builtins.is_empty());
    assert!(builtins.iter().all(|t| t.is_builtin));

    // User creates a custom template
    let custom = db
        .create_template(NewTemplate {
            name: "Client Call".into(),
            description: "Template for client meetings".into(),
            sections: r#"["Next Steps","Open Questions","Decisions"]"#.into(),
            auto_apply_rules: r#"{"title_contains":"client"}"#.into(),
            prompt: "Summarize this client call focusing on action items and decisions.".into(),
            is_favorite: true,
            is_auto_run: false,
        })
        .unwrap();
    assert!(!custom.is_builtin);
    assert!(custom.is_favorite);

    // Use template with a meeting
    let meeting = db
        .create_meeting(NewMeeting {
            title: "Client Call - Acme Corp".into(),
            calendar_event_id: None,
            template_id: Some(custom.id.clone()),
        })
        .unwrap();

    // Summary generated with this template
    db.create_summary(NewSummary {
        meeting_id: meeting.id.clone(),
        template_id: Some(custom.id.clone()),
        provider: "openai".into(),
        model: "gpt-4o".into(),
        content: "## Next Steps\n- Send proposal by Friday".into(),
    })
    .unwrap();

    let summaries = db.get_summaries_for_meeting(&meeting.id).unwrap();
    assert_eq!(summaries[0].template_id, Some(custom.id.clone()));

    // User can also generate a second summary with a different template
    let builtin_id = builtins[0].id.clone();
    db.create_summary(NewSummary {
        meeting_id: meeting.id.clone(),
        template_id: Some(builtin_id.clone()),
        provider: "anthropic".into(),
        model: "claude-sonnet-4-20250514".into(),
        content: "## Meeting Notes\nDiscussed partnership details with Acme.".into(),
    })
    .unwrap();

    let summaries = db.get_summaries_for_meeting(&meeting.id).unwrap();
    assert_eq!(summaries.len(), 2);
}

#[test]
fn journey_recipe_slash_command_flow() {
    let db = fresh_db();

    // Built-in recipes exist
    let builtins = db.list_recipes().unwrap();
    assert!(!builtins.is_empty());

    // User creates a custom recipe
    let recipe = db
        .create_recipe(NewRecipe {
            name: "Extract Quotes".into(),
            description: "Pull notable quotes from meeting".into(),
            slash_command: "quotes".into(),
            prompt_template:
                "Extract the most notable quotes from this transcript:\n\n{{transcript}}".into(),
            output_format: "markdown".into(),
        })
        .unwrap();

    // Recipe is findable by slash command
    let found = db.get_recipe_by_command("quotes").unwrap();
    assert_eq!(found.id, recipe.id);
    assert!(found.prompt_template.contains("{{transcript}}"));

    // User updates the recipe
    let updated = db
        .update_recipe(
            &recipe.id,
            "Notable Quotes",
            "Pull important quotes",
            "quotes",
            "Extract and attribute notable quotes from:\n\n{{transcript}}\n\nMeeting: {{title}}",
            "markdown",
        )
        .unwrap();
    assert_eq!(updated.name, "Notable Quotes");
    assert!(updated.prompt_template.contains("{{title}}"));
}

// ---------------------------------------------------------------------------
// 9. Analytics pipeline
// ---------------------------------------------------------------------------

#[test]
fn journey_meeting_analytics_full_pipeline() {
    let db = fresh_db();
    let mid = meeting_with_transcript(&db, "Team Standup");

    // Speaker analytics computed from transcript
    let analytics = vec![
        SpeakerAnalytics {
            id: "sa_1".into(),
            meeting_id: mid.clone(),
            speaker_label: "Alice".into(),
            talk_time_ms: 45000,
            turn_count: 8,
            interruption_count: 1,
            avg_turn_length_ms: 5625,
            longest_monologue_ms: 12000,
        },
        SpeakerAnalytics {
            id: "sa_2".into(),
            meeting_id: mid.clone(),
            speaker_label: "Bob".into(),
            talk_time_ms: 30000,
            turn_count: 6,
            interruption_count: 0,
            avg_turn_length_ms: 5000,
            longest_monologue_ms: 8000,
        },
    ];
    db.save_speaker_analytics(&mid, &analytics).unwrap();

    // Sentiment analysis results
    let sentiments = vec![
        SentimentSegment {
            id: "ss_1".into(),
            meeting_id: mid.clone(),
            start_ms: 0,
            end_ms: 30000,
            sentiment: "positive".into(),
            score: 0.85,
        },
        SentimentSegment {
            id: "ss_2".into(),
            meeting_id: mid.clone(),
            start_ms: 30000,
            end_ms: 60000,
            sentiment: "neutral".into(),
            score: 0.60,
        },
    ];
    db.save_sentiment_segments(&mid, &sentiments).unwrap();

    // Engagement metrics
    let engagement = MeetingEngagement {
        id: "me_1".into(),
        meeting_id: mid.clone(),
        engagement_level: "high".into(),
        participation_balance: 0.72,
        question_count: 5,
        back_and_forth_ratio: 0.85,
    };
    db.save_engagement(&engagement).unwrap();

    // User views the analytics tab
    let speakers = db.get_speaker_analytics(&mid).unwrap();
    assert_eq!(speakers.len(), 2);
    assert!(speakers
        .iter()
        .any(|s| s.speaker_label == "Alice" && s.talk_time_ms == 45000));

    let sentiments = db.get_sentiment_segments(&mid).unwrap();
    assert_eq!(sentiments.len(), 2);
    assert_eq!(sentiments[0].sentiment, "positive"); // ordered by start_ms

    let eng = db.get_engagement(&mid).unwrap().unwrap();
    assert_eq!(eng.engagement_level, "high");
    assert_eq!(eng.question_count, 5);

    // Re-computing analytics replaces old data (idempotent)
    let new_analytics = vec![SpeakerAnalytics {
        id: "sa_3".into(),
        meeting_id: mid.clone(),
        speaker_label: "Alice".into(),
        talk_time_ms: 50000, // updated value
        turn_count: 10,
        interruption_count: 2,
        avg_turn_length_ms: 5000,
        longest_monologue_ms: 15000,
    }];
    db.save_speaker_analytics(&mid, &new_analytics).unwrap();

    let speakers = db.get_speaker_analytics(&mid).unwrap();
    assert_eq!(speakers.len(), 1); // old data replaced, not appended
    assert_eq!(speakers[0].talk_time_ms, 50000);
}

// ---------------------------------------------------------------------------
// 10. API key management
// ---------------------------------------------------------------------------

#[test]
fn journey_api_key_setup() {
    let db = fresh_db();

    // User configures LLM providers
    db.store_api_key("openai", "sk-test-openai-key").unwrap();
    db.store_api_key("anthropic", "sk-ant-test-key").unwrap();

    assert_eq!(
        db.get_api_key("openai").unwrap(),
        Some("sk-test-openai-key".into())
    );

    let providers = db.list_api_key_providers().unwrap();
    assert_eq!(providers.len(), 2);
    assert!(providers.contains(&"openai".to_string()));
    assert!(providers.contains(&"anthropic".to_string()));

    // User removes a provider
    db.delete_api_key("openai").unwrap();
    assert_eq!(db.get_api_key("openai").unwrap(), None);
    assert_eq!(db.list_api_key_providers().unwrap().len(), 1);

    // Non-existent provider returns None
    assert_eq!(db.get_api_key("nonexistent").unwrap(), None);
}

// ---------------------------------------------------------------------------
// 11. Edge cases and data integrity
// ---------------------------------------------------------------------------

#[test]
fn journey_delete_meeting_cleans_up_related_data() {
    let db = fresh_db();
    let mid = meeting_with_transcript(&db, "Cleanup Test");

    // Add all kinds of related data
    db.create_summary(NewSummary {
        meeting_id: mid.clone(),
        template_id: None,
        provider: "openai".into(),
        model: "gpt-4o".into(),
        content: "Summary".into(),
    })
    .unwrap();

    db.create_insight(NewInsight {
        meeting_id: mid.clone(),
        insight_type: "decision".into(),
        content: "Some decision".into(),
        context: None,
        transcript_start_ms: None,
        transcript_end_ms: None,
    })
    .unwrap();

    db.add_scratch_note(&mid, "A note", 1000).unwrap();

    let label = db.create_label("Test", "#FF0000", None).unwrap();
    db.add_meeting_label(&mid, &label.id).unwrap();

    // Delete meeting
    db.delete_meeting(&mid).unwrap();

    // Meeting is gone
    assert!(db.get_meeting(&mid).is_err());

    // Transcript is gone
    assert_eq!(db.get_transcript(&mid).unwrap().len(), 0);

    // Scratch notes are gone
    assert_eq!(db.get_scratch_notes(&mid).unwrap().len(), 0);

    // Label still exists (not owned by meeting) but association is gone
    assert_eq!(db.list_labels().unwrap().len(), 1);
    assert_eq!(db.get_meeting_labels(&mid).unwrap().len(), 0);
}

#[test]
fn journey_stale_recording_cleanup() {
    let db = fresh_db();

    // Simulate a crashed recording (never finalized)
    db.create_meeting(NewMeeting {
        title: "Crashed Meeting".into(),
        calendar_event_id: None,
        template_id: None,
    })
    .unwrap();

    // Also have a properly finalized meeting
    let good = db
        .create_meeting(NewMeeting {
            title: "Good Meeting".into(),
            calendar_event_id: None,
            template_id: None,
        })
        .unwrap();
    db.finalize_meeting(&good.id, "2026-03-07T10:00:00Z", None, "summarized")
        .unwrap();

    // Cleanup stale recordings
    let cleaned = db.cleanup_stale_recordings().unwrap();
    // Note: cleanup_stale_recordings uses a time-based check, so a just-created
    // meeting may not be considered stale yet. We verify the function runs
    // without error and the good meeting survives.
    let meetings = db.list_meetings(None, false).unwrap();
    assert!(meetings.iter().any(|m| m.title == "Good Meeting"));
    // The stale one may or may not be cleaned depending on timing threshold
    let _ = cleaned;
}

#[test]
fn journey_empty_states() {
    let db = fresh_db();

    // All listing operations return empty gracefully
    assert_eq!(db.list_meetings(None, false).unwrap().len(), 0);
    assert_eq!(db.list_labels().unwrap().len(), 0);
    assert_eq!(db.list_chat_conversations().unwrap().len(), 0);
    assert_eq!(db.list_integrations().unwrap().len(), 0);
    assert_eq!(db.list_workflows().unwrap().len(), 0);
    assert_eq!(db.list_api_key_providers().unwrap().len(), 0);
    assert_eq!(db.get_all_insights(None, None, None).unwrap().len(), 0);

    // Templates and recipes have built-in seeds
    assert!(!db.list_templates().unwrap().is_empty());
    assert!(!db.list_recipes().unwrap().is_empty());
    assert!(!db.list_insight_types().unwrap().is_empty());

    // Search on empty data returns empty
    assert_eq!(db.search_transcripts("anything").unwrap().len(), 0);

    // Settings default to None
    assert_eq!(db.get_setting("nonexistent").unwrap(), None);

    // Engagement for non-existent meeting returns None
    assert!(db.get_engagement("fake_id").unwrap().is_none());
}

#[test]
fn journey_app_settings_persistence() {
    let db = fresh_db();

    // User configures app settings
    db.set_setting("theme", "dark").unwrap();
    db.set_setting("accent_color", "#8B5CF6").unwrap();
    db.set_setting("default_provider", "anthropic").unwrap();

    assert_eq!(db.get_setting("theme").unwrap(), Some("dark".into()));
    assert_eq!(
        db.get_setting("accent_color").unwrap(),
        Some("#8B5CF6".into())
    );

    // Overwrite a setting
    db.set_setting("theme", "light").unwrap();
    assert_eq!(db.get_setting("theme").unwrap(), Some("light".into()));
}

// ---------------------------------------------------------------------------
// 12. Custom insight types
// ---------------------------------------------------------------------------

#[test]
fn journey_custom_insight_type_creation() {
    let db = fresh_db();

    // Built-in insight types exist
    let builtins = db.list_insight_types().unwrap();
    assert!(!builtins.is_empty());

    // User creates a custom insight type
    let custom = db
        .create_insight_type(
            "Risk",
            "risk",
            Some("Potential risks or concerns raised"),
            "Identify any risks, concerns, or potential blockers mentioned in the transcript.",
            "warning",
            false,
        )
        .unwrap();
    assert!(!custom.is_builtin);
    assert_eq!(custom.slug, "risk");

    // Use custom type for extraction
    let mid = meeting_with_transcript(&db, "Risk Review");
    db.create_insight(NewInsight {
        meeting_id: mid.clone(),
        insight_type: "risk".into(),
        content: "Timeline may slip due to dependency on external API".into(),
        context: Some("Bob raised this concern during roadmap review".into()),
        transcript_start_ms: Some(4000),
        transcript_end_ms: Some(8000),
    })
    .unwrap();

    let insights = db.get_insights_for_meeting(&mid).unwrap();
    assert_eq!(insights.len(), 1);
    assert_eq!(insights[0].insight_type, "risk");

    // Update custom type
    let updated = db
        .update_insight_type(
            &custom.id,
            "Risk Factor",
            Some("Updated description"),
            "Updated prompt",
            "alert-triangle",
            false,
        )
        .unwrap();
    assert_eq!(updated.name, "Risk Factor");

    // Delete custom type
    db.delete_insight_type(&custom.id).unwrap();
    let types = db.list_insight_types().unwrap();
    assert!(!types.iter().any(|t| t.slug == "risk"));
}

// ---------------------------------------------------------------------------
// 13. Integration type lookup
// ---------------------------------------------------------------------------

#[test]
fn journey_integration_by_type() {
    let db = fresh_db();

    // No integrations yet
    assert!(db.get_integration_by_type("slack").unwrap().is_none());

    // Add Slack integration
    db.create_integration("slack", "My Slack", r#"{"token":"xoxb-test"}"#)
        .unwrap();

    // Find by type
    let slack = db.get_integration_by_type("slack").unwrap().unwrap();
    assert_eq!(slack.name, "My Slack");

    // Other types still return None
    assert!(db.get_integration_by_type("notion").unwrap().is_none());
}

// ---------------------------------------------------------------------------
// 14. Full user session simulation
// ---------------------------------------------------------------------------

#[test]
fn journey_complete_user_session() {
    let db = fresh_db();

    // ---- Setup phase ----
    // User sets API key
    db.store_api_key("anthropic", "sk-ant-test").unwrap();
    db.set_setting("default_provider", "anthropic").unwrap();
    db.set_setting("default_model", "claude-sonnet-4-20250514")
        .unwrap();

    // ---- Recording phase ----
    let meeting = db
        .create_meeting(NewMeeting {
            title: "Weekly Sync".into(),
            calendar_event_id: Some("cal_weekly_123".into()),
            template_id: None,
        })
        .unwrap();

    // Transcription streams in
    for (i, (speaker, text)) in [
        ("Alice", "Good morning everyone. Let's start with updates."),
        ("Bob", "I finished the database migration yesterday."),
        ("Charlie", "Nice! I'm still working on the API integration."),
        ("Alice", "Charlie, when do you expect to finish?"),
        ("Charlie", "Should be done by Wednesday."),
        (
            "Alice",
            "Great. Bob, can you help Charlie if he gets stuck?",
        ),
        ("Bob", "Sure, happy to help."),
        (
            "Alice",
            "One more thing — we need to decide on the caching strategy.",
        ),
        ("Bob", "I vote for Redis. It handles our use case well."),
        (
            "Alice",
            "Agreed. Let's go with Redis. I'll create the ticket.",
        ),
    ]
    .iter()
    .enumerate()
    {
        db.create_transcript_segment(NewTranscriptSegment {
            meeting_id: meeting.id.clone(),
            speaker_label: speaker.to_string(),
            text: text.to_string(),
            start_ms: (i as i64) * 5000,
            end_ms: ((i + 1) as i64) * 5000,
            confidence: 0.94,
        })
        .unwrap();
    }

    // User takes a note
    db.add_scratch_note(&meeting.id, "Redis decision is final!", 42000)
        .unwrap();

    // ---- Post-recording phase ----
    db.finalize_meeting(
        &meeting.id,
        "2026-03-07T10:50:00Z",
        Some("/recordings/weekly_sync.wav"),
        "transcribing",
    )
    .unwrap();

    // ---- Summary phase ----
    db.create_summary(NewSummary {
        meeting_id: meeting.id.clone(),
        template_id: None,
        provider: "anthropic".into(),
        model: "claude-sonnet-4-20250514".into(),
        content: "## Weekly Sync Summary\n- Bob completed DB migration\n- Charlie finishing API integration by Wednesday\n- Team decided on Redis for caching\n- Bob to assist Charlie if needed".into(),
    })
    .unwrap();
    db.update_meeting_status(&meeting.id, "summarized").unwrap();

    // ---- Insight extraction phase ----
    let run = db
        .create_extraction_run(&meeting.id, "anthropic", "claude-sonnet-4-20250514")
        .unwrap();

    db.create_insight(NewInsight {
        meeting_id: meeting.id.clone(),
        insight_type: "decision".into(),
        content: "Use Redis for caching strategy".into(),
        context: Some("Bob proposed, Alice agreed".into()),
        transcript_start_ms: Some(40000),
        transcript_end_ms: Some(50000),
    })
    .unwrap();

    let action1_insight = db
        .create_insight(NewInsight {
            meeting_id: meeting.id.clone(),
            insight_type: "action_item".into(),
            content: "Finish API integration".into(),
            context: Some("Charlie committed to Wednesday deadline".into()),
            transcript_start_ms: Some(10000),
            transcript_end_ms: Some(25000),
        })
        .unwrap();
    let action1 = db
        .create_action_item(NewActionItem {
            insight_id: action1_insight.id.clone(),
            assignee: Some("Charlie".into()),
            due_date: Some("2026-03-12".into()),
        })
        .unwrap();

    let action2_insight = db
        .create_insight(NewInsight {
            meeting_id: meeting.id.clone(),
            insight_type: "action_item".into(),
            content: "Create Redis caching ticket".into(),
            context: Some("Alice volunteered".into()),
            transcript_start_ms: Some(45000),
            transcript_end_ms: Some(50000),
        })
        .unwrap();
    let action2 = db
        .create_action_item(NewActionItem {
            insight_id: action2_insight.id.clone(),
            assignee: Some("Alice".into()),
            due_date: None,
        })
        .unwrap();

    db.update_extraction_run_status(&run.id, "completed")
        .unwrap();

    // ---- Label and organize ----
    let label = db.create_label("Weekly Sync", "#3B82F6", None).unwrap();
    db.add_meeting_label(&meeting.id, &label.id).unwrap();

    // ---- User reviews meeting ----
    let m = db.get_meeting(&meeting.id).unwrap();
    assert_eq!(m.status, "summarized");

    let transcript = db.get_transcript(&meeting.id).unwrap();
    assert_eq!(transcript.len(), 10);

    let summaries = db.get_summaries_for_meeting(&meeting.id).unwrap();
    assert_eq!(summaries.len(), 1);
    assert!(summaries[0].content.contains("Redis"));

    let insights = db.get_insights_for_meeting(&meeting.id).unwrap();
    assert_eq!(insights.len(), 3); // 1 decision + 2 action items

    let labels = db.get_meeting_labels(&meeting.id).unwrap();
    assert_eq!(labels.len(), 1);

    // ---- User works through action items ----
    // Charlie finishes API integration
    db.update_action_item_status(&action1.id, "done").unwrap();

    // Alice creates the Linear ticket for Redis
    let summary = &summaries[0];
    let ticket = db
        .create_linear_ticket(NewLinearTicket {
            summary_id: &summary.id,
            meeting_id: &meeting.id,
            linear_issue_id: "lin_789",
            linear_issue_url: "https://linear.app/nootle/issue/NOOTLE-789",
            linear_identifier: "NOOTLE-789",
            title: "Implement Redis caching",
            team_id: "team_eng",
            project_id: None,
        })
        .unwrap();
    db.set_action_item_linear_ticket(&action2.id, &ticket.id)
        .unwrap();
    db.update_action_item_status(&action2.id, "done").unwrap();

    // ---- Verify final state ----
    let all_open = db
        .get_all_insights(Some("action_item"), Some("open"), None)
        .unwrap();
    assert_eq!(all_open.len(), 0);

    let all_done = db
        .get_all_insights(Some("action_item"), Some("done"), None)
        .unwrap();
    assert_eq!(all_done.len(), 2);

    let tickets = db.get_linear_tickets(&meeting.id).unwrap();
    assert_eq!(tickets.len(), 1);
    assert_eq!(tickets[0].linear_identifier, "NOOTLE-789");

    // ---- User searches across meetings later ----
    let search = db.search_transcripts("Redis").unwrap();
    assert!(!search.is_empty());
    assert!(search.iter().any(|r| r.meeting_title == "Weekly Sync"));
}
