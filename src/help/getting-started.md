
Welcome to Nootle — your local AI meeting recorder and assistant. This guide walks you through recording your first meeting.

## Permissions

Nootle needs three macOS permissions to work properly:

- **Microphone** — captures your voice and other participants via speakers. Grant when prompted or go to System Settings → Privacy & Security → Microphone.
- **Screen Recording** — required for system audio capture (hearing what others say in virtual meetings), and for Snapshots. Go to System Settings → Privacy & Security → Screen Recording.
- **Calendar** — optional. Shows your next meetings on the Meetings page and names recordings after the event happening now. Go to System Settings → Privacy & Security → Calendars, or click **Connect calendar** on the Meetings page.

After changing permissions you may need to restart Nootle for them to take effect.

## Your First Recording

1. Click **New recording** in the sidebar, or press **⌘N** from anywhere.
2. Nootle begins capturing your microphone and (if permitted) system audio.
3. A live transcript appears as you speak — you'll see text populate in real time with speaker labels.
4. Need to step out or go off the record? Click **Pause**. Nothing is recorded or transcribed until you click **Resume**, and the timer only counts recorded time.
5. When the meeting ends, click **Stop** or press **⌘↵**.

The recording is saved locally and appears in your **Meetings** library. If you wander off to another page mid-meeting, the sidebar button turns into **Back to recording**.

With calendar access, a recording started while an event is underway (or about to start) takes the event's name. The **Up next** list on the Meetings page shows your next events with a **Record** button, plus **Join** when the event has a Zoom, Meet, Teams, or Webex link.

## Snapshots

Sometimes the thing worth remembering is on screen and never said out loud: a chart, a design, or the number on slide 4. Turn on **Snapshots** in Settings → General and, when someone shares their screen during a recorded call, Nootle snaps what they share into your notes, one picture for each new slide or page.

- Only the meeting app's window is captured, never anything else on your screen. Browser calls count only while the meeting tab is showing.
- Nothing is snapped while the recording is paused.
- A **Snapshots** indicator in the recording bar counts them as they're taken.
- Text on each snapshot is read on your Mac and used by summaries, chat, and search, so you can ask things like "what did the revenue chart say?".
- Snapshots appear at the bottom of the meeting's **Notes** tab. Click one to see it full size, or remove any you don't want.

## Importing a Recording

Already have a recording, like a voice memo, a Zoom cloud recording, or a video? Click **Import** on the Meetings page and pick the file. Nootle reads MP3, M4A, AAC, WAV, AIFF, CAF, FLAC, and Ogg audio, and MP4, MOV, and MKV video (when the audio track is AAC, MP3, ALAC, FLAC, Vorbis, or PCM). The meeting opens right away and the transcript fills in as it's transcribed, then the title, summary, and insights follow, just like a live recording. Everything stays on your Mac.

## Keyboard Shortcuts

| Shortcut | What it does |
| --- | --- |
| ⌘K | Command palette — jump to any meeting or page, start a recording, or ask a question across all meetings |
| ⌘N | Start a recording (or return to the one in progress) |
| ⌘↵ | Stop and save the current recording |
| ⌘1 – ⌘6 | Meetings, Insights, Chat, Automations, Settings, Help |
| ⌘, | Settings |
| / | Search the meeting library |
| ⌘⇧N | Add a scratch note while recording |

## Streaks

The top of the Meetings page tracks your momentum: a streak of consecutive workdays with at least one recording (weekends never break it), how many meetings you've captured this week, and how many action items are still open.

## Reviewing a Meeting

Open any meeting from the library to see:

- **Transcript** — the full text with speaker labels and timestamps. Click any segment to jump to that point.
- **Summary** — click **Generate Summary** to create an AI-powered summary using your configured LLM provider. You can customize the summary style under **Prompts**.
- **Chat** — ask follow-up questions about the meeting. For example: "What action items were discussed?" or "Summarize what Alice said about the budget."
- **Export** — click **Export** at the top of the meeting to save it as Markdown (summaries, action items, notes, and transcript), a plain-text transcript, or SRT / WebVTT subtitles.

## Insights

Open any meeting and switch to the **Insights** tab to extract structured information:

- **Decisions** — key decisions made during the meeting
- **Action Items** — tasks assigned with optional assignee and due date
- **Key Moments** — important highlights from the conversation

Select your LLM provider and model, then click **Extract Insights**.

## Customizing Summaries

- **Prompts** (sidebar → Prompts) — control *what the AI focuses on* and *how it writes*. A prompt is a set of instructions like "extract action items, keep it concise, use bullet points." Different prompts produce different styles of summary from the same meeting.

## Auto-Titling

After a recording ends, Nootle automatically generates a title from the transcript content. You can click the title on any meeting detail page to rename it.

## Staying Up to Date

Nootle checks for new versions on its own. When one is available, a card appears in the bottom-right corner. Click **Install & Restart** to download and install it; Nootle relaunches on the new version. To check yourself, use **Help → Check for Updates…** in the menu bar or the **Check for updates** button in **Settings → About**. Installing waits until you've finished any recording in progress.
