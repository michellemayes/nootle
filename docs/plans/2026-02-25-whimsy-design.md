# Nootle Whimsy Design — "Moments of Delight"

**Approach:** Keep the existing clean monochrome design system. Inject personality through copy, micro-interactions, celebratory animations, and easter eggs. Confident and charming — clearly playful without undermining the professional tool.

**No sounds.** Visual and textual only.

---

## 1. Playful Copy

Replace generic text with lines that have personality.

### Empty States

| Location | Current | New |
|---|---|---|
| Meeting library | "No meetings yet" / "Start a new recording to get started" | "No meetings yet" / "Hit record and let Nootle do its thing" |
| Prompts | "No prompts yet" / "Create a prompt to get started with summarization" | "No prompts yet" / "Teach Nootle what to listen for" |
| Summaries | "No summaries yet. Generate one above." | "Nothing cooked up yet. Pick a prompt and let it rip." |
| Chat | "Ask questions about this meeting" | "Go ahead, quiz Nootle about this meeting" |
| Transcript (recording) | "Transcript will appear here as you speak..." | "Listening... your words will show up here" |
| Transcript (detail) | "No transcript available yet" | "No transcript here — this one's a mystery" |

### Rotating Loading Messages

Randomly selected each time a loading state appears:

- "Warming up the noodles..."
- "Untangling the transcript..."
- "Slurping through the data..."
- "Almost there, just al dente..."

### Button Labels & Headers

| Location | Current | New |
|---|---|---|
| Sidebar button | "New Recording" | "Record Something" |
| Generate summary button | "Generate Summary" | "Cook Up a Summary" |
| Generate summary (loading) | "Generating..." | "Cooking..." |
| Chat send button | "Send" | "Ask" |
| Chat header | "Chat with Meeting" | "Ask Nootle" |
| Onboarding welcome body | "Your AI-powered meeting recorder..." | "Nootle captures your meetings, transcribes them live, and cooks up smart summaries — all on your Mac." |
| Onboarding done heading | "You're all set!" | "You're ready to nootle!" |
| Settings about | "Meeting recorder and summarizer" | "Your meetings, transcribed and summarized with a twist" |

---

## 2. Micro-interactions & Hover Effects

### Sidebar Logo Wiggle
- "N" logo rotates -3deg to 3deg on hover with a spring animation.

### Button Squish
- Primary buttons scale to 0.97 on press with a fast spring, bounce back on release.

### Meeting Card Hover
- Cards lift 2px on hover with a slight shadow increase.

### Nav Item Icon Bounce
- Sidebar nav icons bounce up 1px on hover before settling.

### Recording Waveform Cascade
- Waveform bars cascade in from left to right with staggered entrance when recording starts.

### Chat Message Entrance
- Messages fade in with a slight slide-up as they appear.

### Thinking Indicator
- "Thinking..." replaced with three dots that cycle opacity (animated ellipsis).

### Copy Button Feedback
- Text morphs to a checkmark with a brief scale-up pulse.

### Delete Item Exit
- Items shrink and fade out rather than vanishing instantly.

---

## 3. Celebratory Animations

### Summary Generated — Sparkle Burst
- 5-8 tiny sparkle particles radiate outward from the generate button.
- ~600ms duration, uses primary color.

### Recording Stopped — Ripple Pulse
- Stop button emits an expanding ring that fades out.
- Gives a "captured" feeling before navigating away.

### Onboarding Complete — Gentle Sparkle Shower
- Slow drift of tiny sparkles behind the final screen text.

### Permission Granted — Badge Bounce
- Green "Granted" badge does a quick scale bounce (1.0 -> 1.15 -> 1.0).

---

## 4. Easter Eggs

### Logo Click Sequence
- Click the sidebar "N" logo 5 times rapidly.
- Sidebar does a single sine-wave ripple animation (~400ms).
- No hint or tooltip. A reward for fidgeting.

### Search "noodle"
- Type "noodle" in the meeting library search.
- Empty state shows: "You found the secret noodle! Unfortunately, it's not a meeting." with a noodle bowl emoji.
- Disappears when search text changes.

---

## Files Affected

- `src/components/Sidebar.tsx` — logo wiggle, nav bounce, button label, easter egg
- `src/pages/MeetingLibrary.tsx` — card hover, empty state copy, loading copy, noodle easter egg
- `src/pages/RecordingView.tsx` — waveform cascade, stop ripple, transcript copy
- `src/pages/MeetingDetail.tsx` — summary sparkle, generate button label, empty state copy, chat button label
- `src/components/ChatPanel.tsx` — header, send button, empty state, message entrance, thinking dots
- `src/components/Onboarding.tsx` — welcome/done copy, sparkle shower, permission badge bounce
- `src/pages/Prompts.tsx` — empty state copy, delete exit animation
- `src/pages/Templates.tsx` — empty state copy, delete exit animation
- `src/pages/Settings.tsx` — about copy, copy button feedback
- `src/components/ui/button.tsx` — squish interaction (whileTap)
