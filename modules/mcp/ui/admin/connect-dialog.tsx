import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'

/** This site's MCP endpoint, resolved from the browser origin at render time. */
function endpoint(): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://your-site'
  return `${origin}/api/mcp/v1/rpc`
}

function claudeConfig(url: string): string {
  return `{
  "mcpServers": {
    "driftless": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote",
        "${url}",
        "--header", "Authorization: Bearer <token>"
      ]
    }
  }
}`
}

function codexConfig(url: string): string {
  return `[mcp_servers.driftless]
command = "npx"
args = [
  "-y", "mcp-remote",
  "${url}",
  "--header", "Authorization: Bearer <token>",
]`
}

function stdioConfig(origin: string): string {
  return `{
  "mcpServers": {
    "driftless": {
      "command": "node",
      "args": ["/absolute/path/to/driftless/modules/mcp/server/dist/index.js"],
      "env": {
        "DRIFTLESS_URL": "${origin}",
        "DRIFTLESS_TOKEN": "<token>"
      }
    }
  }
}`
}

export function ConnectDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const url = endpoint()
  const origin = url.replace('/api/mcp/v1/rpc', '')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Connect an AI client</DialogTitle>
          <DialogDescription>
            Create a token below, then paste it in place of <Mono>&lt;token&gt;</Mono>. The{' '}
            <b>remote</b> options (Claude / Codex) are recommended — nothing to build, they just use{' '}
            <Mono>mcp-remote</Mono>, a tiny bridge auto-installed by <Mono>npx</Mono> that lets a
            desktop client reach this endpoint with a bearer token.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="claude" className="w-full">
          <TabsList>
            <TabsTrigger value="claude">Claude</TabsTrigger>
            <TabsTrigger value="codex">Codex</TabsTrigger>
            <TabsTrigger value="stdio">Local (optional)</TabsTrigger>
          </TabsList>

          <TabsContent value="claude" className="space-y-2">
            <Step>
              Claude Desktop → <b>Settings → Developer → Edit Config</b> (opens{' '}
              <Mono>claude_desktop_config.json</Mono>). Paste this, then restart Claude:
            </Step>
            <Snippet code={claudeConfig(url)} />
          </TabsContent>

          <TabsContent value="codex" className="space-y-2">
            <Step>
              Add this to <Mono>~/.codex/config.toml</Mono>, then restart Codex:
            </Step>
            <Snippet code={codexConfig(url)} />
          </TabsContent>

          <TabsContent value="stdio" className="space-y-2">
            <Step>
              Optional fallback — only for a locked-down / offline setup, or a client that can't use
              the remote bridge. It's a small standalone package (not the app build): one-time{' '}
              <Mono>cd modules/mcp/server &amp;&amp; npm install &amp;&amp; npm run build</Mono>.
              Then:
            </Step>
            <Snippet code={stdioConfig(origin)} />
          </TabsContent>
        </Tabs>

        <p className="text-xs text-muted-foreground">
          Endpoint: <Mono>{url}</Mono>. If your client supports remote MCP with custom headers
          natively, point it at that URL with header{' '}
          <Mono>Authorization: Bearer &lt;token&gt;</Mono> directly (no <Mono>mcp-remote</Mono>{' '}
          needed).
        </p>
      </DialogContent>
    </Dialog>
  )
}

function Snippet({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      toast.success('Copied')
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Could not copy — select and copy manually.')
    }
  }
  return (
    <div className="relative">
      <pre className="max-h-72 overflow-auto rounded-lg border border-border bg-muted p-3 pr-12 font-mono text-xs leading-relaxed">
        {code}
      </pre>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="absolute right-2 top-2 size-7"
        onClick={copy}
        aria-label="Copy"
      >
        {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
      </Button>
    </div>
  )
}

function Step({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">
      {children}
    </code>
  )
}
