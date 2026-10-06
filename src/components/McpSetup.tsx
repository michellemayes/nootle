import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import { CopyButton } from "@/components/CopyButton";

interface McpCommand {
  command: string;
  args: string[];
}

const DEFAULT_COMMAND: McpCommand = {
  command: "/Applications/Nootle.app/Contents/MacOS/nootle-cli",
  args: ["mcp"],
};

// The command can't change while the app runs, so fetch it once.
let commandPromise: Promise<McpCommand | null> | undefined;

function CodeSnippet({ code }: { code: string }) {
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg border bg-muted/50 p-4 pr-24 font-mono text-xs">
        {code}
      </pre>
      <CopyButton variant="button" text={code} className="absolute top-2 right-2 bg-background/80 backdrop-blur" />
    </div>
  );
}

/**
 * MCP client config and the Claude Code install command, filled in with this
 * install's paths. Shown in Settings → About and Help → MCP server.
 */
export function McpSetup() {
  const [mcp, setMcp] = useState(DEFAULT_COMMAND);

  useEffect(() => {
    commandPromise ??= invoke<McpCommand>("get_mcp_command").catch(() => null);
    commandPromise.then((cmd) => cmd && setMcp(cmd));
  }, []);

  const mcpConfig = JSON.stringify(
    { mcpServers: { nootle: { command: mcp.command, args: mcp.args } } },
    null,
    2,
  );
  const claudeCommand = `claude mcp add --scope user nootle -- "${mcp.command}" ${mcp.args.join(" ")}`;

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
