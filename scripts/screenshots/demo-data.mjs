/**
 * Demo data for the marketing screenshots.
 *
 * Every value here is fed to the mocked Tauri IPC layer (see mock-tauri.js), so
 * the screenshots render the real app components against a realistic — but
 * entirely fictional — meeting library. Keep the dates fixed so re-running the
 * capture produces byte-comparable images.
 */

import { readFileSync } from "node:fs";

const day = (d, h, m = 0) =>
  `2026-07-${String(d).padStart(2, "0")}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`;

const meeting = (id, title, start, end, status = "summarized") => ({
  id,
  title,
  start_time: start,
  end_time: end,
  audio_path: `/demo/${id}.wav`,
  status,
  calendar_event_id: null,
  raw_notes: null,
  enriched_notes: null,
  template_id: "tpl-standard",
  created_at: start,
  updated_at: end ?? start,
});

const MEETINGS = [
  meeting("m1", "Design Review — Onboarding Flow", day(28, 17, 0), day(28, 17, 38)),
  meeting("m2", "Sprint Planning", day(27, 16, 30), day(27, 17, 17)),
  meeting("m3", "1:1 — Alex Chen", day(27, 20, 0), day(27, 20, 28)),
  meeting("m4", "Customer Discovery — Northwind", day(24, 18, 0), day(24, 19, 2)),
  meeting("m5", "Q3 Roadmap Sync", day(23, 15, 0), day(23, 16, 12)),
  meeting("m6", "Bug Triage", day(22, 22, 0), day(22, 22, 26)),
  meeting("m7", "Interview — Staff Engineer", day(21, 19, 0), day(21, 19, 54)),
  meeting("m8", "Support Sync", day(21, 16, 0), day(21, 16, 24)),
  meeting("m9", "Pricing Workshop", day(20, 17, 30), day(20, 18, 45)),
];

const LABELS = [
  { id: "l1", name: "Product", color: "#8b5cf6", icon: null, created_at: day(1, 9) },
  { id: "l2", name: "Engineering", color: "#22d3ee", icon: null, created_at: day(1, 9) },
  { id: "l3", name: "Customer", color: "#f472b6", icon: null, created_at: day(1, 9) },
  { id: "l4", name: "1:1", color: "#fbbf24", icon: null, created_at: day(1, 9) },
];

const MEETING_LABELS = [
  { meeting_id: "m1", label: LABELS[0] },
  { meeting_id: "m2", label: LABELS[1] },
  { meeting_id: "m3", label: LABELS[3] },
  { meeting_id: "m4", label: LABELS[2] },
  { meeting_id: "m4", label: LABELS[0] },
  { meeting_id: "m5", label: LABELS[0] },
  { meeting_id: "m6", label: LABELS[1] },
  { meeting_id: "m7", label: LABELS[1] },
  { meeting_id: "m8", label: LABELS[2] },
  { meeting_id: "m9", label: LABELS[0] },
];

const line = (id, speaker, text, startMs, endMs) => ({
  id,
  meeting_id: "m1",
  speaker_label: speaker,
  text,
  start_ms: startMs,
  end_ms: endMs,
  confidence: 0.96,
});

const TRANSCRIPT = [
  line("t1", "Speaker 1", "Alright, let's look at where the onboarding rebuild landed. I pulled the funnel numbers this morning.", 12_000, 19_000),
  line("t2", "Speaker 2", "How bad is step three? Last time we looked it was the worst drop in the whole flow.", 21_000, 27_000),
  line("t3", "Speaker 1", "Thirty-one percent drop off on the permissions screen. That's the single biggest leak we have.", 29_000, 36_000),
  line("t4", "Speaker 3", "That tracks with what support is hearing. People don't understand why we ask for screen recording access.", 38_000, 46_000),
  line("t5", "Speaker 2", "So we explain it in place instead of linking out to the docs. One sentence, right above the button.", 48_000, 56_000),
  line("t6", "Speaker 1", "Agreed. Let's ship the inline explainer this sprint and re-measure after a week of data.", 58_000, 66_000),
  line("t7", "Speaker 3", "I can have copy ready by Thursday. I'd like to test two variants if we have the traffic for it.", 68_000, 76_000),
  line("t8", "Speaker 2", "We do. I'll wire up the variant split behind the existing flag so we can turn it off cleanly.", 78_000, 86_000),
  line("t9", "Speaker 1", "Good. The other thing I want to settle today is whether the calendar permission stays in onboarding at all.", 88_000, 97_000),
  line("t10", "Speaker 3", "My vote is we move it. Nobody needs calendar detection in the first sixty seconds.", 99_000, 106_000),
  line("t11", "Speaker 2", "Same. Defer it to the first time someone opens the meetings list with nothing in it.", 108_000, 116_000),
  line("t12", "Speaker 1", "Then that's decided — calendar access moves out of onboarding and becomes contextual.", 118_000, 126_000),
];

/** Ask the Room: the spoken recap of m1, with when each line is spoken. */
const recapLine = (speaker, voice, text, startMs, endMs) => ({
  speaker,
  voice,
  text,
  start_ms: startMs,
  end_ms: endMs,
});

const AUDIO_RECAP = {
  meeting_id: "m1",
  audio_path: "/demo/m1.recap.wav",
  provider: "anthropic",
  model: "claude-opus-4-6",
  created_at: "2026-07-28T18:05:00Z",
  lines: [
    recapLine("Narrator", "Samantha", "Here's your recap of the onboarding design review. Three of you looked at where the rebuilt flow is losing people, and settled two changes.", 0, 9_400),
    recapLine("Speaker 1", "Daniel", "I pulled this morning's funnel. Thirty-one percent of people drop off on the permissions screen, the biggest leak we have.", 9_800, 17_900),
    recapLine("Speaker 3", "Karen", "Support hears the same thing: people don't understand why we ask for screen recording access.", 18_300, 24_600),
    recapLine("Speaker 2", "Moira", "So I suggested we explain it in place, one sentence right above the button, instead of linking out to the docs.", 25_000, 32_800),
    recapLine("Speaker 1", "Daniel", "We agreed to ship that inline explainer this sprint, and I'll re-measure after a week of data.", 33_200, 39_700),
    recapLine("Narrator", "Samantha", "The second decision was about the calendar permission.", 40_100, 43_200),
    recapLine("Speaker 3", "Karen", "Nobody needs calendar detection in the first sixty seconds, so it moves out of onboarding.", 43_600, 49_500),
    recapLine("Speaker 2", "Moira", "It'll come up the first time someone opens an empty meetings list instead.", 49_900, 54_800),
    recapLine("Narrator", "Samantha", "To wrap up: Speaker 3 drafts two copy variants by Thursday, Speaker 2 wires the split behind the existing flag, and Speaker 1 re-measures step three next week.", 55_200, 66_400),
  ],
};

const ROOM_ANSWER = {
  audio_path: "/demo/m1.answer.wav",
  line: recapLine(
    "Speaker 3",
    "Karen",
    "I said I'd have the copy ready by Thursday, and I'd like to test two variants if we have the traffic for it.",
    0,
    7_200,
  ),
};

const annotation = (id, kind, startMs, endMs, author, body, resolvedAt = null) => ({
  id,
  meeting_id: "m1",
  start_ms: startMs,
  end_ms: endMs,
  kind,
  body,
  author,
  created_at: day(28, 18, 5),
  resolved_at: resolvedAt,
});

/**
 * What an agent reviewing the meeting over MCP might pin to it. Not in
 * FIXTURES, so the marketing screenshots stay as they are; captures that
 * show agent notes add them to `list_meeting_annotations`.
 */
export const M1_ANNOTATIONS = [
  annotation("an1", "flag", 29_000, null, "claude-code", "31% contradicts the Q2 funnel dashboard, which shows **24%** for this step. Check which date range each uses."),
  annotation("an2", "highlight", 58_000, 86_000, "claude-code", "Decision and owners for the explainer test. Matches **ADR-14** (ship experiments behind a flag)."),
  annotation("an3", "comment", 99_000, null, "cli", "Link the support tickets Speaker 3 mentions.", day(28, 18, 20)),
  annotation("an4", "comment", 118_000, null, "cursor", "This reverses **ADR-9**, which put calendar access in onboarding. Mark ADR-9 superseded?"),
];

const SUMMARY_CONTENT = `## Overview

The team reviewed funnel data for the rebuilt onboarding flow and agreed on two changes: an inline explanation for the screen-recording permission, and deferring the calendar permission out of onboarding entirely.

## Decisions

- **Inline permissions explainer ships this sprint.** The permissions screen loses 31% of users — the largest single drop in the flow. Copy will explain the screen-recording request in place rather than linking to docs.
- **Calendar access leaves onboarding.** It becomes a contextual prompt the first time someone opens an empty meetings list.

## Action items

- Draft two copy variants for the permissions explainer — **Speaker 3**, by Thursday
- Wire the variant split behind the existing feature flag — **Speaker 2**
- Re-measure step-three drop-off after a week of data — **Speaker 1**

## Open questions

- Do we have enough weekly traffic to read a two-variant test inside a sprint?`;

const SUMMARIES = [
  {
    id: "s1",
    meeting_id: "m1",
    template_id: "tpl-standard",
    provider: "anthropic",
    model: "claude-opus-4-6",
    content: SUMMARY_CONTENT,
    created_at: day(28, 17, 40),
  },
];

/** A slide as an SVG data URL; the mock's convertFileSrc passes it through. */
function slideImage(title, lines, accent) {
  const body = lines
    .map((l, i) => `<text x="80" y="${250 + i * 64}" font-size="34" fill="#4b5563">${l}</text>`)
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
    <rect width="1280" height="720" fill="#fbfaf7"/>
    <rect width="1280" height="14" fill="${accent}"/>
    <text x="80" y="160" font-family="Helvetica, Arial" font-size="64" font-weight="700" fill="#1f2937">${title}</text>
    <g font-family="Helvetica, Arial">${body}</g>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const slide = (number, title, lines, accent, startMs, endMs, recap) => ({
  id: `snap${number}`,
  meeting_id: "m1",
  image_path: slideImage(title, lines, accent),
  text: [title, ...lines].join("\n"),
  offset_ms: startMs,
  created_at: day(28, 17, 0),
  recap,
  number,
  end_ms: endMs,
  headline: title,
});

/** The design review's shared deck, aligned to TRANSCRIPT. */
const SLIDES = [
  slide(1, "Onboarding funnel", ["Week of July 20", "6 steps · 4,812 new installs"], "#72937A", 10_000, 28_000,
    "Speaker 1 opened with this morning's funnel numbers, and Speaker 2 asked straight away about step three, the worst drop last time."),
  slide(2, "Step 3: permissions", ["31% drop-off", "Biggest single leak in the flow", "Support: \u201cwhy screen recording?\u201d"], "#CC765B", 28_000, 47_000,
    "Speaker 1 confirmed the 31% drop on the permissions screen. Speaker 3 tied it to support tickets from people who don\u2019t understand the screen-recording request."),
  slide(3, "Inline explainer", ["One sentence above the button", "Two copy variants behind a flag"], "#D9B78B", 47_000, 87_000,
    "The team agreed to explain the permission in place and ship it this sprint. Speaker 3 will draft two variants by Thursday; Speaker 2 will wire the split behind the existing flag."),
  slide(4, "Calendar permission", ["Keep in onboarding?", "Or ask on an empty library"], "#6B8FB5", 87_000, 126_000, null),
];

const SLIDE_SUMMARY_CONTENT = `## Overview

The team reviewed funnel data for the rebuilt onboarding flow [slide 1] and agreed on two changes: an inline explanation for the screen-recording permission, and deferring the calendar permission out of onboarding entirely.

## Decisions

- **Inline permissions explainer ships this sprint.** While the permissions slide was up, Speaker 1 put the drop at 31%, the largest in the flow [slide 2]. Copy will explain the request in place rather than linking to docs [slide 3].
- **Calendar access leaves onboarding.** Nobody defended keeping it; it becomes a contextual prompt on an empty meetings list [slide 4].

## Action items

- Draft two copy variants for the permissions explainer — **Speaker 3**, by Thursday [slide 3]
- Wire the variant split behind the existing feature flag — **Speaker 2**
- Re-measure step-three drop-off after a week of data — **Speaker 1**`;

/**
 * Overrides for a meeting with a shared slide deck (slide-aware summaries).
 * Not part of FIXTURES, so the marketing screenshots stay as they are.
 */
export const SLIDE_FIXTURES = {
  list_slides: SLIDES,
  get_summaries: [{ ...SUMMARIES[0], content: SLIDE_SUMMARY_CONTENT }],
  generate_slide_recap: SLIDES.map((s) =>
    s.recap
      ? s
      : {
          ...s,
          recap:
            "Speakers 3 and 2 both wanted calendar access out of onboarding, and Speaker 1 settled it: ask the first time someone opens an empty meetings list.",
        },
  ),
};

const INSIGHT_TYPES = [
  {
    id: "it1",
    name: "Decision",
    slug: "decision",
    description: "Choices the group committed to",
    extraction_prompt: "",
    icon: "lightbulb",
    has_action_fields: false,
    is_builtin: true,
    sort_order: 0,
    created_at: day(1, 9),
  },
  {
    id: "it2",
    name: "Action Item",
    slug: "action_item",
    description: "Work someone agreed to pick up",
    extraction_prompt: "",
    icon: "list-checks",
    has_action_fields: true,
    is_builtin: true,
    sort_order: 1,
    created_at: day(1, 9),
  },
  {
    id: "it3",
    name: "Key Moment",
    slug: "key_moment",
    description: "Turning points worth jumping back to",
    extraction_prompt: "",
    icon: "star",
    has_action_fields: false,
    is_builtin: true,
    sort_order: 2,
    created_at: day(1, 9),
  },
  {
    id: "it4",
    name: "Risk",
    slug: "risk",
    description: "Things that could derail the plan",
    extraction_prompt: "",
    icon: "alert-triangle",
    has_action_fields: false,
    is_builtin: false,
    sort_order: 3,
    created_at: day(1, 9),
  },
];

const insight = (o) => ({
  context: null,
  transcript_start_ms: null,
  transcript_end_ms: null,
  action_item_id: null,
  assignee: null,
  due_date: null,
  status: null,
  linear_ticket_id: null,
  action_item_updated_at: null,
  created_at: day(28, 17, 41),
  ...o,
});

const M1_INSIGHTS = [
  insight({
    id: "i1",
    meeting_id: "m1",
    type: "decision",
    content: "Ship an inline explainer for the screen-recording permission this sprint",
    transcript_start_ms: 58_000,
    transcript_end_ms: 66_000,
    meeting_title: "Design Review — Onboarding Flow",
    meeting_start_time: day(28, 17, 0),
  }),
  insight({
    id: "i2",
    meeting_id: "m1",
    type: "decision",
    content: "Move calendar access out of onboarding and make it contextual",
    transcript_start_ms: 118_000,
    transcript_end_ms: 126_000,
    meeting_title: "Design Review — Onboarding Flow",
    meeting_start_time: day(28, 17, 0),
  }),
  insight({
    id: "i3",
    meeting_id: "m1",
    type: "action_item",
    content: "Draft two copy variants for the permissions explainer",
    action_item_id: "a1",
    assignee: "Speaker 3",
    due_date: "2026-07-30",
    status: "open",
    transcript_start_ms: 68_000,
    meeting_title: "Design Review — Onboarding Flow",
    meeting_start_time: day(28, 17, 0),
  }),
  insight({
    id: "i4",
    meeting_id: "m1",
    type: "action_item",
    content: "Wire the variant split behind the existing feature flag",
    action_item_id: "a2",
    assignee: "Speaker 2",
    due_date: "2026-07-31",
    status: "open",
    transcript_start_ms: 78_000,
    meeting_title: "Design Review — Onboarding Flow",
    meeting_start_time: day(28, 17, 0),
  }),
  insight({
    id: "i5",
    meeting_id: "m1",
    type: "action_item",
    content: "Re-measure step-three drop-off after a week of data",
    action_item_id: "a3",
    assignee: "Speaker 1",
    due_date: null,
    status: "done",
    meeting_title: "Design Review — Onboarding Flow",
    meeting_start_time: day(28, 17, 0),
  }),
  insight({
    id: "i6",
    meeting_id: "m1",
    type: "key_moment",
    content: "31% of users drop off on the permissions screen — the biggest leak in the flow",
    transcript_start_ms: 29_000,
    transcript_end_ms: 36_000,
    meeting_title: "Design Review — Onboarding Flow",
    meeting_start_time: day(28, 17, 0),
  }),
  insight({
    id: "i7",
    meeting_id: "m1",
    type: "risk",
    content: "A two-variant copy test may not reach significance inside one sprint",
    meeting_title: "Design Review — Onboarding Flow",
    meeting_start_time: day(28, 17, 0),
  }),
];

const OTHER_INSIGHTS = [
  insight({
    id: "i8",
    meeting_id: "m2",
    type: "action_item",
    content: "Split the transcription worker refactor into two tickets",
    action_item_id: "a4",
    assignee: "Speaker 2",
    due_date: "2026-07-29",
    status: "open",
    meeting_title: "Sprint Planning",
    meeting_start_time: day(27, 16, 30),
  }),
  insight({
    id: "i9",
    meeting_id: "m4",
    type: "action_item",
    content: "Send Northwind the security questionnaire and SOC 2 summary",
    action_item_id: "a5",
    assignee: "Speaker 1",
    due_date: "2026-07-27",
    status: "done",
    meeting_title: "Customer Discovery — Northwind",
    meeting_start_time: day(24, 18, 0),
  }),
  insight({
    id: "i10",
    meeting_id: "m4",
    type: "decision",
    content: "Northwind pilots with ten seats before the org-wide rollout",
    meeting_title: "Customer Discovery — Northwind",
    meeting_start_time: day(24, 18, 0),
  }),
  insight({
    id: "i11",
    meeting_id: "m5",
    type: "decision",
    content: "Local-only mode ships before the integrations marketplace",
    meeting_title: "Q3 Roadmap Sync",
    meeting_start_time: day(23, 15, 0),
  }),
  insight({
    id: "i12",
    meeting_id: "m5",
    type: "action_item",
    content: "Write the Q3 roadmap post for the changelog",
    action_item_id: "a6",
    assignee: "Speaker 3",
    due_date: "2026-08-03",
    status: "open",
    meeting_title: "Q3 Roadmap Sync",
    meeting_start_time: day(23, 15, 0),
  }),
  insight({
    id: "i13",
    meeting_id: "m6",
    type: "key_moment",
    content: "Crash on resume traced to the audio device change handler",
    meeting_title: "Bug Triage",
    meeting_start_time: day(22, 22, 0),
  }),
];

const ANALYTICS = {
  speakers: [
    {
      id: "sa1",
      meeting_id: "m1",
      speaker_label: "Speaker 1",
      talk_time_ms: 962_000,
      turn_count: 24,
      interruption_count: 1,
      avg_turn_length_ms: 40_083,
      longest_monologue_ms: 118_000,
    },
    {
      id: "sa2",
      meeting_id: "m1",
      speaker_label: "Speaker 2",
      talk_time_ms: 748_000,
      turn_count: 21,
      interruption_count: 3,
      avg_turn_length_ms: 35_619,
      longest_monologue_ms: 96_000,
    },
    {
      id: "sa3",
      meeting_id: "m1",
      speaker_label: "Speaker 3",
      talk_time_ms: 570_000,
      turn_count: 17,
      interruption_count: 2,
      avg_turn_length_ms: 33_529,
      longest_monologue_ms: 87_000,
    },
  ],
  sentiment: [
    { id: "sn1", meeting_id: "m1", start_ms: 0, end_ms: 600_000, sentiment: "neutral", score: 0.12 },
    { id: "sn2", meeting_id: "m1", start_ms: 600_000, end_ms: 1_200_000, sentiment: "positive", score: 0.61 },
    { id: "sn3", meeting_id: "m1", start_ms: 1_200_000, end_ms: 1_800_000, sentiment: "positive", score: 0.48 },
    { id: "sn4", meeting_id: "m1", start_ms: 1_800_000, end_ms: 2_280_000, sentiment: "neutral", score: 0.05 },
  ],
  engagement: {
    id: "e1",
    meeting_id: "m1",
    engagement_level: "high",
    participation_balance: 0.82,
    question_count: 14,
    back_and_forth_ratio: 0.67,
  },
};

const TEMPLATES = [
  {
    id: "tpl-standard",
    name: "Standard Summary",
    description: "Overview, decisions, action items, and open questions",
    sections: "Overview\nDecisions\nAction items\nOpen questions",
    auto_apply_rules: "",
    prompt: "Summarize the meeting transcript into the sections above.",
    is_builtin: true,
    is_favorite: true,
    is_auto_run: true,
    created_at: day(1, 9),
  },
  {
    id: "tpl-standup",
    name: "Daily Standup",
    description: "Yesterday, today, blockers — one block per person",
    sections: "Yesterday\nToday\nBlockers",
    auto_apply_rules: "title contains standup",
    prompt: "Group the transcript by speaker into standup format.",
    is_builtin: true,
    is_favorite: false,
    is_auto_run: true,
    created_at: day(1, 9),
  },
  {
    id: "tpl-1on1",
    name: "1:1 Notes",
    description: "Themes, feedback, growth, and follow-ups",
    sections: "Themes\nFeedback\nGrowth\nFollow-ups",
    auto_apply_rules: "title contains 1:1",
    prompt: "Summarize this one-on-one, keeping feedback verbatim where possible.",
    is_builtin: true,
    is_favorite: true,
    is_auto_run: false,
    created_at: day(1, 9),
  },
  {
    id: "tpl-customer",
    name: "Customer Call",
    description: "Pain points, requests, objections, and next steps",
    sections: "Pain points\nFeature requests\nObjections\nNext steps",
    auto_apply_rules: "",
    prompt: "Extract customer signal from the transcript.",
    is_builtin: false,
    is_favorite: false,
    is_auto_run: false,
    created_at: day(4, 11),
  },
  {
    id: "tpl-interview",
    name: "Interview Debrief",
    description: "Signals, concerns, and a hire recommendation",
    sections: "Signals\nConcerns\nRecommendation",
    auto_apply_rules: "title contains interview",
    prompt: "Write an interview debrief from the transcript.",
    is_builtin: false,
    is_favorite: false,
    is_auto_run: false,
    created_at: day(9, 14),
  },
];

const RECIPES = [
  {
    id: "r1",
    name: "Follow-up Email",
    description: "Draft a follow-up email to everyone on the call",
    slash_command: "/email",
    prompt_template: "Write a short follow-up email covering the decisions and action items.",
    output_format: "markdown",
    is_builtin: true,
    created_at: day(1, 9),
    updated_at: day(1, 9),
  },
  {
    id: "r2",
    name: "Decision Log",
    description: "List every decision with the reasoning behind it",
    slash_command: "/decisions",
    prompt_template: "List each decision made, with who raised it and why it was chosen.",
    output_format: "markdown",
    is_builtin: true,
    created_at: day(1, 9),
    updated_at: day(1, 9),
  },
  {
    id: "r3",
    name: "Standup Update",
    description: "Turn the call into a three-line standup post",
    slash_command: "/standup",
    prompt_template: "Summarize this meeting as a three-line standup update.",
    output_format: "markdown",
    is_builtin: false,
    created_at: day(12, 10),
    updated_at: day(12, 10),
  },
];

const INTEGRATIONS = [
  { id: "int1", integration_type: "slack", name: "Acme Workspace", credentials_json: "{}", created_at: day(2, 9) },
  { id: "int2", integration_type: "notion", name: "Product Wiki", credentials_json: "{}", created_at: day(2, 9) },
  { id: "int3", integration_type: "linear", name: "Linear — Product", credentials_json: "{}", created_at: day(3, 9) },
];

const WORKFLOWS = [
  {
    id: "w1",
    name: "Post summary to Slack",
    description: "Sends the generated summary to #product-updates",
    icon: "💬",
    integration_id: "int1",
    action_type: "slack_message",
    config_json: '{"channel":"#product-updates"}',
    is_enabled: true,
    created_at: day(2, 9),
  },
  {
    id: "w2",
    name: "Append notes to Notion",
    description: "Adds the meeting to the Product Wiki database",
    icon: "📝",
    integration_id: "int2",
    action_type: "notion_page",
    config_json: '{"database":"Meetings"}',
    is_enabled: true,
    created_at: day(2, 9),
  },
  {
    id: "w3",
    name: "Create Linear issues",
    description: "Opens an issue for every open action item",
    icon: "🎫",
    integration_id: "int3",
    action_type: "linear_issue",
    config_json: '{"team":"PROD"}',
    is_enabled: true,
    created_at: day(3, 9),
  },
];

const WORKFLOW_RUNS = [
  {
    id: "wr1",
    meeting_id: "m1",
    workflow_id: "w1",
    status: "completed",
    result_json: '{"permalink":"#product-updates"}',
    error: null,
    started_at: day(28, 17, 42),
    completed_at: day(28, 17, 42),
    workflow_name: "Post summary to Slack",
    workflow_icon: "💬",
  },
  {
    id: "wr2",
    meeting_id: "m1",
    workflow_id: "w2",
    status: "completed",
    result_json: '{"page":"Design Review — Onboarding Flow"}',
    error: null,
    started_at: day(28, 17, 42),
    completed_at: day(28, 17, 43),
    workflow_name: "Append notes to Notion",
    workflow_icon: "📝",
  },
  {
    id: "wr3",
    meeting_id: "m1",
    workflow_id: "w3",
    status: "completed",
    result_json: '{"issues":2}',
    error: null,
    started_at: day(28, 17, 43),
    completed_at: day(28, 17, 43),
    workflow_name: "Create Linear issues",
    workflow_icon: "🎫",
  },
];

const CONVERSATIONS = [
  { id: "c1", title: "Onboarding drop-off", created_at: day(28, 18, 0), updated_at: day(28, 18, 6) },
  { id: "c2", title: "Northwind commitments", created_at: day(25, 9, 0), updated_at: day(25, 9, 12) },
  { id: "c3", title: "Open action items", created_at: day(24, 8, 30), updated_at: day(24, 8, 34) },
];

const CHAT_MESSAGES = {
  c1: [
    {
      id: "cm1",
      conversation_id: "c1",
      role: "user",
      content: "What have we said about onboarding drop-off in the last month?",
      sources_json: null,
      created_at: day(28, 18, 0),
    },
    {
      id: "cm2",
      conversation_id: "c1",
      role: "assistant",
      content: `Onboarding drop-off has come up in three meetings:

**Design Review — Onboarding Flow (Jul 28)** — The permissions screen loses **31%** of users, the largest single drop in the flow. The team decided to explain the screen-recording request inline instead of linking to docs, and to move calendar access out of onboarding entirely.

**Sprint Planning (Jul 27)** — The explainer was pulled into this sprint. The variant split rides on the existing feature flag so it can be turned off without a release.

**Q3 Roadmap Sync (Jul 23)** — Onboarding was ranked behind local-only mode but ahead of the integrations marketplace.

The one open question: whether a two-variant copy test can reach significance inside a single sprint.`,
      sources_json: JSON.stringify([
        { meeting_id: "m1", meeting_title: "Design Review — Onboarding Flow", start_ms: 29_000, end_ms: 36_000 },
        { meeting_id: "m1", meeting_title: "Design Review — Onboarding Flow", start_ms: 118_000, end_ms: 126_000 },
        { meeting_id: "m2", meeting_title: "Sprint Planning", start_ms: 412_000, end_ms: 425_000 },
        { meeting_id: "m5", meeting_title: "Q3 Roadmap Sync", start_ms: 1_204_000, end_ms: 1_219_000 },
      ]),
      created_at: day(28, 18, 1),
    },
    {
      id: "cm3",
      conversation_id: "c1",
      role: "user",
      content: "Who owns the follow-up work?",
      sources_json: null,
      created_at: day(28, 18, 5),
    },
    {
      id: "cm4",
      conversation_id: "c1",
      role: "assistant",
      content: `Three owners came out of the design review:

- **Speaker 3** — two copy variants for the permissions explainer, due Thursday
- **Speaker 2** — the variant split behind the existing feature flag
- **Speaker 1** — re-measuring step-three drop-off after a week of data

Speaker 1's item is already marked done.`,
      sources_json: JSON.stringify([
        { meeting_id: "m1", meeting_title: "Design Review — Onboarding Flow", start_ms: 68_000, end_ms: 86_000 },
      ]),
      created_at: day(28, 18, 6),
    },
  ],
  c2: [],
  c3: [],
};

const MODELS = [
  { id: "claude-opus-4-6", name: "Claude Opus 4.6", provider: "anthropic" },
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", provider: "anthropic" },
  { id: "gpt-5.2", name: "GPT-5.2", provider: "openai" },
  { id: "gemini-3-pro", name: "Gemini 3 Pro", provider: "google" },
  { id: "llama3.3:70b", name: "Llama 3.3 70B", provider: "ollama" },
  { id: "qwen3:14b", name: "Qwen 3 14B", provider: "ollama" },
];

const PROVIDERS = ["anthropic", "openai", "google", "groq", "openrouter", "bedrock", "ollama"];

/**
 * A one-second silent WAV. The meeting detail player needs a real source to
 * render as loaded; capture.mjs overrides the reported duration so the
 * transport matches the demo meeting's length.
 */
function silentWav() {
  const rate = 8000;
  const samples = rate;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + samples, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate, 28);
  header.writeUInt16LE(1, 32);
  header.writeUInt16LE(8, 34);
  header.write("data", 36);
  header.writeUInt32LE(samples, 40);
  return Buffer.concat([header, Buffer.alloc(samples, 128)]).toString("base64");
}

/**
 * Release builds get their version at publish time, so the newest released one
 * is the changelog's first numbered heading.
 */
function latestRelease() {
  const changelog = readFileSync(new URL("../../CHANGELOG.md", import.meta.url), "utf8");
  const version = changelog.match(/^## \[(\d+\.\d+\.\d+)\]/m)?.[1];
  if (!version) throw new Error("CHANGELOG.md has no released version heading");
  return version;
}

/** 12:30pm PDT on the day of the most recent demo meeting. */
export const DEMO_NOW = new Date("2026-07-28T19:30:00Z");

/** Length of the demo meeting, in seconds — see silentWav(). */
export const AUDIO_DURATION_SECONDS =
  (new Date(MEETINGS[0].end_time) - new Date(MEETINGS[0].start_time)) / 1000;

/** Transcript pushed into the live recording view via `transcript-update`. */
export const LIVE_TRANSCRIPT = TRANSCRIPT.map((s) => ({
  ...s,
  meeting_id: "m-live",
}));

const KNOWLEDGE_SOURCES = [
  {
    id: "ks-research",
    kind: "folder",
    location: "/Users/sam/Documents/Onboarding Research",
    name: "Onboarding Research",
    tags: ["Onboarding", "Research"],
    status: "ready",
    error: null,
    last_indexed_at: day(28, 9, 0),
    created_at: day(20, 9, 0),
    document_count: 14,
  },
  {
    id: "ks-metrics",
    kind: "file",
    location: "/Users/sam/Documents/Q3 Funnel Metrics.xlsx",
    name: "Q3 Funnel Metrics.xlsx",
    tags: ["Onboarding"],
    status: "ready",
    error: null,
    last_indexed_at: day(28, 9, 0),
    created_at: day(22, 9, 0),
    document_count: 1,
  },
  {
    id: "ks-guidelines",
    kind: "url",
    location: "https://developer.apple.com/design/human-interface-guidelines/privacy",
    name: "developer.apple.com/design/human-interface-guidelines/privacy",
    tags: [],
    status: "ready",
    error: null,
    last_indexed_at: day(28, 9, 0),
    created_at: day(24, 9, 0),
    document_count: 1,
  },
];

const KNOWLEDGE_DOCUMENTS = [
  {
    id: "kd-study",
    source_id: "ks-research",
    location: "/Users/sam/Documents/Onboarding Research/Usability study — permissions.pdf",
    title: "Usability study — permissions",
    kind: "pdf",
    indexed_at: day(28, 9, 0),
    chunk_count: 18,
  },
  {
    id: "kd-deck",
    source_id: "ks-research",
    location: "/Users/sam/Documents/Onboarding Research/Onboarding v2 review.pptx",
    title: "Onboarding v2 review",
    kind: "pptx",
    indexed_at: day(28, 9, 0),
    chunk_count: 12,
  },
];

const KNOWLEDGE_HITS = [
  {
    chunk_id: "kc-1",
    document_id: "kd-study",
    document_title: "Usability study — permissions",
    document_kind: "pdf",
    location: KNOWLEDGE_DOCUMENTS[0].location,
    locator: "Page 4",
    text: "7 of 12 participants hesitated at the screen-recording prompt. Most opened the docs link and did not come back; the three who saw a one-line explanation above the button all continued.",
    source_name: "Onboarding Research",
    tags: ["Onboarding", "Research"],
  },
  {
    chunk_id: "kc-2",
    document_id: "kd-deck",
    document_title: "Onboarding v2 review",
    document_kind: "pptx",
    location: KNOWLEDGE_DOCUMENTS[1].location,
    locator: "Slide 6",
    text: "Permissions step: 31% drop-off (was 24% in v1). Hypothesis: the docs link pulls people out of the flow.",
    source_name: "Onboarding Research",
    tags: ["Onboarding", "Research"],
  },
];

const LIVE_ASSIST_CARD = {
  id: "la-1",
  question: "What did the usability study find about the permissions screen?",
  answer:
    "7 of 12 participants hesitated at the screen-recording prompt, and everyone who saw a one-line explanation above the button continued [Usability study — permissions, Page 4].",
  sources: [
    {
      type: "document",
      document_id: "kd-study",
      document_title: "Usability study — permissions",
      document_kind: "pdf",
      locator: "Page 4",
      location: KNOWLEDGE_DOCUMENTS[0].location,
      snippet: KNOWLEDGE_HITS[0].text,
    },
  ],
  automatic: true,
};

const commitment = (o) => ({
  due_date: null,
  status: "open",
  transcript_start_ms: null,
  evidence: null,
  ...o,
});

const titleOf = (id) => MEETINGS.find((m) => m.id === id).title;
const startOf = (id) => MEETINGS.find((m) => m.id === id).start_time;
const evidence = (meetingId, verdict, timestampMs, quote) => ({
  meeting_id: meetingId,
  meeting_title: titleOf(meetingId),
  meeting_start_time: startOf(meetingId),
  verdict,
  timestamp_ms: timestampMs,
  quote,
});
const madeIn = (meetingId, meetingsSince, transcriptStartMs) => ({
  meeting_id: meetingId,
  meeting_title: titleOf(meetingId),
  meeting_start_time: startOf(meetingId),
  meetings_since: meetingsSince,
  transcript_start_ms: transcriptStartMs,
});

/** Action items with an owner, followed across later meetings. */
const COMMITMENTS = [
  commitment({
    id: "c1",
    owner: "Priya Shah",
    content: "Send Northwind the pricing deck and pilot terms",
    due_date: "2026-07-27",
    status: "slipped",
    ...madeIn("m4", 3, 2_412_000),
    evidence: evidence("m2", "slipped", 1_284_000, "The pricing deck is still with legal, it should go out Wednesday"),
  }),
  commitment({
    id: "c2",
    owner: "Alex Chen",
    content: "Send the recruiting screener for the onboarding study",
    status: "slipped",
    ...madeIn("m2", 2, 1_946_000),
    evidence: evidence("m1", "slipped", 2_031_000, "The screener isn't done yet, I'll have it Thursday"),
  }),
  commitment({
    id: "c3",
    owner: "You",
    content: "Book the user-research sessions for the onboarding study",
    due_date: "2026-07-31",
    ...madeIn("m5", 4, 3_120_000),
  }),
  commitment({
    id: "c4",
    owner: "Alex Chen",
    content: "Write up the transcription worker refactor plan",
    ...madeIn("m3", 1, 840_000),
  }),
  commitment({
    id: "c5",
    owner: "Jordan Lee",
    content: "Share the Q3 roadmap draft with the support team",
    status: "done",
    ...madeIn("m5", 4, 2_210_000),
    evidence: evidence("m1", "done", 1_772_000, "I shared the roadmap draft with support yesterday"),
  }),
  commitment({
    id: "c6",
    owner: "Sam Ortiz",
    content: "Re-run the crash-on-resume repro on an Intel Mac",
    status: "done",
    ...madeIn("m6", 5, 1_090_000),
    evidence: evidence("m2", "done", 655_000, "Repro'd it on the Intel mini, it's the device change handler"),
  }),
  commitment({
    id: "c7",
    owner: "Priya Shah",
    content: "Get legal sign-off on the new consent copy",
    status: "dropped",
    ...madeIn("m9", 6, 3_801_000),
  }),
];

const PEOPLE = [
  { name: "Priya Shah", meeting_count: 5, last_met: day(27, 16, 30), talk_time_ms: 2_940_000, open_action_items: 1 },
  { name: "Alex Chen", meeting_count: 4, last_met: day(28, 17, 0), talk_time_ms: 2_310_000, open_action_items: 2 },
  { name: "Jordan Lee", meeting_count: 3, last_met: day(28, 17, 0), talk_time_ms: 1_420_000, open_action_items: 0 },
  { name: "Sam Ortiz", meeting_count: 2, last_met: day(27, 16, 30), talk_time_ms: 980_000, open_action_items: 0 },
];

/** A Live Assist reminder of an open commitment, as the backend words it. */
const COMMITMENT_REMINDER = {
  id: "la-c1",
  question: "Priya Shah committed to send Northwind the pricing deck and pilot terms 3 meetings ago (Jul 24). It has slipped",
  answer: null,
  sources: [
    {
      type: "meeting",
      meeting_id: "m4",
      meeting_title: titleOf("m4"),
      start_ms: 2_412_000,
      end_ms: 2_412_000,
    },
  ],
  automatic: true,
  commitment_id: "c1",
};

/** The pre-meeting brief for the next event on the Meetings page. */
const UPCOMING_EVENTS = [
  {
    id: "ev-sync",
    title: "Weekly Product Sync",
    start: day(28, 19, 30),
    end: day(28, 20, 0),
    calendar: "Work",
    location: null,
    meeting_url: "https://meet.google.com/abc-defg-hij",
    attendee_count: 6,
    attendees: ["Alex Chen", "Priya Shah", "Sam Ortiz", "Jordan Lee"],
    notes: "1. Onboarding drop-off\n2. Pricing page copy\n3. Launch checklist",
  },
  {
    id: "ev-1on1",
    title: "1:1 with Jordan",
    start: day(28, 21, 0),
    end: day(28, 21, 30),
    calendar: "Work",
    location: null,
    meeting_url: "https://zoom.us/j/123456789",
    attendee_count: 2,
    attendees: ["Jordan Lee"],
    notes: null,
  },
];

const MEETING_BRIEF = {
  event: { ...UPCOMING_EVENTS[0], start: day(28, 19, 34) },
  attendees: [
    { name: "Alex Chen", person: "Alex", last_met: day(27, 20, 0), meeting_count: 7 },
    { name: "Priya Shah", person: null, last_met: day(28, 17, 0), meeting_count: 12 },
    { name: "Sam Ortiz", person: "Sam", last_met: day(21, 16, 0), meeting_count: 3 },
    { name: "Jordan Lee", person: null, last_met: null, meeting_count: 0 },
  ],
  open_items: [
    {
      id: "a1",
      content: "Draft two copy variants for the permissions explainer",
      assignee: "Priya",
      due_date: "2026-07-30",
      meeting_id: "m1",
      meeting_title: "Design Review — Onboarding Flow",
    },
    {
      id: "a6",
      content: "Share the pricing page experiment results",
      assignee: "Alex",
      due_date: null,
      meeting_id: "m5",
      meeting_title: "Weekly Product Sync",
    },
  ],
  last_meeting: {
    id: "m5",
    title: "Weekly Product Sync",
    start_time: day(21, 19, 30),
    decisions: [
      "Local-only mode ships before the integrations marketplace",
      "Move calendar permission out of onboarding",
    ],
    summary: null,
  },
  documents: [
    {
      document_id: "d1",
      title: "Onboarding funnel — Q3",
      locator: "Page 4",
      snippet: "31% of new users leave at the permissions screen; most never return after the docs link.",
    },
    {
      document_id: "d2",
      title: "Pricing page copy v3",
      locator: null,
      snippet: "Three tiers: Free, Pro and Team. Lead with local transcription in the hero.",
    },
  ],
};

/** Meeting Coach: you in the design review, and across recent calls. */
const COACH_METRICS = {
  talk_share: 0.34,
  talk_time_ms: 762_000,
  words: 1_880,
  words_per_minute: 148,
  interruptions: 2,
  times_interrupted: 1,
  questions: 9,
  statements: 41,
  filler_count: 27,
  fillers_per_minute: 2.1,
  top_fillers: [["like", 11], ["kind of", 8], ["um", 6]],
  longest_monologue_ms: 161_000,
  long_monologues: 1,
};

const COACH_TRENDS = [
  ["Customer call — Northwind", 0.52, 162, 5, 3, 4.2, 312_000],
  ["Sprint planning", 0.41, 158, 4, 5, 3.8, 248_000],
  ["Pricing review", 0.47, 155, 3, 4, 3.1, 226_000],
  ["1:1 with Jordan", 0.38, 151, 2, 8, 2.9, 175_000],
  ["Weekly Product Sync", 0.36, 150, 2, 7, 2.4, 190_000],
  ["Design Review — Onboarding Flow", 0.34, 148, 2, 9, 2.1, 161_000],
].map(([title, talk_share, words_per_minute, interruptions, questions, fillers_per_minute, longest_monologue_ms], i) => ({
  ...COACH_METRICS,
  meeting_id: `coach-${i}`,
  title,
  start_time: day(15 + i * 2, 17, 0),
  talk_share,
  words_per_minute,
  interruptions,
  questions,
  fillers_per_minute,
  longest_monologue_ms,
}));

/**
 * Command name -> response. Anything not listed here resolves to `null`, which
 * is enough for the fire-and-forget commands the screenshots never trigger.
 */
export const FIXTURES = {
  "plugin:app|version": latestRelease(),
  "plugin:window|inner_size": { width: 1440, height: 900 },
  "plugin:window|current_monitor": {
    name: "Built-in Retina Display",
    size: { width: 3024, height: 1964 },
    position: { x: 0, y: 0 },
    scaleFactor: 2,
    workArea: { position: { x: 0, y: 0 }, size: { width: 3024, height: 1890 } },
  },

  list_meetings: MEETINGS,
  get_meeting: MEETINGS[0],
  get_transcript: { [MEETINGS[0].id]: TRANSCRIPT },
  get_summaries: SUMMARIES,
  get_audio_recap: AUDIO_RECAP,
  generate_audio_recap: AUDIO_RECAP,
  ask_the_room: ROOM_ANSWER,
  get_insights: M1_INSIGHTS,
  get_all_insights: [...M1_INSIGHTS, ...OTHER_INSIGHTS],
  list_insight_types: INSIGHT_TYPES,
  get_meeting_analytics: ANALYTICS,
  get_meeting_coach: {
    metrics: COACH_METRICS,
    tip: "Before you explain a decision, pause and ask one open question, like “What would make this harder for you?”, and let it land before you answer.",
  },
  get_coach_trends: COACH_TRENDS,
  get_audio_data: silentWav(),
  get_scratch_notes: [],
  list_slides: [],
  list_snapshots: [],
  list_voice_profiles: [],
  list_dictionary_entries: [],
  list_meeting_annotations: {},

  list_labels: LABELS,
  get_all_meeting_labels: MEETING_LABELS,
  get_meeting_labels: [LABELS[0]],

  list_templates: TEMPLATES,
  list_recipes: RECIPES,
  list_integrations: INTEGRATIONS,
  list_workflows: WORKFLOWS,
  list_workflow_runs: WORKFLOW_RUNS,

  list_chat_conversations: CONVERSATIONS,
  list_chat_messages: CHAT_MESSAGES,

  list_knowledge_sources: KNOWLEDGE_SOURCES,
  list_knowledge_tags: ["Onboarding", "Research"],
  list_knowledge_documents: KNOWLEDGE_DOCUMENTS,
  search_knowledge: KNOWLEDGE_HITS,
  live_assist: LIVE_ASSIST_CARD,
  live_commitment_reminders: [COMMITMENT_REMINDER],

  list_commitments: COMMITMENTS,
  get_meeting_followups: {
    m1: COMMITMENTS.filter((c) => c.evidence?.meeting_id === "m1").map((c) => ({
      ...c,
      status: c.evidence.verdict,
    })),
  },
  list_people: PEOPLE,
  get_person: {
    name: "Priya Shah",
    meetings: ["m2", "m4", "m5", "m9"].map((id) => MEETINGS.find((m) => m.id === id)),
    // Her action items, as the Insights page lists them.
    action_items: COMMITMENTS.filter((c) => c.owner === "Priya Shah").map((c) =>
      insight({
        id: `i-${c.id}`,
        meeting_id: c.meeting_id,
        type: "action_item",
        content: c.content,
        action_item_id: c.id,
        assignee: c.owner,
        due_date: c.due_date,
        status: c.status === "dropped" ? "cancelled" : c.status === "done" ? "done" : "open",
        meeting_title: c.meeting_title,
        meeting_start_time: c.meeting_start_time,
      }),
    ),
  },
  get_embedding_status: { embedded: 6, total: 6, model_available: true },

  list_llm_models: MODELS,
  list_llm_providers: PROVIDERS,
  list_stored_providers: ["anthropic", "openai", "ollama"],
  has_api_key: true,
  get_downloaded_models: ["parakeet-v3", "nomic-embed-text"],
  get_available_models: [],
  get_app_setting: {},
  check_permissions: { microphone: "granted", screen_recording: true, calendar: "granted" },

  get_linear_tickets: [],
  list_linear_teams: [],
  list_linear_projects: [],
  get_linear_setting: null,

  list_upcoming_events: { status: "granted", events: UPCOMING_EVENTS },
  get_meeting_brief: MEETING_BRIEF,
  get_brief_popup: MEETING_BRIEF,
  synthesize_meeting_brief:
    "Start with the onboarding drop-off: check whether Priya's two copy variants are ready to test. " +
    "Then confirm the calendar-permission move from last week and ask Alex for the pricing results before the launch checklist.",
  import_extensions: ["mp3", "m4a", "wav", "mp4", "mov"],

  is_recording: false,
  current_recording: null,
  recording_status: null,
  start_recording: meeting(
    "m-live",
    "Design Review — Onboarding Flow",
    day(28, 17, 0),
    null,
    "recording",
  ),
  // Stopping the demo recording opens the finished design review.
  stop_recording: MEETINGS[0],

  // The menu bar popover (menubar.html), mid-recording with a Live Assist card.
  menu_bar_status: {
    recording: {
      meeting_id: "m-live",
      paused: false,
      elapsed_ms: 1_234_000,
      mic_level: 0.04,
      system_level: 0.03,
    },
    title: "Design Review — Onboarding Flow",
    live_assist: LIVE_ASSIST_CARD,
  },
};
