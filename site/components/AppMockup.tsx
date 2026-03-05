"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// --- Data ---

const meetings = [
  {
    id: "1",
    title: "Sprint Planning",
    date: "Feb 25, 2026",
    duration: "47m",
    status: "Done" as const,
  },
  {
    id: "2",
    title: "Design Review: Onboarding Flow",
    date: "Feb 24, 2026",
    duration: "32m",
    status: "Done" as const,
  },
  {
    id: "3",
    title: "1:1 with Alex",
    date: "Feb 24, 2026",
    duration: "28m",
    status: "Done" as const,
  },
  {
    id: "4",
    title: "Q1 Roadmap Sync",
    date: "Feb 21, 2026",
    duration: "1h 12m",
    status: "Archived" as const,
  },
];

const transcriptLines = [
  { time: "00:42", speaker: "Sarah", color: "text-blue-500", text: "I think we should prioritize the onboarding flow this sprint." },
  { time: "01:15", speaker: "James", color: "text-green-500", text: "Agreed. The drop-off rate on step three is way too high." },
  { time: "01:38", speaker: "Sarah", color: "text-blue-500", text: "Exactly. I've got some wireframes we can look at after this." },
  { time: "02:04", speaker: "Priya", color: "text-amber-500", text: "Can we also revisit the notification settings? Users keep asking about that." },
  { time: "02:31", speaker: "James", color: "text-green-500", text: "Good call. Let's timebox that for 30 minutes after the onboarding discussion." },
  { time: "03:12", speaker: "Sarah", color: "text-blue-500", text: "Sounds good. I'll share my screen now." },
];

const summaryContent = `## Meeting Summary

**Sprint Planning** covered three main topics:

- **Onboarding flow** — The team agreed to prioritize the onboarding redesign this sprint. Sarah has wireframes ready to share. The drop-off rate at step 3 is the primary concern.

- **Notification settings** — Priya flagged ongoing user requests for more granular notification controls. The team will timebox a 30-minute discussion.

- **Timeline** — Sprint ends March 8. Design review scheduled for Wednesday.`;

const insightsData = {
  decisions: [
    { text: "Prioritize onboarding flow redesign this sprint", time: "00:42" },
    { text: "Timebox notification settings discussion to 30 minutes", time: "02:31" },
  ],
  actionItems: [
    { text: "Share onboarding wireframes with team", assignee: "Sarah", done: false },
    { text: "Analyze step 3 drop-off data", assignee: "James", done: true },
    { text: "Draft notification settings proposal", assignee: "Priya", done: false },
  ],
  keyMoments: [
    { text: "Team aligned on sprint priorities", time: "01:15" },
    { text: "Priya surfaced recurring user feedback on notifications", time: "02:04" },
  ],
};

const analyticsData = {
  duration: "47 min",
  speakers: 3,
  words: 2847,
  speakerBreakdown: [
    { name: "Sarah", pct: 42, color: "bg-blue-400" },
    { name: "James", pct: 35, color: "bg-green-400" },
    { name: "Priya", pct: 23, color: "bg-amber-400" },
  ],
};

const notesContent = `# Sprint Planning Notes

## Priorities
- Onboarding flow redesign is the top priority
- Step 3 drop-off rate needs immediate attention
- Sarah has wireframes ready for review

## Notifications
- Users requesting more granular controls
- Priya to lead the discussion
- Timeboxed to 30 minutes

## Timeline
- Sprint ends March 8
- Design review Wednesday
- Demo Friday afternoon`;

// --- Icons (inline SVGs matching Lucide style) ---

function MicIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function LightbulbIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6" /><path d="M10 22h4" />
    </svg>
  );
}

function MessageIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
    </svg>
  );
}

function SparklesIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
    </svg>
  );
}

function SettingsIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function HelpIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function CircleIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}

function ArrowLeftIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
    </svg>
  );
}

function PanelLeftIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
    </svg>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function ListChecksIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 17 2 2 4-4" /><path d="m3 7 2 2 4-4" />
      <path d="M13 6h8" /><path d="M13 12h8" /><path d="M13 18h8" />
    </svg>
  );
}

function StarIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function SearchIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function MoonIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

function BarChartIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" x2="12" y1="20" y2="10" />
      <line x1="18" x2="18" y1="20" y2="4" />
      <line x1="6" x2="6" y1="20" y2="14" />
    </svg>
  );
}

// --- Sub-components ---

const navItems = [
  { icon: MicIcon, label: "Meetings", active: true },
  { icon: LightbulbIcon, label: "Insights", active: false },
  { icon: MessageIcon, label: "Chat", active: false },
  { icon: SparklesIcon, label: "Prompts", active: false },
  { icon: SettingsIcon, label: "Settings", active: false },
  { icon: HelpIcon, label: "Help", active: false },
];

function Sidebar() {
  return (
    <div className="w-44 flex flex-col border-r border-gray-200 bg-white shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2 px-3 pt-4 pb-3">
        <div className="w-6 h-6 rounded-md bg-gradient-to-br from-[#4EEABB] to-[#C084FC] flex items-center justify-center text-white text-[10px] font-bold">
          N
        </div>
        <span className="text-sm font-semibold tracking-tight text-gray-900">Nootle</span>
      </div>

      {/* Record button */}
      <div className="px-2 pb-2">
        <button className="w-full flex items-center gap-1.5 bg-gray-900 text-white text-[11px] font-medium py-1.5 px-2.5 rounded-md text-left">
          <CircleIcon className="w-3 h-3" />
          Record Something
        </button>
      </div>

      <div className="border-t border-gray-200 mx-2" />

      {/* Navigation */}
      <nav className="flex flex-col gap-0.5 px-2 pt-2 text-[11px]">
        {navItems.map((item) => (
          <div
            key={item.label}
            className={`flex items-center gap-2 px-2 py-1.5 rounded-md ${
              item.active
                ? "bg-gray-100 text-gray-900 font-medium"
                : "text-gray-500 hover:bg-gray-50"
            }`}
          >
            <item.icon className="w-3.5 h-3.5" />
            <span>{item.label}</span>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="mt-auto flex items-center justify-between px-3 py-3">
        <span className="text-[9px] text-gray-400">Nootle v0.1.0</span>
        <MoonIcon className="w-3 h-3 text-gray-400" />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Done: "bg-gray-100 text-gray-600",
    Archived: "bg-gray-100 text-gray-400",
    Recording: "bg-red-100 text-red-600",
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${styles[status] ?? styles.Done}`}>
      {status}
    </span>
  );
}

function LibraryView({ onSelectMeeting }: { onSelectMeeting: (id: string) => void }) {
  return (
    <div className="flex-1 flex flex-col min-w-0 p-4 overflow-hidden">
      {/* Header */}
      <div className="mb-3">
        <h2 className="text-sm font-bold text-gray-900">Meetings</h2>
        <p className="text-[10px] text-gray-400">Your recorded meetings and transcriptions</p>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
        <div className="w-full border border-gray-200 rounded-md pl-7 pr-2 py-1.5 text-[10px] text-gray-400">
          Search meetings...
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 gap-2 overflow-hidden">
        {meetings.map((m) => (
          <button
            key={m.id}
            onClick={() => onSelectMeeting(m.id)}
            className="text-left border border-gray-200 rounded-lg p-3 hover:bg-gray-50 hover:shadow-sm transition-all cursor-pointer group"
          >
            <div className="flex items-start justify-between gap-1 mb-1.5">
              <h3 className="text-[11px] font-medium text-gray-900 leading-snug line-clamp-2 group-hover:text-gray-700">
                {m.title}
              </h3>
              <StatusBadge status={m.status} />
            </div>
            <div className="flex items-center gap-1.5 text-[9px] text-gray-400">
              <span>{m.date}</span>
              <span>&middot;</span>
              <span>{m.duration}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

type TabId = "notes" | "summaries" | "insights" | "analytics";

function DetailView({
  onBack,
  activeTab,
  onTabChange,
  transcriptVisible,
  onToggleTranscript,
}: {
  onBack: () => void;
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  transcriptVisible: boolean;
  onToggleTranscript: () => void;
}) {
  const tabs: { id: TabId; label: string }[] = [
    { id: "notes", label: "Notes" },
    { id: "summaries", label: "Summaries" },
    { id: "insights", label: "Insights" },
    { id: "analytics", label: "Analytics" },
  ];

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-2">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeftIcon className="w-3 h-3" />
            <span>Back</span>
          </button>
          <div className="ml-1">
            <h3 className="text-xs font-bold text-gray-900">Sprint Planning</h3>
            <p className="text-[9px] text-gray-400">Feb 25, 2026</p>
          </div>
          <StatusBadge status="Done" />
        </div>
        <button className="flex items-center gap-1 text-[10px] border border-gray-200 rounded-md px-2 py-1 text-gray-600 hover:bg-gray-50 transition-colors">
          <MessageIcon className="w-3 h-3" />
          Ask Nootle
        </button>
      </div>

      {/* Two-column layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Transcript column */}
        <AnimatePresence>
          {transcriptVisible && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: "50%", opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col border-r border-gray-200 overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 border-b border-gray-200 h-8">
                <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Transcript
                </h4>
              </div>
              <div className="flex-1 overflow-hidden px-4 py-2 space-y-2">
                {transcriptLines.map((line, i) => (
                  <div key={i} className="flex gap-2 text-[10px]">
                    <span className="text-gray-400 font-mono shrink-0 w-8 pt-0.5 text-[9px]">
                      {line.time}
                    </span>
                    <p className="min-w-0 text-gray-700 leading-relaxed">
                      <span className={`font-semibold ${line.color} mr-1`}>
                        {line.speaker}:
                      </span>
                      {line.text}
                    </p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Right column - tabs */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* Tab bar */}
          <div className="flex items-center gap-1 px-2 border-b border-gray-200 h-8">
            <button
              onClick={onToggleTranscript}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
              title={transcriptVisible ? "Hide transcript" : "Show transcript"}
            >
              <PanelLeftIcon className="w-3 h-3" />
            </button>
            <div className="flex bg-gray-100 rounded-md p-0.5">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                    activeTab === tab.id
                      ? "bg-white text-gray-900 font-medium shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="h-full overflow-auto"
              >
                {activeTab === "notes" && <NotesTab />}
                {activeTab === "summaries" && <SummariesTab />}
                {activeTab === "insights" && <InsightsTab />}
                {activeTab === "analytics" && <AnalyticsTab />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

function NotesTab() {
  return (
    <div className="p-4 text-[10px] text-gray-700 leading-relaxed space-y-2">
      {notesContent.split("\n").map((line, i) => {
        if (line.startsWith("# ")) {
          return <h3 key={i} className="text-xs font-bold text-gray-900">{line.slice(2)}</h3>;
        }
        if (line.startsWith("## ")) {
          return <h4 key={i} className="text-[11px] font-semibold text-gray-800 mt-3">{line.slice(3)}</h4>;
        }
        if (line.startsWith("- ")) {
          return (
            <div key={i} className="flex gap-1.5 pl-2">
              <span className="text-gray-400 shrink-0">&bull;</span>
              <span>{line.slice(2)}</span>
            </div>
          );
        }
        if (line.trim() === "") return <div key={i} className="h-1" />;
        return <p key={i}>{line}</p>;
      })}
    </div>
  );
}

function SummariesTab() {
  return (
    <div className="p-4">
      <div className="border border-gray-200 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-medium text-gray-500">Generated Summary</span>
          <span className="text-[9px] text-gray-400">via Anthropic / Claude</span>
        </div>
        <div className="text-[10px] text-gray-700 leading-relaxed space-y-2">
          {summaryContent.split("\n").map((line, i) => {
            if (line.startsWith("## ")) {
              return <h4 key={i} className="text-[11px] font-bold text-gray-900">{line.slice(3)}</h4>;
            }
            if (line.startsWith("- **")) {
              const match = line.match(/^- \*\*(.+?)\*\* — (.+)$/);
              if (match) {
                return (
                  <div key={i} className="flex gap-1.5 pl-2">
                    <span className="text-gray-400 shrink-0">&bull;</span>
                    <span><strong className="font-semibold text-gray-800">{match[1]}</strong> &mdash; {match[2]}</span>
                  </div>
                );
              }
            }
            if (line.startsWith("**") && line.endsWith("**")) {
              return <p key={i} className="font-semibold text-gray-800">{line.slice(2, -2)}</p>;
            }
            if (line.trim() === "") return <div key={i} className="h-1" />;
            return <p key={i}>{line}</p>;
          })}
        </div>
      </div>
    </div>
  );
}

function InsightsTab() {
  return (
    <div className="p-4 space-y-4">
      {/* Decisions */}
      <InsightSection
        title="Key Decisions"
        icon={<LightbulbIcon className="w-3 h-3 text-gray-400" />}
        count={insightsData.decisions.length}
      >
        {insightsData.decisions.map((d, i) => (
          <div key={i} className="border border-gray-200 rounded-md p-2 text-[10px]">
            <p className="text-gray-700">{d.text}</p>
            <span className="text-[9px] font-mono text-gray-400">{d.time}</span>
          </div>
        ))}
      </InsightSection>

      {/* Action Items */}
      <InsightSection
        title="Action Items"
        icon={<ListChecksIcon className="w-3 h-3 text-gray-400" />}
        count={insightsData.actionItems.length}
      >
        {insightsData.actionItems.map((item, i) => (
          <div key={i} className="flex items-start gap-2 border border-gray-200 rounded-md p-2 text-[10px]">
            <div className={`mt-0.5 flex h-3 w-3 shrink-0 items-center justify-center rounded border ${
              item.done
                ? "border-gray-900 bg-gray-900 text-white"
                : "border-gray-300"
            }`}>
              {item.done && <CheckIcon className="w-2 h-2" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-gray-700 ${item.done ? "line-through text-gray-400" : ""}`}>
                {item.text}
              </p>
              <span className="text-[9px] text-gray-400">{item.assignee}</span>
            </div>
          </div>
        ))}
      </InsightSection>

      {/* Key Moments */}
      <InsightSection
        title="Key Moments"
        icon={<StarIcon className="w-3 h-3 text-gray-400" />}
        count={insightsData.keyMoments.length}
      >
        {insightsData.keyMoments.map((m, i) => (
          <div key={i} className="border border-gray-200 rounded-md p-2 text-[10px]">
            <p className="text-gray-700">{m.text}</p>
            <span className="text-[9px] font-mono text-gray-400">{m.time}</span>
          </div>
        ))}
      </InsightSection>
    </div>
  );
}

function InsightSection({
  title,
  icon,
  count,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[10px] font-semibold text-gray-800">{title}</span>
        <span className="text-[9px] bg-gray-100 text-gray-500 px-1 py-0.5 rounded font-medium">
          {count}
        </span>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function AnalyticsTab() {
  return (
    <div className="p-4 space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Duration", value: analyticsData.duration },
          { label: "Speakers", value: String(analyticsData.speakers) },
          { label: "Words", value: analyticsData.words.toLocaleString() },
        ].map((stat) => (
          <div key={stat.label} className="border border-gray-200 rounded-md p-2 text-center">
            <p className="text-xs font-bold text-gray-900">{stat.value}</p>
            <p className="text-[9px] text-gray-400">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Speaker breakdown */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <BarChartIcon className="w-3 h-3 text-gray-400" />
          <span className="text-[10px] font-semibold text-gray-800">Speaker Breakdown</span>
        </div>
        <div className="space-y-1.5">
          {analyticsData.speakerBreakdown.map((s) => (
            <div key={s.name} className="space-y-0.5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-gray-700">{s.name}</span>
                <span className="text-gray-400">{s.pct}%</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${s.color}`}
                  style={{ width: `${s.pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Main component ---

export function AppMockup() {
  const [currentView, setCurrentView] = useState<"library" | "detail">("library");
  const [activeTab, setActiveTab] = useState<TabId>("notes");
  const [transcriptVisible, setTranscriptVisible] = useState(true);

  const titleBarText = currentView === "library" ? "Nootle" : "Sprint Planning — Feb 25, 2026";

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
          Record meetings, get transcripts with speaker labels, then let AI surface what matters.
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
                <span className="text-xs text-gray-500">{titleBarText}</span>
              </div>
            </div>

            {/* App content */}
            <div className="flex h-[420px] bg-white select-none">
              <Sidebar />
              <AnimatePresence mode="wait">
                {currentView === "library" ? (
                  <motion.div
                    key="library"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                    className="flex-1 flex min-w-0"
                  >
                    <LibraryView onSelectMeeting={() => setCurrentView("detail")} />
                  </motion.div>
                ) : (
                  <motion.div
                    key="detail"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.2 }}
                    className="flex-1 flex min-w-0"
                  >
                    <DetailView
                      onBack={() => setCurrentView("library")}
                      activeTab={activeTab}
                      onTabChange={setActiveTab}
                      transcriptVisible={transcriptVisible}
                      onToggleTranscript={() => setTranscriptVisible((v) => !v)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Glow effect behind the mockup */}
          <div
            className="absolute -inset-4 -z-10 rounded-3xl opacity-30 blur-3xl"
            style={{
              background: "linear-gradient(135deg, #4EEABB, #C084FC, #E879A8)",
            }}
          />
        </motion.div>
      </div>
    </section>
  );
}
