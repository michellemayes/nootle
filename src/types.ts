export interface Meeting {
  id: string;
  title: string;
  start_time: string;
  end_time: string | null;
  category_id: string | null;
  audio_path: string | null;
  status: string; // "recording" | "transcribing" | "summarized" | "archived"
  calendar_event_id: string | null;
  raw_notes: string | null;
  enriched_notes: string | null;
  template_id: string | null;
  created_at: string;
  updated_at: string;
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

export interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
  created_at: string;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface MeetingTagEntry {
  meeting_id: string;
  tag: Tag;
}

export interface Prompt {
  id: string;
  name: string;
  content: string;
  is_favorite: boolean;
  is_auto_run: boolean;
  created_at: string;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  category_id: string | null;
  sections: string;
  auto_apply_rules: string;
  prompt: string;
  is_builtin: boolean;
  created_at: string;
}

export interface Summary {
  id: string;
  meeting_id: string;
  prompt_id: string | null;
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
  role: string;
  content: string;
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

export interface ChatSource {
  meeting_id: string;
  meeting_title: string;
  start_ms: number;
  end_ms: number;
}

export interface GlobalChatResponse {
  response: string;
  sources: ChatSource[];
}

export interface GlobalChatMessage {
  role: string;
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
  role: string;
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

export interface InsightWithActionItem {
  id: string;
  meeting_id: string;
  type: string; // "decision" | "action_item" | "key_moment"
  content: string;
  context: string | null;
  transcript_start_ms: number | null;
  transcript_end_ms: number | null;
  created_at: string;
  action_item_id: string | null;
  assignee: string | null;
  due_date: string | null;
  status: string | null; // "open" | "done"
  linear_ticket_id: string | null;
  action_item_updated_at: string | null;
  meeting_title: string | null;
  meeting_start_time: string | null;
}
