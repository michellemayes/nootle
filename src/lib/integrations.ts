export const INTEGRATION_TYPES = [
  { type: "slack", name: "Slack", fields: [{ key: "bot_token", label: "Bot Token", placeholder: "xoxb-..." }] },
  { type: "notion", name: "Notion", fields: [{ key: "api_key", label: "API Key", placeholder: "secret_..." }] },
  { type: "confluence", name: "Confluence", fields: [
    { key: "email", label: "Email", placeholder: "user@example.com" },
    { key: "api_token", label: "API Token", placeholder: "Enter API token" },
    { key: "base_url", label: "Base URL", placeholder: "https://your-domain.atlassian.net" },
  ] },
  { type: "github", name: "GitHub", fields: [{ key: "token", label: "Token", placeholder: "ghp_..." }] },
  { type: "linear", name: "Linear", fields: [{ key: "api_key", label: "API Key", placeholder: "lin_api_..." }] },
  { type: "asana", name: "Asana", fields: [{ key: "token", label: "Token", placeholder: "Enter Asana token" }] },
  { type: "email", name: "Email", fields: [] },
  { type: "obsidian", name: "Obsidian", fields: [{ key: "vault_path", label: "Vault Path", placeholder: "/path/to/vault" }] },
] as const;

export const ACTION_TYPES_BY_INTEGRATION: Record<string, { value: string; label: string; configFields: { key: string; label: string; placeholder: string; required: boolean }[] }[]> = {
  slack: [{ value: "post_summary", label: "Post Summary", configFields: [
    { key: "channel", label: "Channel", placeholder: "#general", required: true },
    { key: "message_template", label: "Message Template", placeholder: "Optional custom template", required: false },
  ] }],
  notion: [{ value: "create_page", label: "Create Page", configFields: [
    { key: "database_id", label: "Database ID", placeholder: "Enter Notion database ID", required: true },
  ] }],
  confluence: [{ value: "create_page", label: "Create Page", configFields: [
    { key: "space_key", label: "Space Key", placeholder: "e.g. ENG", required: true },
  ] }],
  github: [{ value: "create_issues", label: "Create Issues", configFields: [
    { key: "repo", label: "Repository", placeholder: "owner/repo", required: true },
    { key: "description_prompt", label: "Description prompt", placeholder: "Describe what info should be in each issue (e.g. 'Include the action item, why it matters, and any related decisions')", required: false },
  ] }],
  linear: [{ value: "create_issues", label: "Create Issues", configFields: [
    { key: "team_id", label: "Team ID", placeholder: "Enter Linear team ID", required: true },
    { key: "project_id", label: "Project ID", placeholder: "Optional project ID", required: false },
    { key: "description_prompt", label: "Description prompt", placeholder: "Describe what info should be in each issue (e.g. 'Include the action item, why it matters, and any related decisions')", required: false },
  ] }],
  asana: [{ value: "create_tasks", label: "Create Tasks", configFields: [
    { key: "project_id", label: "Project ID", placeholder: "Enter Asana project ID", required: true },
    { key: "description_prompt", label: "Description prompt", placeholder: "Describe what info should be in each task (e.g. 'Include the action item, why it matters, and any related decisions')", required: false },
  ] }],
  email: [{ value: "generate_draft", label: "Generate Draft", configFields: [
    { key: "subject", label: "Subject", placeholder: "Optional subject line", required: false },
    { key: "body", label: "Body", placeholder: "Optional body template", required: false },
  ] }],
  obsidian: [{ value: "create_note", label: "Create Note", configFields: [
    { key: "subfolder", label: "Subfolder", placeholder: "Meetings", required: true },
    { key: "filename_template", label: "Filename Template", placeholder: "{{date}} - {{title}}", required: false },
    { key: "note_template", label: "Note Template", placeholder: "Optional custom template", required: false },
  ] }],
};
