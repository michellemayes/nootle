import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { ThemeProvider } from "@/hooks/useTheme";
import { LLMSelectionProvider } from "@/contexts/LLMSelectionContext";
import { Sidebar } from "@/components/Sidebar";
import { MeetingLibrary } from "@/pages/MeetingLibrary";
import { GlobalChatPanel } from "@/components/GlobalChatPanel";
import { useOpenRecordingEvent } from "@/hooks/useOpenRecordingEvent";
import { CompactModeProvider } from "@/contexts/CompactModeContext";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";
import { CommandPalette } from "@/components/CommandPalette";
import { RecordingCelebration } from "@/components/RecordingCelebration";
import { UpdateBanner } from "@/components/UpdateBanner";

// The library is the first screen, so it ships in the main bundle. Every
// other page loads on demand and is prefetched once the app is idle, so
// startup stays light without making the first visit to a page wait.
const pageLoaders = {
  recording: () => import("@/pages/RecordingView").then((m) => ({ default: m.RecordingView })),
  meeting: () => import("@/pages/MeetingDetail").then((m) => ({ default: m.MeetingDetail })),
  insights: () => import("@/pages/InsightsDashboard").then((m) => ({ default: m.InsightsDashboard })),
  chat: () => import("@/pages/ChatPage").then((m) => ({ default: m.ChatPage })),
  templates: () => import("@/pages/Templates").then((m) => ({ default: m.TemplatesPage })),
  settings: () => import("@/pages/Settings").then((m) => ({ default: m.SettingsPage })),
  help: () => import("@/pages/Help").then((m) => ({ default: m.HelpPage })),
};
const RecordingView = lazy(pageLoaders.recording);
const MeetingDetail = lazy(pageLoaders.meeting);
const InsightsDashboard = lazy(pageLoaders.insights);
const ChatPage = lazy(pageLoaders.chat);
const TemplatesPage = lazy(pageLoaders.templates);
const SettingsPage = lazy(pageLoaders.settings);
const HelpPage = lazy(pageLoaders.help);
const Onboarding = lazy(() =>
  import("@/components/Onboarding").then((m) => ({ default: m.Onboarding })),
);

function usePrefetchPages() {
  useEffect(() => {
    const prefetch = () => Object.values(pageLoaders).forEach((load) => load());
    if ("requestIdleCallback" in window) {
      const handle = window.requestIdleCallback(prefetch, { timeout: 2000 });
      return () => window.cancelIdleCallback(handle);
    }
    const timer = setTimeout(prefetch, 500);
    return () => clearTimeout(timer);
  }, []);
}

// One shared layout route, so the sidebar, chat panel and palette stay
// mounted across navigation instead of remounting (and refetching) per page.
function Layout() {
  useOpenRecordingEvent();
  useGlobalShortcuts();
  usePrefetchPages();

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar />
      <main className="relative flex flex-1 flex-col overflow-hidden pt-8">
        <div data-tauri-drag-region className="absolute inset-x-0 top-0 z-10 h-8" />
        <Suspense fallback={null}>
          <Outlet />
        </Suspense>
      </main>
      <GlobalChatPanel />
      <CommandPalette />
      <RecordingCelebration />
      <UpdateBanner />
    </div>
  );
}

function App() {
  const [onboarded, setOnboarded] = useState(
    () => localStorage.getItem("onboarding_complete") === "true"
  );

  if (!onboarded) {
    return (
      <ThemeProvider>
        <Suspense fallback={null}>
          <Onboarding onComplete={() => setOnboarded(true)} />
        </Suspense>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <CompactModeProvider>
      <LLMSelectionProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<MeetingLibrary />} />
            <Route path="/insights" element={<InsightsDashboard />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/recording" element={<RecordingView />} />
            <Route path="/meeting/:id" element={<MeetingDetail />} />
            <Route path="/templates" element={<TemplatesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/help" element={<HelpPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
      </LLMSelectionProvider>
      </CompactModeProvider>
    </ThemeProvider>
  );
}

export default App;
