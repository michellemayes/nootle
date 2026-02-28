# Beat Krisp & Granola — Design Document

**Date:** 2026-02-27
**Goal:** Make Nootle better than Krisp and Granola on cost — same or better features, free/cheaper.

Three features to ship together:

---

## 1. Input Noise Cancellation

Run a denoising model on captured audio before transcription to improve Parakeet accuracy.

**Pipeline:**
```
Mic/System Audio → ringbuf → DenoiseFilter → WAV Writer → Parakeet
                                    ↑
                          DeepFilterNet3 ONNX (~3MB)
```

- DeepFilterNet3 ONNX model, real-time on Apple Silicon via CoreML
- Process audio in ~10ms frames between capture and WAV writer in `capture.rs`
- Denoised audio is saved and transcribed — cleaner input, better output
- Same model download/cache pattern as Parakeet
- Toggle in Settings (on by default)

---

## 2. Zero-Friction Meeting Detection

Detect meetings in the background and send an actionable macOS notification with a "Start Recording" button.

**Detection engine (polls every 3-5s):**
- **Process detection** — NSWorkspace checks for Zoom, Teams, Meet, Webex, Slack Huddle
- **NeMo MarbleNet VAD** — ONNX voice activity detection (~5MB), same NeMo ecosystem as Parakeet, runs on CoreML
- **Calendar match** — current time overlaps a calendar event

**Decision rule:** 2+ signals agree → send notification. One-time per detected session, no re-nagging.

**Notification:**
- macOS actionable notification: "It looks like you're in a meeting. Start recording?"
- "Start Recording" action button triggers recording in the background via Tauri — no need to open the app
- Confirmation notification: "Recording started for [Calendar Event Name / Detected Meeting]"
- Menu bar icon switches to recording state for manual stop
- Dismiss = nothing happens

**Implementation:**
- `UNUserNotificationCenter` with registered action category
- Handle action response in Tauri app delegate → `start_recording` command
- Auto-populate meeting title from calendar event if available
- Track detection state to avoid duplicate notifications per session

**Settings:** detection on/off, which apps to watch

---

## 3. Meeting Analytics

Post-meeting analytics derived from existing diarization and transcription data.

### Talk-Time Analytics (from diarization)
- Per-speaker talk time (total seconds + percentage)
- Speaking turns count per speaker
- Average turn length per speaker
- Longest monologue
- Interruption count (speaker starts within 500ms of another ending)

### Sentiment Analysis (via LLM, post-meeting)
- Sentiment classification on each transcript chunk (positive/neutral/negative + score)
- Sentiment arc over the meeting timeline
- Flag notably negative or positive segments

### Engagement Score (computed)
- Composite metric: participation balance + turn-taking frequency + question frequency
- More balanced talk-time + more turn-taking + more questions = higher engagement
- Displayed as High / Medium / Low

### UI — New "Analytics" Tab on Meeting Detail
- Horizontal bar chart for talk-time per speaker
- Timeline sparkline showing sentiment arc
- Engagement score badge
- Key stats cards: total duration, speaker count, interruptions, questions asked

### Storage
```sql
meeting_analytics (
  id, meeting_id, speaker_label,
  talk_time_ms, turn_count, interruption_count, avg_turn_length_ms
)

sentiment_segments (
  id, meeting_id, start_ms, end_ms,
  sentiment TEXT, -- positive/neutral/negative
  score REAL
)
```

- Talk-time analytics computed post-diarization
- Sentiment computed post-transcription via LLM

---

## What's NOT in This Design

- **Notepad / AI note enhancement** — being built separately
- **CRM sync** — deferred to later
- **Full Krisp-style virtual audio device** — deferred; input-only denoising for now
- **Real-time analytics during recording** — post-meeting only for v1
