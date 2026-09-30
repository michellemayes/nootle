import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import { CopyButton } from "@/components/CopyButton";

const DEFAULT_EXE_PATH = "/Applications/Nootle.app/Contents/MacOS/nootle";

function CodeSnippet({ code }: { code: string }) {
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg bg-muted p-4 font-mono text-xs">
        {code}
      </pre>
      <CopyButton variant="button" text={code} className="absolute top-2 right-2" />
    </div>
  );
}

/**
 * MCP client config and the Claude Code install command, filled in with this
 * install's executable path. Shown in Settings → About and Help → MCP server.
 */
export function McpSetup() {
  const [exePath, setExePath] = useState(DEFAULT_EXE_PATH);

  useEffect(() => {
    invoke<string | null>("get_exe_path")
      .then((path) => path && setExePath(path))
      .catch(() => {});
  }, []);

  const mcpConfig = `{
  "mcpServers": {
    "nootle": {
      "command": "${exePath}",
      "args": ["--mcp"]
    }
  }
}`;
  const claudeCommand = `claude mcp add nootle -- ${exePath} --mcp`;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="text-sm font-medium">MCP client config</h3>
        <p className="text-xs text-muted-foreground">
          Add this to your MCP client's configuration to use Nootle as an MCP server.
        </p>
        <CodeSnippet code={mcpConfig} />
      </div>
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Claude Code</h3>
        <p className="text-xs text-muted-foreground">Or add it with one command:</p>
        <CodeSnippet code={claudeCommand} />
      </div>
    </div>
  );
}
