export interface Meeting {
  id: string;
  title: string;
  start_time: string;
  end_time: string | null;
  audio_path: string | null;
  status: "recording" | "transcribing" | "summarized" | "archived" | "idle";
  calendar_event_id: string | null;
  raw_notes: string | null;
  enriched_notes: string | null;
  template_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecordingStatus {
  meeting_id: string;
  paused: boolean;
  /** Recorded time so far, not counting pauses. */
  elapsed_ms: number;
  /** Latest microphone input level (RMS, 0–1). */
  mic_level: number;
  /** Latest system audio level; null when system audio isn't captured. */
  system_level: number | null;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  calendar: string | null;
  location: string | null;
  meeting_url: string | null;
  attendee_count: number;
}

export interface UpcomingEvents {
  status: "granted" | "denied" | "undetermined";
  events: CalendarEvent[];
}

export interface TranscriptSegment {
  id: string;
  meeting_id: string;
  speaker_label: string;
  text: string;
  start_ms: number;
  end_ms: number;
  confidence: number;
}

export interface Label {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  created_at: string;
}

export interface MeetingLabelEntry {
  meeting_id: string;
  label: Label;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  sections: string;
  auto_apply_rules: string;
  prompt: string;
  is_builtin: boolean;
  is_favorite: boolean;
  is_auto_run: boolean;
  created_at: string;
}

export interface Summary {
  id: string;
  meeting_id: string;
  template_id: string | null;
  provider: string;
  model: string;
  content: string;
  created_at: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/** One spoken line of an Ask the Room recap or answer. */
export interface RecapLine {
  speaker: string;
  text: string;
  voice: string;
  start_ms: number;
  end_ms: number;
}

export interface AudioRecap {
  meeting_id: string;
  audio_path: string;
  lines: RecapLine[];
  provider: string;
  model: string;
  created_at: string;
}

export interface RoomAnswer {
  line: RecapLine;
  audio_path: string;
}

export interface DetectedMeeting {
  app_name: string;
  display_name: string;
}

export interface LinearTicket {
  id: string;
  summary_id: string;
  meeting_id: string;
  linear_issue_id: string;
  linear_issue_url: string;
  linear_identifier: string;
  title: string;
  team_id: string;
  project_id: string | null;
  created_at: string;
}

export interface LinearTeam {
  id: string;
  name: string;
  key: string;
}

export interface LinearProject {
  id: string;
  name: string;
}

export interface MeetingSource {
  type?: "meeting";
  meeting_id: string;
  meeting_title: string;
  start_ms: number;
  end_ms: number;
}

export interface DocumentSource {
  type: "document";
  document_id: string;
  document_title: string;
  document_kind: string;
  /** "Page 3", "Slide 2", "Sheet: Budget". */
  locator: string | null;
  location: string;
  snippet: string;
}

/** A passage an answer drew on: a moment in a meeting, or part of a document. */
export type ChatSource = MeetingSource | DocumentSource;

/** What Ask answers from. */
export type AskScope = "all" | "meetings" | "knowledge";

export interface KnowledgeSource {
  id: string;
  kind: "folder" | "file" | "url";
  location: string;
  name: string;
  tags: string[];
  status: "pending" | "indexing" | "ready" | "error";
  error: string | null;
  last_indexed_at: string | null;
  created_at: string;
  document_count: number;
}

export interface KnowledgeDocument {
  id: string;
  source_id: string;
  location: string;
  title: string;
  kind: string;
  indexed_at: string;
  chunk_count: number;
}

export interface KnowledgeHit {
  chunk_id: string;
  document_id: string;
  document_title: string;
  document_kind: string;
  location: string;
  locator: string | null;
  text: string;
  source_name: string;
  tags: string[];
}

export interface LiveAssistCard {
  id: string;
  question: string;
  answer: string | null;
  sources: ChatSource[];
  automatic: boolean;
}

export interface GlobalChatResponse {
  response: string;
  sources: ChatSource[];
}

export interface GlobalChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  sources?: ChatSource[];
}

export interface EmbeddingStatus {
  embedded: number;
  total: number;
  model_available: boolean;
}

export interface InsightType {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  extraction_prompt: string;
  icon: string;
  has_action_fields: boolean;
  is_builtin: boolean;
  sort_order: number;
  created_at: string;
}

export interface ChatConversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessageRecord {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  sources_json: string | null;
  created_at: string;
}

export interface ScratchNote {
  id: string;
  meeting_id: string;
  content: string;
  timestamp_ms: number;
  created_at: string;
}

export type AnnotationKind = "comment" | "highlight" | "flag";

/** A comment, highlight, or flag an agent pinned to a meeting over MCP or the CLI. */
export interface MeetingAnnotation {
  id: string;
  meeting_id: string;
  start_ms: number;
  /** Set when it highlights a range rather than a moment. */
  end_ms: number | null;
  kind: AnnotationKind;
  /** Markdown. */
  body: string;
  /** The MCP client's name, or "cli". */
  author: string;
  created_at: string;
  resolved_at: string | null;
}

/** A picture of content shared on screen during a meeting. */
export interface Snapshot {
  id: string;
  meeting_id: string;
  image_path: string;
  /** Text read off the image. */
  text: string;
  offset_ms: number;
  created_at: string;
}

export interface Recipe {
  id: string;
  name: string;
  description: string;
  slash_command: string;
  prompt_template: string;
  output_format: string;
  is_builtin: boolean;
  created_at: string;
  updated_at: string;
}

export interface InsightWithActionItem {
  id: string;
  meeting_id: string;
  type: string;
  content: string;
  context: string | null;
  transcript_start_ms: number | null;
  transcript_end_ms: number | null;
  created_at: string;
  action_item_id: string | null;
  assignee: string | null;
  due_date: string | null;
  status: "open" | "done" | null;
  linear_ticket_id: string | null;
  action_item_updated_at: string | null;
  meeting_title: string | null;
  meeting_start_time: string | null;
}

/** A meeting's share link on nootle.ai; `url` carries the decryption key after `#`. */
export interface MeetingShare {
  meeting_id: string;
  share_id: string;
  url: string;
  include_transcript: boolean;
  updated_at: string;
}

export interface Integration {
  id: string;
  integration_type: string;
  name: string;
  credentials_json: string;
  created_at: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  integration_id: string;
  action_type: string;
  config_json: string;
  is_enabled: boolean;
  created_at: string;
}

export interface WorkflowRun {
  id: string;
  meeting_id: string;
  workflow_id: string;
  status: "pending" | "running" | "completed" | "failed";
  result_json: string | null;
  error: string | null;
  started_at: string;
  completed_at: string | null;
  workflow_name: string | null;
  workflow_icon: string | null;
}

export interface DictionaryEntry {
  id: string;
  term: string;
  misheard: string[];
  source: "manual" | "learned" | "imported";
  created_at: string;
}

export interface DictionaryImportSummary {
  added: number;
  updated: number;
}

export interface LearnedCorrection {
  from: string;
  to: string;
}

export interface SegmentEditResult {
  learned: LearnedCorrection[];
  corrected_segments: number;
}
