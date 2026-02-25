export interface Meeting {
  id: string;
  title: string;
  start_time: string;
  end_time: string | null;
  category_id: string | null;
  audio_path: string | null;
  status: string; // "recording" | "transcribing" | "summarized" | "archived"
  calendar_event_id: string | null;
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
  category_id: string | null;
  sections: string;
  auto_apply_rules: string;
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
