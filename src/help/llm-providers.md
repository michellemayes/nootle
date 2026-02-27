# LLM Providers

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

## Setting Up a Provider

1. Go to **Settings** in the sidebar.
2. Find the provider you want under **API Keys**.
3. Click **Add Key** and paste your API key.
4. The key is stored securely and never leaves your machine.

Once at least one provider is configured, Nootle will use it for summaries and chat.

## Using Ollama (Local, No API Key)

Ollama lets you run LLMs entirely on your Mac with no API key and no data leaving your machine.

1. Install Ollama from [ollama.com](https://ollama.com).
2. Pull a model: `ollama pull llama3.2`
3. Make sure Ollama is running (it starts a local server on port 11434).
4. Nootle auto-detects Ollama — no API key needed.

## Switching Providers

Nootle uses whichever provider has a configured API key. If you have multiple keys saved, Nootle picks the first available one. To switch, remove the key for the provider you don't want to use.
