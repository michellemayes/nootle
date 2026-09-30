import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Markdown } from "@/components/Markdown";
import { PageHeader } from "@/components/PageHeader";
import { McpSetup } from "@/components/McpSetup";

import gettingStartedMd from "@/help/getting-started.md?raw";
import mcpServerMd from "@/help/mcp-server.md?raw";
import llmProvidersMd from "@/help/llm-providers.md?raw";
import troubleshootingMd from "@/help/troubleshooting.md?raw";
import cliToolMd from "@/help/cli-tool.md?raw";

function McpQuickStart() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick start</CardTitle>
        <CardDescription>
          Connect Nootle to Claude Code or any other MCP client.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <McpSetup />
      </CardContent>
    </Card>
  );
}

const tabs = [
  { value: "getting-started", label: "Getting started", content: gettingStartedMd },
  { value: "mcp-server", label: "MCP server", content: mcpServerMd, quickStart: true },
  { value: "cli-tool", label: "CLI tool", content: cliToolMd },
  { value: "llm-providers", label: "LLM providers", content: llmProvidersMd },
  { value: "troubleshooting", label: "Troubleshooting", content: troubleshootingMd },
] as const;

export function HelpPage() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        title="Help"
        description="Setup guides, integrations, and troubleshooting"
      />

      <Tabs defaultValue="getting-started" className="flex flex-1 flex-col overflow-hidden">
        <div className="shrink-0 border-b px-6 py-4">
          <TabsList className="h-10">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {tabs.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="mt-0 flex-1 overflow-auto">
            <div className="flex max-w-3xl flex-col gap-6 p-6">
              {"quickStart" in tab && tab.quickStart && <McpQuickStart />}
              <Card>
                <CardContent>
                  <Markdown content={tab.content} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
