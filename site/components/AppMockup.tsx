"use client";

import { motion } from "framer-motion";

const transcriptLines = [
  { time: "00:42", speaker: "Sarah", color: "#4EEABB", text: "I think we should prioritize the onboarding flow this sprint." },
  { time: "01:15", speaker: "James", color: "#C084FC", text: "Agreed. The drop-off rate on step three is way too high." },
  { time: "01:38", speaker: "Sarah", color: "#4EEABB", text: "Exactly. I've got some wireframes we can look at after this." },
  { time: "02:04", speaker: "Priya", color: "#E879A8", text: "Can we also revisit the notification settings? Users keep asking about that." },
  { time: "02:31", speaker: "James", color: "#C084FC", text: "Good call. Let's timebox that for 30 minutes after the onboarding discussion." },
  { time: "03:12", speaker: "Sarah", color: "#4EEABB", text: "Sounds good. I'll share my screen now." },
];

const chatMessages = [
  { role: "user" as const, text: "What were the main action items?" },
  {
    role: "assistant" as const,
    text: "Three action items came up:\n1. Sarah shares onboarding wireframes\n2. Team reviews step 3 drop-off\n3. Priya leads notification settings discussion",
  },
  { role: "user" as const, text: "Who raised the notification issue?" },
  { role: "assistant" as const, text: "Priya brought it up at 2:04, noting that users keep requesting notification settings changes." },
];

function Sidebar() {
  return (
    <div className="w-48 bg-[#1A1A2E] flex flex-col p-3 shrink-0">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#4EEABB] to-[#C084FC] flex items-center justify-center text-white text-xs font-bold">
          N
        </div>
        <span className="text-white font-bold text-sm tracking-tight">Nootle</span>
      </div>
      <button className="w-full bg-gradient-to-r from-[#4EEABB] to-[#5BC4A8] text-white text-xs font-semibold py-2 px-3 rounded-lg mb-4 text-left">
        New Recording
      </button>
      <nav className="flex flex-col gap-1 text-xs">
        {[
          { icon: "🎤", label: "Meetings", active: true },
          { icon: "📄", label: "Templates", active: false },
          { icon: "✨", label: "Prompts", active: false },
          { icon: "⚙️", label: "Settings", active: false },
        ].map((item) => (
          <div
            key={item.label}
            className={`flex items-center gap-2 px-2 py-1.5 rounded-md ${
              item.active
                ? "bg-white/10 text-white"
                : "text-gray-500"
            }`}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </div>
        ))}
      </nav>
      <div className="mt-auto text-[10px] text-gray-600">Nootle v0.1.0</div>
    </div>
  );
}

function TranscriptPanel() {
  return (
    <div className="flex-1 flex flex-col min-w-0 border-r border-gray-200">
      <div className="px-4 py-2 border-b border-gray-200">
        <p className="text-[10px] font-bold uppercase text-gray-400 tracking-wider">
          Transcript
        </p>
      </div>
      <div className="flex-1 overflow-hidden p-4 space-y-3">
        {transcriptLines.map((line, i) => (
          <div key={i} className="flex gap-3 text-xs">
            <span className="text-gray-400 font-mono shrink-0 w-10 text-[10px] pt-0.5">
              {line.time}
            </span>
            <div>
              <span className="font-bold" style={{ color: line.color }}>
                {line.speaker}
              </span>
              <p className="text-gray-700 leading-relaxed">{line.text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChatPanel() {
  return (
    <div className="w-56 flex flex-col bg-gray-50 shrink-0">
      <div className="px-3 py-2 border-b border-gray-200 flex items-center justify-between">
        <span className="text-xs font-bold text-gray-800">Chat with Meeting</span>
        <span className="text-gray-400 text-[10px]">AI</span>
      </div>
      <div className="flex-1 overflow-hidden p-2 space-y-2">
        {chatMessages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] px-2.5 py-1.5 rounded-xl text-[10px] leading-relaxed ${
                msg.role === "user"
                  ? "bg-gradient-to-r from-[#C084FC] to-[#A855F7] text-white"
                  : "bg-white text-gray-700 border border-gray-200"
              }`}
            >
              {msg.text.split("\n").map((line, j) => (
                <p key={j} className={j > 0 ? "mt-1" : ""}>
                  {line}
                </p>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="p-2 border-t border-gray-200">
        <div className="flex gap-1">
          <div className="flex-1 bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-[10px] text-gray-400">
            Ask about this meeting...
          </div>
          <div className="bg-gradient-to-r from-[#C084FC] to-[#A855F7] text-white rounded-lg px-2 py-1.5 text-[10px] font-semibold">
            Send
          </div>
        </div>
      </div>
    </div>
  );
}

export function AppMockup() {
  return (
    <section className="py-24 px-6 bg-white">
      <div className="max-w-6xl mx-auto">
        <motion.h2
          className="text-4xl md:text-5xl font-bold text-center mb-4"
          style={{ color: "var(--color-text)" }}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          See it in action
        </motion.h2>
        <motion.p
          className="text-xl text-gray-500 text-center mb-12 max-w-2xl mx-auto"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          Real-time transcription with speaker labels. Then chat with AI about everything that was discussed.
        </motion.p>

        <motion.div
          className="relative mx-auto max-w-5xl"
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          {/* Window chrome */}
          <div className="rounded-2xl overflow-hidden shadow-2xl border border-gray-200">
            {/* Title bar */}
            <div className="bg-gray-100 px-4 py-2.5 flex items-center gap-2 border-b border-gray-200">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-[#FF5F57]" />
                <div className="w-3 h-3 rounded-full bg-[#FEBC2E]" />
                <div className="w-3 h-3 rounded-full bg-[#28C840]" />
              </div>
              <div className="flex-1 text-center">
                <span className="text-xs text-gray-500">Sprint Planning — Feb 25, 2026</span>
              </div>
            </div>

            {/* App content */}
            <div className="flex h-[420px] bg-white">
              <Sidebar />
              <div className="flex-1 flex flex-col min-w-0">
                {/* Meeting header */}
                <div className="px-4 py-2 border-b border-gray-200 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-gray-800">Sprint Planning</h3>
                    <p className="text-[10px] text-gray-400">Feb 25, 2026 &middot; 47 min &middot; 3 participants</p>
                  </div>
                  <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                    Completed
                  </span>
                </div>
                {/* Two-pane content */}
                <div className="flex flex-1 min-h-0">
                  <TranscriptPanel />
                  <ChatPanel />
                </div>
              </div>
            </div>
          </div>

          {/* Glow effect behind the mockup */}
          <div
            className="absolute -inset-4 -z-10 rounded-3xl opacity-30 blur-3xl"
            style={{
              background:
                "linear-gradient(135deg, #4EEABB, #C084FC, #E879A8)",
            }}
          />
        </motion.div>
      </div>
    </section>
  );
}
