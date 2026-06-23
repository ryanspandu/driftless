# AI documentation index

Reference docs for AI coding assistants (Cursor, Claude Code, GitHub Copilot, Codex, etc.). Start with the repo hub: [AGENTS.md](../../AGENTS.md).

## Guides

| Doc | Topics |
|-----|--------|
| [architecture.md](./architecture.md) | Monolith layout, middleware, Inertia vs API routes |
| [dev-workflow.md](./dev-workflow.md) | Commands, Docker, env, Vite dev pitfalls |
| [conventions.md](./conventions.md) | Code style, imports, commits, maintenance |
| [backend.md](./backend.md) | Controllers, services, validators, middleware |
| [frontend.md](./frontend.md) | Inertia pages, hooks, UI components |
| [cms.md](./cms.md) | Dynamic collections, fields, revisions, sidebar grouping |
| [plugins.md](./plugins.md) | Plugin system: co-located BE+FE, two front-ends, runtime enable/disable |
| [modules.md](./modules.md) | Module system: first-party app areas (DB-toggled), `make:module`, Settings → Application |
| [auth-and-permissions.md](./auth-and-permissions.md) | Session auth, OAuth, permission grammar |
| [offline-and-pwa.md](./offline-and-pwa.md) | Dexie, sync engine, Serwist |
| [api-docs.md](./api-docs.md) | Auto OpenAPI docs (adonis-autoswagger + Scalar at `/api/docs`, **dev-only**); implemented |
| [api-v1.md](./api-v1.md) | External token-authed API (`/api/v1`, PAT + access tokens, content/CMS, RBAC ∩ ability, Redis rate-limit); **implemented** |
| [testing.md](./testing.md) | Japa suites and patterns |

## Legacy / ops

| Doc | Topics |
|-----|--------|
| [../LEGACY_MIGRATION.md](../LEGACY_MIGRATION.md) | Legacy stack → driftless migration and checklist |

## Tool-specific entry points

| Tool | File |
|------|------|
| Universal | [AGENTS.md](../../AGENTS.md) |
| Claude Code | [CLAUDE.md](../../CLAUDE.md) |
| GitHub Copilot | [.github/copilot-instructions.md](../../.github/copilot-instructions.md) |
| Cursor rules | [.cursor/rules/](../../.cursor/rules/) |
| Cursor skill (optional) | [.cursor/skills/driftless-dev/SKILL.md](../../.cursor/skills/driftless-dev/SKILL.md) |
