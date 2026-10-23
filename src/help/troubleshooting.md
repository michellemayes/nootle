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
- Transcription runs locally via the Parakeet or Bark model. On first launch, the model may take a moment to load; Bark compiles itself for your Mac the first time, which can take a few minutes.
- Bark is English only. For meetings in other languages, download Parakeet in Settings → Models and delete Bark there. While both are downloaded, Bark is the one in use.
- If the transcript is empty after stopping, check that your microphone is picking up sound (try a different mic if available).

**Inaccurate transcription:**
- Transcription quality depends on audio clarity. Reduce background noise when possible.
- Speaker identification works best with 2-4 distinct speakers.

**Speakers aren't named from the call:**
- Nootle reads names off the call window only when it has Screen Recording permission (Settings → Permissions) and **Names from the call** is on (Settings → Recording). It checks when a recording starts, so after allowing Screen Recording, quit and reopen Nootle before your next call.
- Keep people's names showing in the call window (Zoom's gallery or speaker view both work). The window can be covered by other windows or full screen in its own Space, but not minimised. Names on a shared screen are ignored, and so are names cut short to fit a small tile ("Christopher Aber…"), so make the window bigger in a large call.
- A speaker is named automatically only when it's certain: in a 1:1, everything said on the far end gets the other person's name (even without the Speaker Diarization model); in a bigger call, the last voice is named once everyone else's voice is remembered. Otherwise click the speaker's name in the transcript and pick a name from the call. With **Remember voices** on, they're named for you next time.
- Still nothing? After the call, look for the line starting `Call names for meeting` in `~/Library/Logs/Nootle/nootle.log`. It says how many names were read and how many looks found no call window to read.

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

**Running low on disk space:**
- Settings → Models shows how much each model, your meeting audio, and the logs take.
- Delete models you don't use there. Parakeet's full-precision model alone is about 2.5 GB.
- **Clean up** frees unfinished model downloads, models older versions of Nootle used, audio from meetings you deleted, and old logs.
