export const faqs = [
  {
    question: "Is Nootle free?",
    answer:
      "Yes. Nootle is completely free and open source under the MIT license. You can download it from GitHub, inspect the source code, and contribute to development. If Nootle saves you time, you can optionally support development through GitHub Sponsors.",
  },
  {
    question: "Does Nootle send my meetings to the cloud?",
    answer:
      "Recording and transcription are always local — meeting audio is never uploaded, and transcripts are stored only on your Mac. AI summaries and chat use whichever provider you choose: pick Ollama to keep everything on-device, or OpenAI, Anthropic, Google, Groq, OpenRouter, or AWS Bedrock to send transcript context to that provider with your own API key. Nootle is fully local end-to-end only when you use a local AI model. Turn on Local-only mode (Settings → Privacy) to enforce that.",
  },
  {
    question: "Does Nootle join my calls as a bot?",
    answer:
      "No. Nootle records your microphone and your Mac's system audio directly, so nobody sees an extra participant. Because of that, a consent reminder offers a message you can paste into the meeting chat when a recording starts.",
  },
  {
    question: "What meeting apps does Nootle support?",
    answer:
      "Nootle records any call that plays audio through your Mac. With Auto-detect meetings on, a small pop-up offers to record when a call starts on Zoom, Microsoft Teams, Webex, Slack, FaceTime, Discord, or a browser call like Google Meet. You can also import audio and video files, or transcripts exported from Otter, Fathom, Granola, Zoom, Teams, or Meet.",
  },
  {
    question: "Can I use my Claude or ChatGPT subscription instead of an API key?",
    answer:
      "Yes. Nootle can route summaries and chat through the Claude Code CLI (claude -p) or the Codex CLI, reusing a Claude or ChatGPT subscription you already have. You can also use an API key for OpenAI, Anthropic, Google, Groq, OpenRouter, or AWS Bedrock, or a local model through Ollama.",
  },
  {
    question: "Can Nootle answer questions from my own documents?",
    answer:
      "Yes. On the Knowledge page, add project folders, files, and web pages (PDF, Word, PowerPoint, Excel, Markdown, plain text, CSV, and HTML). Nootle reads and indexes them on your Mac; the files never leave it. Chat then answers from your meetings and documents together, citing the page, slide, or sheet. During a call, Live Assist uses the same knowledge base to answer questions as they come up.",
  },
  {
    question: "How does the AI chat feature work?",
    answer:
      "After a meeting is transcribed, you can ask questions about it, or across every meeting and document, in plain language. Nootle finds the relevant passages on your Mac and sends only those to your chosen AI provider. Answers cite the meeting moments and document pages they came from, and you can click a citation to jump there.",
  },
  {
    question: "What macOS version does Nootle require?",
    answer:
      "Nootle requires macOS 14 (Sonoma) or later on Apple Silicon (M1, M2, M3, M4, or M5). Intel Macs are not supported. The app needs Microphone and Screen Recording permissions to capture meeting audio; Calendar access is optional.",
  },
  {
    question: "What integrations does Nootle support?",
    answer:
      "Nootle integrates with Slack, Notion, Confluence, GitHub, Linear, Asana, Obsidian, and email. Notion, Linear, and Confluence connect in one click through their official MCP servers, and GitHub can reuse your GitHub CLI sign-in. After a meeting, workflows push summaries, action items, and notes to any connected tool. You can also use the CLI or MCP server to build custom workflows.",
  },
  {
    question: "How accurate is the transcription?",
    answer:
      "Nootle uses Parakeet, a state-of-the-art speech recognition model running via ONNX Runtime, or Underdog Bark 3.0 Plus, a smaller English-only version of it that's as accurate. Nootle splits audio where people pause, so whole sentences are transcribed together, and after each meeting it compares every speaker's voice across the whole recording to tell people apart. Fix a misheard name once and the dictionary applies it to every future meeting. Accuracy depends on audio quality.",
  },
  {
    question: "Can I search across past meetings?",
    answer:
      "Yes. Nootle combines meaning-based search with keyword search across your entire meeting history and knowledge base. Ask a question like \"What did we decide about the Q2 roadmap?\" or search for a ticket number or a customer's name, and Nootle finds the relevant passages.",
  },
  {
    question: "Who can read a meeting I share?",
    answer:
      "Anyone you give the link to, and no one else. Share links are end-to-end encrypted: Nootle encrypts the notes on your Mac with a key of their own, uploads only the encrypted copy, and puts the key in the link after the #, a part browsers never send to a server. So nootle.ai stores nothing it can read. The transcript is left out unless you include it, and Stop sharing, or deleting the meeting, deletes the shared copy. Sharing is off in Local-only mode.",
  },
  {
    question: "Does Nootle collect analytics?",
    answer:
      "No. The Nootle app sends no analytics, crash reports, or usage data anywhere. Its only network calls are the AI provider you pick, model downloads from Hugging Face, integrations you set up, share links you create (end-to-end encrypted), web pages you add to your knowledge base, and the update check against GitHub Releases.",
  },
];
