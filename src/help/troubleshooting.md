# Troubleshooting

Common issues and how to fix them.

## Audio Not Recording

**Microphone not captured:**
- Open System Settings → Privacy & Security → Microphone and confirm Nootle is allowed.
- If you just granted the permission, restart Nootle.
- Try a quick test recording to confirm audio is working.

**System audio not captured:**
- System audio requires Screen Recording permission. Go to System Settings → Privacy & Security → Screen Recording and enable Nootle.
- Restart Nootle after granting this permission.
- Note: System audio capture uses macOS CoreAudio and works with most virtual meeting apps (Zoom, Teams, Google Meet, etc).

## Transcription Issues

**No transcript appearing:**
- Make sure audio is actually being recorded (you should see an active waveform during recording).
- Transcription runs locally via the Parakeet model. On first launch, the model may take a moment to load.
- If the transcript is empty after stopping, check that your microphone is picking up sound (try a different mic if available).

**Inaccurate transcription:**
- Transcription quality depends on audio clarity. Reduce background noise when possible.
- Speaker identification works best with 2-4 distinct speakers.

## LLM Provider Errors

**"No LLM provider configured":**
- Go to Settings and add an API key for at least one provider, or install Ollama.

**Summary generation fails:**
- Verify your API key is valid and has available credits/quota.
- Check that you have internet connectivity (not needed for Ollama).
- Try a different provider to isolate whether the issue is provider-specific.

## MCP Server Issues

See the **MCP Server** tab for detailed MCP troubleshooting.

## General

**App won't start:**
- Make sure you're running macOS 14 or later.
- Try deleting the app preferences: `~/Library/Application Support/Nootle/` and relaunching.

**Data location:**
- Database: `~/Library/Application Support/Nootle/nootle.db`
- Audio files are stored alongside the database.
