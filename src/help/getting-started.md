# Getting Started

Welcome to Nootle — your local AI meeting recorder and assistant. This guide walks you through recording your first meeting.

## Permissions

Nootle needs three macOS permissions to work properly:

- **Microphone** — captures your voice and other participants via speakers. Grant when prompted or go to System Settings → Privacy & Security → Microphone.
- **Screen Recording** — required for system audio capture (hearing what others say in virtual meetings). Go to System Settings → Privacy & Security → Screen Recording.
- **Calendar** — optional, lets Nootle detect upcoming meetings and auto-label recordings. Go to System Settings → Privacy & Security → Calendars.

After changing permissions you may need to restart Nootle for them to take effect.

## Your First Recording

1. Click **New Recording** in the sidebar.
2. Nootle begins capturing your microphone and (if permitted) system audio.
3. A live transcript appears as you speak — you'll see text populate in real time with speaker labels.
4. When the meeting ends, click **Stop Recording**.

The recording is saved locally and appears in your **Meetings** library.

## Reviewing a Meeting

Open any meeting from the library to see:

- **Transcript** — the full text with speaker labels and timestamps. Click any segment to jump to that point.
- **Summary** — click **Generate Summary** to create an AI-powered summary using your configured LLM provider. You can customize the summary style under **Prompts**.
- **Chat** — ask follow-up questions about the meeting. For example: "What action items were discussed?" or "Summarize what Alice said about the budget."

## Customizing Prompts and Templates

- **Prompts** (sidebar → Prompts) — edit the instructions Nootle sends to the LLM when generating summaries or answering chat questions.
- **Templates** (sidebar → Templates) — create reusable summary formats for different meeting types (standup, 1:1, all-hands, etc).
