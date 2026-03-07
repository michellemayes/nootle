import { useState, useCallback } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Markdown } from "@/components/Markdown";

import gettingStartedMd from "@/help/getting-started.md?raw";
import mcpServerMd from "@/help/mcp-server.md?raw";
import llmProvidersMd from "@/help/llm-providers.md?raw";
import troubleshootingMd from "@/help/troubleshooting.md?raw";
import cliToolMd from "@/help/cli-tool.md?raw";

const MCP_CONFIG = `{
  "mcpServers": {
    "nootle": {
      "command": "/Applications/Nootle.app/Contents/MacOS/nootle",
      "args": ["--mcp"]
    }
  }
}`;

function McpQuickStart() {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(MCP_CONFIG);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Quick Start — MCP Config</CardTitle>
        <CardDescription>
          Add this to your Claude Code config to connect Nootle:
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <pre className="rounded-lg bg-muted p-4 text-xs font-mono overflow-x-auto">
            {MCP_CONFIG}
          </pre>
          <Button
            variant="secondary"
            size="sm"
            className="absolute top-2 right-2 text-xs"
            onClick={handleCopy}
          >
            {copied ? "Copied!" : "Copy"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

const tabs = [
  { value: "getting-started", label: "Getting Started", content: gettingStartedMd, description: "Learn the basics of using Nootle" },
  { value: "mcp-server", label: "MCP Server", content: mcpServerMd, quickStart: true, description: "Connect Nootle to Claude Code and other MCP clients" },
  { value: "cli-tool", label: "CLI Tool", content: cliToolMd, description: "Query meeting data from the terminal" },
  { value: "llm-providers", label: "LLM Providers", content: llmProvidersMd, description: "Configure AI providers for transcription and summaries" },
  { value: "troubleshooting", label: "Troubleshooting", content: troubleshootingMd, description: "Common issues and how to fix them" },
] as const;

export function HelpPage() {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b px-6 py-4">
        <h1 className="text-2xl font-bold tracking-tight">Help</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Learn how to use Nootle and get the most out of your meetings
        </p>
      </div>

      <Tabs defaultValue="getting-started" className="flex flex-1 flex-col overflow-hidden">
        <div className="border-b px-6">
          <TabsList className="h-10">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {tabs.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="flex-1 mt-0 overflow-auto">
            <div className="flex flex-col gap-6 px-6 py-4 max-w-3xl">
              {"quickStart" in tab && tab.quickStart && <McpQuickStart />}
              <Card>
                <CardContent className="pt-6">
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <Markdown content={tab.content} />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
