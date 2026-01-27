import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/mcp')({
  component: McpPage,
});

const endpointUrl = 'https://api.slotwatch.dev/mcp';

function McpPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="border border-border bg-card">
        <div className="border-b border-border px-4 py-3 bg-muted/30">
          <h2 className="font-mono text-sm font-medium">mcp server</h2>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            The Slot Watch MCP server provides a remote interface for querying
            chain activity and signer data from MCP-compatible tools.
          </p>
          <div className="border border-border">
            <div className="flex justify-between gap-4 text-xs py-1.5 px-3 border-b border-border/50">
              <span className="text-muted-foreground">endpoint</span>
              <span className="font-mono text-right break-all">
                {endpointUrl}
              </span>
            </div>
            <div className="flex justify-between gap-4 text-xs py-1.5 px-3">
              <span className="text-muted-foreground">transport</span>
              <span className="font-mono text-right">http (streamable)</span>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Use the streamable HTTP endpoint where supported, or connect through
            <a
              className="ml-1 text-primary hover:underline"
              href="https://github.com/geelen/mcp-remote"
              rel="noreferrer"
              target="_blank"
            >
              mcp-remote{' '}
            </a>
            for clients that do not support remote HTTP MCP servers.
          </p>
        </div>
      </div>

      <div className="border border-border bg-card">
        <div className="border-b border-border px-4 py-3 bg-muted/30">
          <h2 className="font-mono text-sm font-medium">setup instructions</h2>
        </div>
        <div className="p-4 space-y-6">
          <section className="space-y-2">
            <div className="text-xs font-mono uppercase text-muted-foreground">
              general
            </div>
            <p className="text-sm text-muted-foreground">
              Configure your client to use the Slot Watch remote MCP endpoint.
            </p>
            <div className="border border-border bg-muted/10 px-3 py-2 text-xs font-mono">
              {endpointUrl}
            </div>
          </section>

          <section className="space-y-2">
            <div className="text-xs font-mono uppercase text-muted-foreground">
              opencode
            </div>
            <p className="text-sm text-muted-foreground">
              Update your opencode.json config with a remote MCP entry.
            </p>
            <pre className="border border-border bg-muted/10 p-3 text-xs font-mono overflow-auto">
              {`{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "slotwatch": {
      "type": "remote",
      "url": "https://api.slotwatch.dev/mcp",
      "enabled": true
    }
  }
}`}
            </pre>
          </section>

          <section className="space-y-2">
            <div className="text-xs font-mono uppercase text-muted-foreground">
              claude
            </div>
            <div className="text-sm text-muted-foreground space-y-2">
              <p>Team, Enterprise (Claude.ai)</p>
              <ol className="list-decimal pl-4 space-y-1">
                <li>Open settings and choose integrations.</li>
                <li>Add an integration named slot watch.</li>
                <li>Set the URL to {endpointUrl}.</li>
                <li>Enable the tools in your chat.</li>
              </ol>
              <p>Free, Pro (Claude desktop)</p>
              <p>
                Edit{' '}
                <span className="font-mono">
                  ~/Library/Application
                  Support/Claude/claude_desktop_config.json
                </span>{' '}
                and add:
              </p>
              <pre className="border border-border bg-muted/10 p-3 text-xs font-mono overflow-auto">
                {`{
  "mcpServers": {
    "slotwatch": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://api.slotwatch.dev/mcp"]
    }
  }
}`}
              </pre>
              <p>Claude Code</p>
              <pre className="border border-border bg-muted/10 p-3 text-xs font-mono overflow-auto">
                {
                  'claude mcp add --transport http slotwatch https://api.slotwatch.dev/mcp'
                }
              </pre>
            </div>
          </section>

          <section className="space-y-2">
            <div className="text-xs font-mono uppercase text-muted-foreground">
              codex
            </div>
            <p className="text-sm text-muted-foreground">Configure via CLI:</p>
            <pre className="border border-border bg-muted/10 p-3 text-xs font-mono overflow-auto">
              {'codex mcp add slotwatch --url https://api.slotwatch.dev/mcp'}
            </pre>
            <p className="text-sm text-muted-foreground">
              If this is your first MCP in Codex, enable the rmcp client in{' '}
              <span className="font-mono">~/.codex/config.toml</span>:
            </p>
            <pre className="border border-border bg-muted/10 p-3 text-xs font-mono overflow-auto">
              {`[features]
experimental_use_rmcp_client = true`}
            </pre>
            <p className="text-sm text-muted-foreground">
              You can also configure the MCP server in{' '}
              <span className="font-mono">~/.codex/config.toml</span>:
            </p>
            <pre className="border border-border bg-muted/10 p-3 text-xs font-mono overflow-auto">
              {`[features]
experimental_use_rmcp_client = true

[mcp_servers.slotwatch]
url = "https://api.slotwatch.dev/mcp"`}
            </pre>
          </section>

          <section className="space-y-2">
            <div className="text-xs font-mono uppercase text-muted-foreground">
              cursor
            </div>
            <p className="text-sm text-muted-foreground">
              Add a custom MCP server in Cursor with the endpoint URL.
            </p>
            <pre className="border border-border bg-muted/10 p-3 text-xs font-mono overflow-auto">
              {'https://api.slotwatch.dev/mcp'}
            </pre>
          </section>

          <section className="space-y-2">
            <div className="text-xs font-mono uppercase text-muted-foreground">
              visual studio code
            </div>
            <p className="text-sm text-muted-foreground">
              Add an MCP server with the following configuration:
            </p>
            <pre className="border border-border bg-muted/10 p-3 text-xs font-mono overflow-auto">
              {`{
  "mcpServers": {
    "slotwatch": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://api.slotwatch.dev/mcp"]
    }
  }
}`}
            </pre>
          </section>

          <section className="space-y-2">
            <div className="text-xs font-mono uppercase text-muted-foreground">
              windsurf
            </div>
            <p className="text-sm text-muted-foreground">
              Add a custom MCP server in settings:
            </p>
            <pre className="border border-border bg-muted/10 p-3 text-xs font-mono overflow-auto">
              {`{
  "mcpServers": {
    "slotwatch": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://api.slotwatch.dev/mcp"]
    }
  }
}`}
            </pre>
          </section>

          <section className="space-y-2">
            <div className="text-xs font-mono uppercase text-muted-foreground">
              zed
            </div>
            <p className="text-sm text-muted-foreground">
              Add a context server in settings:
            </p>
            <pre className="border border-border bg-muted/10 p-3 text-xs font-mono overflow-auto">
              {`{
  "context_servers": {
    "slotwatch": {
      "source": "custom",
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://api.slotwatch.dev/mcp"],
      "env": {}
    }
  }
}`}
            </pre>
          </section>

          <section className="space-y-2">
            <div className="text-xs font-mono uppercase text-muted-foreground">
              others
            </div>
            <p className="text-sm text-muted-foreground">
              Use these settings for any MCP client that supports stdio:
            </p>
            <div className="border border-border">
              <div className="flex justify-between gap-4 text-xs py-1.5 px-3 border-b border-border/50">
                <span className="text-muted-foreground">command</span>
                <span className="font-mono text-right">npx</span>
              </div>
              <div className="flex justify-between gap-4 text-xs py-1.5 px-3 border-b border-border/50">
                <span className="text-muted-foreground">arguments</span>
                <span className="font-mono text-right break-all">
                  -y mcp-remote https://api.slotwatch.dev/mcp
                </span>
              </div>
              <div className="flex justify-between gap-4 text-xs py-1.5 px-3">
                <span className="text-muted-foreground">environment</span>
                <span className="font-mono text-right">none</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
