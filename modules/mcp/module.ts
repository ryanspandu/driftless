import { defineModule } from '#modules/types'
import { registerRoutes } from '#modules/mcp/routes'

export default defineModule({
  name: 'mcp',
  label: 'MCP',
  description:
    'A token-authenticated builder-API and a bundled MCP server, so an AI assistant (Claude/Codex desktop) can build a whole site — collections, records, pages, templates, appearance and media. Off by default.',
  version: '1.0.0',
  /**
   * Which Driftless versions this works with. Discovery refuses a package
   * outside the range rather than letting it fail later.
   */
  engines: { driftless: '>=1.0.0 <2.0.0' },
  /**
   * Off until "node ace modules:install mcp" has run its migrations and
   * rebuilt the front-end. A module that switches itself on at the next boot
   * would be live before any of that happened.
   */
  autoEnable: false,
  /**
   * The one table this module owns — the builder-API audit log. Declared so
   * install detection and uninstall (which drops it) know about it. Run
   * `node ace modules:install mcp` (or a migration) to create it; the audit
   * middleware degrades gracefully until then.
   */
  tables: ['mcp_audit_logs'],
  permissions: [
    { name: 'mcp:read', description: 'View MCP.' },
    { name: 'mcp:manage', description: 'Manage MCP.' },
  ],
  nav: {
    label: 'MCP',
    icon: 'Plugs',
    order: 50,
    href: '/admin/mcp',
    permission: 'mcp:read',
  },
  registerRoutes,
})
