export const RELEASES_URL = "https://github.com/michellemayes/nootle/releases";
export const SPONSOR_URL = "https://github.com/sponsors/michellemayes";
export const BREW_COMMAND =
  "brew tap michellemayes/nootle https://github.com/michellemayes/nootle && brew install --cask nootle";

/** Call apps Nootle's meeting detection recognises. */
export const CALL_APPS = ["Zoom", "Microsoft Teams", "Webex", "Slack", "FaceTime", "Discord", "Browser calls"];

/** Every way to plug in an AI model. */
export const AI_PROVIDERS = [
  "OpenAI",
  "Anthropic",
  "Google",
  "Groq",
  "OpenRouter",
  "AWS Bedrock",
  "Claude Code",
  "Codex CLI",
  "Ollama",
];

/** Display font utility (Outfit), loaded in app/layout.tsx. */
export const outfit = "font-[family-name:var(--font-outfit)]";

/** Underlined inline text link, used in footers and bylines. */
export const linkClass =
  "underline hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:rounded-sm";
