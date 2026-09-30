// Pre-fills a Slack app with the bot scopes Nootle needs, so creating one is
// "Create → Install → copy the token".
const SLACK_MANIFEST = {
  display_information: { name: "Nootle" },
  features: { bot_user: { display_name: "Nootle", always_online: false } },
  oauth_config: { scopes: { bot: ["chat:write", "chat:write.public"] } },
  settings: { org_deploy_enabled: false, socket_mode_enabled: false, token_rotation_enabled: false },
};

/**
 * `tokenUrl` opens the page where the user creates the credential to paste;
 * `tokenHint` says what to do there.
 */
export const INTEGRATION_TYPES = [
  {
    type: "slack", name: "Slack",
    fields: [{ key: "bot_token", label: "Bot token", placeholder: "xoxb-..." }],
    tokenUrl: `https://api.slack.com/apps?new_app=1&manifest_json=${encodeURIComponent(JSON.stringify(SLACK_MANIFEST))}`,
    tokenHint: "Pick your workspace and create the pre-filled app, click Install to Workspace, then copy the Bot User OAuth Token.",
  },
  {
    type: "notion", name: "Notion",
    fields: [{ key: "api_key", label: "API key", placeholder: "secret_..." }],
    tokenUrl: "https://www.notion.so/profile/integrations",
    tokenHint: "Create an internal integration and copy its secret. Then open your database, choose ••• → Connections, and add the integration.",
  },
  {
    type: "confluence", name: "Confluence",
    fields: [
      { key: "email", label: "Email", placeholder: "user@example.com" },
      { key: "api_token", label: "API token", placeholder: "Enter API token" },
      { key: "base_url", label: "Base URL", placeholder: "https://your-domain.atlassian.net" },
    ],
    tokenUrl: "https://id.atlassian.com/manage-profile/security/api-tokens",
    tokenHint: "Create an API token, then enter it with your Atlassian email and your site's URL.",
  },
  {
    type: "github", name: "GitHub",
    fields: [{ key: "token", label: "Token", placeholder: "ghp_..." }],
    tokenUrl: "https://github.com/settings/tokens/new?scopes=repo&description=Nootle",
    tokenHint: "The repo scope is pre-selected. Pick an expiration, generate the token, and copy it.",
  },
  {
    type: "linear", name: "Linear",
    fields: [{ key: "api_key", label: "API key", placeholder: "lin_api_..." }],
    tokenUrl: "https://linear.app/settings/account/security",
    tokenHint: "Under Personal API keys, create a new key and copy it.",
  },
  {
    type: "asana", name: "Asana",
    fields: [{ key: "token", label: "Token", placeholder: "Enter Asana token" }],
    tokenUrl: "https://app.asana.com/0/my-apps",
    tokenHint: "Create a personal access token and copy it.",
  },
  { type: "email", name: "Email", fields: [] },
  { type: "obsidian", name: "Obsidian", fields: [{ key: "vault_path", label: "Vault path", placeholder: "/path/to/vault" }] },
] as const;

export const ACTION_TYPES_BY_INTEGRATION: Record<string, { value: string; label: string; configFields: { key: string; label: string; placeholder: string; required: boolean }[] }[]> = {
  slack: [{ value: "post_summary", label: "Post summary", configFields: [
    { key: "channel", label: "Channel", placeholder: "#general", required: true },
    { key: "template_id", label: "Source template", placeholder: "Use this template's summary as {{template_summary}}", required: false },
    { key: "message_template", label: "Message template", placeholder: "Optional custom template", required: false },
  ] }],
  notion: [{ value: "create_page", label: "Create page", configFields: [
    { key: "database_id", label: "Database ID", placeholder: "Enter Notion database ID", required: true },
    { key: "template_id", label: "Source template", placeholder: "Use this template's summary as {{template_summary}}", required: false },
  ] }],
  confluence: [{ value: "create_page", label: "Create page", configFields: [
    { key: "space_key", label: "Space key", placeholder: "e.g. ENG", required: true },
    { key: "template_id", label: "Source template", placeholder: "Use this template's summary as {{template_summary}}", required: false },
  ] }],
  github: [{ value: "create_issues", label: "Create issues", configFields: [
    { key: "repo", label: "Repository", placeholder: "owner/repo", required: true },
    { key: "description_prompt", label: "Description prompt", placeholder: "Describe what info should be in each issue (e.g. 'Include the action item, why it matters, and any related decisions')", required: false },
  ] }],
  linear: [{ value: "create_issues", label: "Create issues", configFields: [
    { key: "team_id", label: "Team ID", placeholder: "Enter Linear team ID", required: true },
    { key: "project_id", label: "Project ID", placeholder: "Optional project ID", required: false },
    { key: "description_prompt", label: "Description prompt", placeholder: "Describe what info should be in each issue (e.g. 'Include the action item, why it matters, and any related decisions')", required: false },
  ] }],
  asana: [{ value: "create_tasks", label: "Create tasks", configFields: [
    { key: "project_id", label: "Project ID", placeholder: "Enter Asana project ID", required: true },
    { key: "description_prompt", label: "Description prompt", placeholder: "Describe what info should be in each task (e.g. 'Include the action item, why it matters, and any related decisions')", required: false },
  ] }],
  email: [{ value: "generate_draft", label: "Generate draft", configFields: [
    { key: "subject", label: "Subject", placeholder: "Optional subject line", required: false },
    { key: "template_id", label: "Source template", placeholder: "Use this template's summary as {{template_summary}}", required: false },
    { key: "body", label: "Body", placeholder: "Defaults to {{template_summary}} when a source template is set, otherwise {{summary}} + action items", required: false },
  ] }],
  obsidian: [{ value: "create_note", label: "Create note", configFields: [
    { key: "subfolder", label: "Subfolder", placeholder: "Meetings", required: true },
    { key: "template_id", label: "Source template", placeholder: "Use this template's summary as {{template_summary}}", required: false },
    { key: "filename_template", label: "Filename template", placeholder: "{{date}} - {{title}}", required: false },
    { key: "note_template", label: "Note template", placeholder: "Optional custom template", required: false },
  ] }],
};
