import { useState, useCallback } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Markdown } from "@/components/Markdown";

import gettingStartedMd from "@/help/getting-started.md?raw";
import mcpServerMd from "@/help/mcp-server.md?raw";
import llmProvidersMd from "@/help/llm-providers.md?raw";
import troubleshootingMd from "@/help/troubleshooting.md?raw";

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
    <div className="rounded-lg border bg-card p-4 mb-6">
      <h3 className="text-sm font-medium mb-2">Quick Start — MCP Config</h3>
      <p className="text-xs text-muted-foreground mb-3">
        Add this to your Claude Code config to connect Nootle:
      </p>
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
    </div>
  );
}

const tabs = [
  { value: "getting-started", label: "Getting Started", content: gettingStartedMd },
  { value: "mcp-server", label: "MCP Server", content: mcpServerMd, quickStart: true },
  { value: "llm-providers", label: "LLM Providers", content: llmProvidersMd },
  { value: "troubleshooting", label: "Troubleshooting", content: troubleshootingMd },
] as const;

export function HelpPage() {
  return (
    <div className="flex flex-1 flex-col p-8 max-w-3xl overflow-hidden">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Help</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Learn how to use Nootle and get the most out of your meetings
        </p>
      </div>

      <Tabs defaultValue="getting-started" className="flex-1 flex flex-col overflow-hidden">
        <TabsList>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {tabs.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="overflow-hidden">
            <ScrollArea className="h-full">
              <div className="pr-4 pb-8">
                {"quickStart" in tab && tab.quickStart && <McpQuickStart />}
                <Markdown content={tab.content} />
              </div>
            </ScrollArea>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
