import { useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Sidebar } from "@/components/Sidebar";
import { Onboarding } from "@/components/Onboarding";
import { MeetingLibrary } from "@/pages/MeetingLibrary";
import { RecordingView } from "@/pages/RecordingView";
import { MeetingDetail } from "@/pages/MeetingDetail";
import { PromptsPage } from "@/pages/Prompts";
import { TemplatesPage } from "@/pages/Templates";
import { SettingsPage } from "@/pages/Settings";

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar />
      <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}

function App() {
  const [onboarded, setOnboarded] = useState(
    () => localStorage.getItem("onboarding_complete") === "true"
  );

  if (!onboarded) {
    return <Onboarding onComplete={() => setOnboarded(true)} />;
  }

  return (
    <div className="dark">
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
            path="/prompts"
            element={
              <Layout>
                <PromptsPage />
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
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
