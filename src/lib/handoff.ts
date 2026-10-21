import type { ComponentType } from "react";
import { MessageSquareShare } from "lucide-react";
import { ClaudeIcon, OpenAIIcon, PerplexityIcon } from "@/components/BrandIcons";

// Settings behind "Continue in…"; the backend's handoff.rs checks them.
export const HANDOFF_APP_SETTING = "handoff_app";
export const HANDOFF_NAME_SETTING = "handoff_name";
export const HANDOFF_URL_SETTING = "handoff_url";
export const HANDOFF_ICON_SETTING = "handoff_icon";
export const CUSTOM_HANDOFF = "custom";

export interface HandoffApp {
  id: string;
  name: string;
  Logo: ComponentType<{ className?: string }>;
}

/** The apps a meeting can be continued in, matching handoff.rs's presets. */
export const HANDOFF_APPS: HandoffApp[] = [
  { id: "claude", name: "Claude", Logo: ClaudeIcon },
  { id: "chatgpt", name: "ChatGPT", Logo: OpenAIIcon },
  { id: "codex", name: "Codex", Logo: OpenAIIcon },
  { id: "perplexity", name: "Perplexity", Logo: PerplexityIcon },
  { id: CUSTOM_HANDOFF, name: "Custom", Logo: MessageSquareShare },
];
