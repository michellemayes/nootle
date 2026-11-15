Nootle uses large language models to generate meeting summaries and power the chat feature. You can choose from several providers.

## Supported Providers

| Provider | API Key Required | Notes |
|----------|-----------------|-------|
| **OpenAI** | Yes | GPT-5, GPT-4.1, and other models. Get a key at [platform.openai.com](https://platform.openai.com) |
| **Anthropic** | Yes | Claude Sonnet 4.6, Opus 4.6, and more. Get a key at [console.anthropic.com](https://console.anthropic.com) |
| **Google** | Yes | Gemini 2.5 and 3.1 models. Get a key at [aistudio.google.com](https://aistudio.google.com) |
| **Groq** | Yes | Fast inference with Llama and Qwen models. Get a key at [console.groq.com](https://console.groq.com) |
| **OpenRouter** | Yes | Access 400+ models through one API. Get a key at [openrouter.ai](https://openrouter.ai) |
| **Ollama** | No | Run models locally. Install from [ollama.com](https://ollama.com) |
| **Claude (subscription)** | No | Uses your existing Claude subscription via the [Claude Agent SDK](https://docs.claude.com/en/api/agent-sdk/overview). Requires the `claude` CLI to be installed and logged in. |
| **Codex (API key)** | Yes | GPT-5 Codex via the OpenAI Responses API. Uses an OpenAI key with Codex access. |
| **Custom endpoint** | Depends | Any OpenAI-compatible API (OpenRouter, Azure, Together, LM Studio, vLLM…) with the models you list. Set it up under Settings → API keys → **Custom endpoint** |
| **Codex CLI (subscription)** | No | Uses your existing ChatGPT Plus/Pro subscription via the [Codex CLI](https://github.com/openai/codex). Requires the `codex` CLI to be installed and logged in. |

## Setting Up a Provider

1. Go to **Settings** in the sidebar.
2. Open the **API keys** tab and find the provider you want.
3. Click **Add key** and paste your API key.
4. The key is stored securely and never leaves your machine.

Once at least one provider is configured, Nootle will use it for summaries and chat.

## Using a Custom Endpoint

Point Nootle at any server that speaks the OpenAI chat API to use models the built-in list doesn't offer.

1. Open **Settings → API keys → Custom endpoint**.
2. Enter the **Base URL**, e.g. `https://openrouter.ai/api/v1` or `http://localhost:1234/v1` for LM Studio. Pasting a full `…/chat/completions` URL works too.
3. Add the API key, if the server needs one.
4. Type each model ID and press Enter, e.g. `anthropic/claude-sonnet-4.6` or `qwen/qwen3-235b-a22b`.
5. Click **Save**. Nootle sends a one-word test message and shows whether it worked.

The models appear under the **custom** provider in the model picker. A custom endpoint counts as cloud AI, so it's off in Local-only mode.

## Cloud Transcription

Recordings are transcribed on your Mac. If your audio is noisy and a hosted model does better, **Settings → Models → Cloud transcription** sends each finished recording to an OpenAI-compatible `/audio/transcriptions` endpoint (OpenAI `whisper-1` or `gpt-4o-transcribe`, Groq `whisper-large-v3`, a self-hosted Whisper server, and so on).

- The live transcript during a call is still made on your Mac. When the meeting ends, the recording is uploaded in pieces of up to 20 MB, split at pauses, and the endpoint's transcript replaces the live one. Speakers are then labelled on your Mac as usual.
- If the endpoint fails, the transcript from your Mac stays.
- The transcript header's **Transcribe again** button re-sends an earlier meeting's recording.
- Cloud transcription is paused in Local-only mode.

## Using Ollama (Local, No API Key)

Ollama lets you run LLMs entirely on your Mac with no API key and no data leaving your machine.

1. Install Ollama from [ollama.com](https://ollama.com).
2. Pull a model: `ollama pull llama3.2`
3. Make sure Ollama is running (it starts a local server on port 11434).
4. Nootle auto-detects Ollama — no API key needed.

## Using Claude via Your Subscription (No API Key)

If you already have a Claude subscription (Pro, Max, or Team), you can route Nootle's AI features through it using the Claude Agent SDK — no Anthropic API key required.

1. Install the Claude CLI: see [Claude Code setup](https://docs.claude.com/en/docs/claude-code/setup).
2. Log in with `claude login` (or run `claude` once and complete the browser flow).
3. Restart Nootle. The **Claude (subscription)** provider appears automatically when the `claude` binary is on your `PATH`. Nootle reads your login shell's `PATH` at startup (and checks common install locations such as Homebrew, `~/.local/bin`, and nvm), so a CLI that works in your terminal is found even when Nootle is opened from Finder or the Dock.

Usage is metered against your Claude subscription, not an API key.

## Switching Providers

Nootle uses whichever provider has a configured API key. If you have multiple keys saved, Nootle picks the first available one. To switch, remove the key for the provider you don't want to use.
