import { useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/hooks/useTheme";
import { LLMSelectionProvider } from "@/contexts/LLMSelectionContext";
import { Sidebar } from "@/components/Sidebar";
import { Onboarding } from "@/components/Onboarding";
import { MeetingLibrary } from "@/pages/MeetingLibrary";
import { RecordingView } from "@/pages/RecordingView";
import { MeetingDetail } from "@/pages/MeetingDetail";
import { TemplatesPage } from "@/pages/Templates";

import { SettingsPage } from "@/pages/Settings";
import { HelpPage } from "@/pages/Help";
import { GlobalChatPanel } from "@/components/GlobalChatPanel";
import { InsightsDashboard } from "@/pages/InsightsDashboard";
import { ChatPage } from "@/pages/ChatPage";
import { useMeetingDetection } from "@/hooks/useMeetingDetection";

function Layout({ children }: { children: React.ReactNode }) {
  useMeetingDetection();

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar />
      <main className="flex flex-1 flex-col overflow-hidden pt-8">{children}</main>
      <GlobalChatPanel />
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
        <Onboarding onComplete={() => setOnboarded(true)} />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <LLMSelectionProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={
              <Layout>
                <MeetingLibrary />
              </Layout>
            }
          />
          <Route
            path="/insights"
            element={
              <Layout>
                <InsightsDashboard />
              </Layout>
            }
          />
          <Route
            path="/chat"
            element={
              <Layout>
                <ChatPage />
              </Layout>
            }
          />
          <Route
            path="/recording"
            element={
              <Layout>
                <RecordingView />
              </Layout>
            }
          />
          <Route
            path="/meeting/:id"
            element={
              <Layout>
                <MeetingDetail />
              </Layout>
            }
          />
          <Route
            path="/templates"
            element={
              <Layout>
                <TemplatesPage />
              </Layout>
            }
          />
<Route
            path="/settings"
            element={
              <Layout>
                <SettingsPage />
              </Layout>
            }
          />
          <Route
            path="/help"
            element={
              <Layout>
                <HelpPage />
              </Layout>
            }
          />
        </Routes>
      </BrowserRouter>
      </LLMSelectionProvider>
    </ThemeProvider>
  );
}

export default App;
