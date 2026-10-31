# CLI, MCP server, and URL scheme

## CLI tool

`nootle-cli` is a standalone command-line tool that covers everything Nootle does outside of live recording: meetings, transcripts, labels, notes, action items, recipes, analytics, Ask, settings, and automations. It reads and writes the Nootle database directly — the app doesn't need to be running.

`nootle-cli` ships inside Nootle.app at `/Applications/Nootle.app/Contents/MacOS/nootle-cli`; symlink it onto your PATH, or build it from source:

```bash
# Build and install
cargo install --path src-tauri

# List meetings
nootle-cli meetings list

# Search transcripts
nootle-cli search "quarterly review"

# List open action items
nootle-cli actions list --status open

# Export a meeting as Markdown, txt, srt, or vtt
nootle-cli meetings export <meeting-id> --format srt --output call.srt

# A meeting's slides with when each was on screen, and a recap of what was said
# while each was up (LLM; recaps also come with automatic summaries)
nootle-cli meetings slides <meeting-id>
nootle-cli meetings slide-recap <meeting-id>

# Name a speaker
nootle-cli meetings rename-speaker <meeting-id> "Speaker 2" "Priya"

# Summarize, or ask about one meeting or all of them (uses your configured LLM;
# --provider and --model pick another)
nootle-cli meetings summarize <meeting-id>
nootle-cli meetings ask <meeting-id> "What did we decide about pricing?"
nootle-cli ask "Who owns the Q3 launch?"

# A spoken recap of a meeting, a voice per speaker, made on your Mac (macOS
# speech synthesis). Prints the script and the audio file; cached, so add
# --regenerate for a new one. The MCP server's generate_audio_recap does the same.
nootle-cli meetings listen <meeting-id>

# Ask only your knowledge base, or only documents tagged "Research"
nootle-cli ask "What's our refund policy?" --knowledge-only
nootle-cli ask "What did the study find?" --tag Research

# Pin a note to 14:32 (or a range with --to), list a meeting's notes, resolve one
nootle-cli meetings annotate <meeting-id> "This contradicts ADR-12" --at 14:32 --kind flag
nootle-cli meetings annotations <meeting-id>
nootle-cli meetings resolve-annotation <annotation-id>   # --reopen to undo

# Tag a meeting and mark an action item done
nootle-cli meetings label <meeting-id> --add Customer
nootle-cli actions update <action-item-id> --status done

# Commitments (action items with an owner): who owes what, and whether
# later meetings show it done or slipped
nootle-cli commitments list --owner Priya --status slipped
nootle-cli commitments update <action-item-id> --status dropped
nootle-cli commitments check <meeting-id>   # check a meeting for follow-ups now (LLM)

# Brief for the next calendar meeting (or --event <id> from `nootle-cli calendar`):
# who's coming, open action items, last time's decisions, related documents
nootle-cli brief --pretty

# Start and stop recording in the running app (needs Settings → Recording → Allow URL control)
nootle-cli record start --title "Staff sync"
nootle-cli record stop
```

Output is JSON by default. Add `--pretty` for human-readable formatting. See `nootle-cli --help` for all commands.

### Automations

Agents and scripts can set up the same automations as the app: integrations, workflows, summary templates, and insight types. Input is validated, and errors list what's allowed.

```bash
# What can be automated: integration types, actions, and their fields
nootle-cli catalog

# Connect Slack. Credentials can come from stdin or @file to keep them out of shell history.
echo '{"bot_token":"xoxb-..."}' | nootle-cli integrations create --type slack --credentials -

# Create a workflow that posts summaries to #eng
nootle-cli workflows create --name "Post to #eng" --integration <integration-id> --set channel=#eng

# Run it on a meeting now
nootle-cli workflows run <workflow-id> --meeting <meeting-id>

# Summarize every new meeting with a custom template
nootle-cli templates create --name "1:1" --section Wins --section Blockers --auto-run

# Extract a custom insight type from every transcript
nootle-cli insight-types create --name Risk --prompt "Risks or concerns someone raised" --icon alert-triangle
```

Credentials are stored locally and never printed. If the app is open, reopen the page to see changes made from the CLI.

### Claude Code skill

Install the skill so Claude can query your meetings and manage automations:

```bash
claude skill add --global --file "$(dirname $(which nootle-cli))/../skills/nootle-cli.md"
```

## MCP server

`nootle-cli mcp` serves Nootle over MCP. The CLI ships inside Nootle.app, so there's nothing extra to install (Settings → About shows the exact command for your install):

```bash
claude mcp add --scope user nootle -- /Applications/Nootle.app/Contents/MacOS/nootle-cli mcp
```

The server supports MCP 2026-07-28 and the older handshake-based versions. Older setups that run the app with `--mcp` keep working, and the app serves MCP instead of opening whenever an MCP client launches it over stdio.

The server has the same features as the CLI, except API keys, recording control, and listing the calendar: reading, searching, and editing meetings, labels, notes, action items, commitments (`list_commitments`, `update_commitment`), and the dictionary; searching your knowledge base (`search_knowledge`, `list_knowledge_sources`), which `ask_meetings` also answers from; a pre-meeting brief for an upcoming calendar event (`get_meeting_brief`); summaries, insights, Ask, and other LLM features; and workflows, integrations, summary templates, and insight types. Agents can also pin comments, highlights, and flags to a moment or range of a meeting (`add_meeting_annotation`, `list_meeting_annotations`, `resolve_meeting_annotation`, `delete_meeting_annotation`). Each is marked with the MCP client's name and shows on the meeting's timeline in the app; `get_meeting` includes them. So you can ask an agent things like *"Tag last week's customer calls and summarize what they asked for"* or *"Set up a workflow that posts meeting recaps to #eng"* or *"Review yesterday's design review against our ADRs and flag anything that contradicts one"*. Large results come in pages, and tools that delete things ask Claude to confirm with you first.

To give an agent read access only, add `--read-only`: it can search and read your meetings (agent notes included) but can't edit, delete, annotate, or send anything to an integration. Meeting text comes from everyone in the meeting, so this is the safer choice for agents that act on what they read.

```bash
claude mcp add --scope user nootle-readonly -- /Applications/Nootle.app/Contents/MacOS/nootle-cli mcp --read-only
```

## URL scheme

Other apps and scripts can control recording with `nootle://` links. This is off by default. Turn on **Settings → Recording → Allow URL control** first.

Every link must carry this Mac's secret `token`, so a web page can't start a recording just by opening a link. Copy a ready-made link from **Settings → Recording**; `nootle-cli record` adds the token for you.

```bash
open "nootle://record/start?token=$TOKEN&title=Staff%20sync"   # no-op if already recording
open "nootle://record/stop?token=$TOKEN"
open "nootle://record/toggle?token=$TOKEN"
open "nootle://record/status?token=$TOKEN"
open "nootle://permissions/screen?token=$TOKEN"                # prompt for Screen Recording access
open "nootle://permissions/status?token=$TOKEN"
```

Nootle shows a notification whenever a link starts or stops a recording, or fails.
