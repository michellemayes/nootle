export const faqs = [
  {
    question: "Is Nootle free?",
    answer:
      "Yes. Nootle is completely free and open source under the MIT license. You can download it from GitHub, inspect the source code, and contribute to development. If Nootle saves you time, you can optionally support development through GitHub Sponsors.",
  },
  {
    question: "Does Nootle send my meetings to the cloud?",
    answer:
      "No. All audio recording and transcription happens locally on your Mac using on-device machine learning powered by ONNX Runtime. No meeting audio or transcripts are ever uploaded to external servers. Your conversations remain entirely on your hardware.",
  },
  {
    question: "What meeting apps does Nootle support?",
    answer:
      "Nootle auto-detects meetings on Zoom, Microsoft Teams, and Google Meet. It captures both your microphone input and system audio output, so it works with any conferencing app that plays audio through your Mac's speakers or headphones.",
  },
  {
    question: "What macOS version does Nootle require?",
    answer:
      "Nootle requires macOS 14 (Sonoma) or later. It runs natively on both Apple Silicon (M1, M2, M3, M4) and Intel Macs. The app requires Microphone and Screen Recording permissions to capture meeting audio.",
  },
  {
    question: "How does the AI chat feature work?",
    answer:
      "After a meeting is transcribed, you can ask questions about the conversation in natural language. Nootle sends the transcript context to your chosen AI provider — OpenAI, Anthropic, Google, Groq, or a local model via Ollama — using your own API key. The transcript itself stays on your Mac; only the relevant context is sent when you ask a question.",
  },
  {
    question: "What integrations does Nootle support?",
    answer:
      "Nootle integrates with Slack, Notion, Confluence, GitHub, Linear, Asana, Obsidian, and email. After a meeting, you can automatically push summaries, action items, and notes to any connected tool. You can also use the CLI or MCP server to build custom workflows.",
  },
  {
    question: "How accurate is the transcription?",
    answer:
      "Nootle uses Parakeet, a state-of-the-art speech recognition model running via ONNX Runtime. Accuracy depends on audio quality, but built-in noise cancellation helps produce clear transcripts even in noisy environments. Speaker diarization automatically identifies different speakers in the conversation.",
  },
  {
    question: "Can I search across past meetings?",
    answer:
      "Yes. Nootle includes AI-powered semantic search that lets you query your entire meeting history. Instead of scrolling through transcripts, ask a question like \"What did we decide about the Q2 roadmap?\" and Nootle finds the relevant passages across all your recorded meetings.",
  },
];
