# AI documentation index

Reference docs for AI coding assistants (Cursor, Claude Code, GitHub Copilot, Codex, etc.). Start with the repo hub: [AGENTS.md](../../AGENTS.md).

## Guides

| Doc                                                  | Topics                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [architecture.md](./architecture.md)                 | Monolith layout, middleware, Inertia vs API routes                                                                                                                                                                                                                                                                     |
| [dev-workflow.md](./dev-workflow.md)                 | Commands, Docker, env, Vite dev pitfalls                                                                                                                                                                                                                                                                               |
| [conventions.md](./conventions.md)                   | Code style, imports, commits, maintenance                                                                                                                                                                                                                                                                              |
| [backend.md](./backend.md)                           | Controllers, services, validators, middleware                                                                                                                                                                                                                                                                          |
| [frontend.md](./frontend.md)                         | Inertia pages, hooks, UI components                                                                                                                                                                                                                                                                                    |
| [cms.md](./cms.md)                                   | Dynamic collections, fields, revisions, sidebar grouping                                                                                                                                                                                                                                                               |
| [cms-content-modeling.md](./cms-content-modeling.md) | Field-type catalog, single types, relations (4 cardinalities + public id→label resolution), components (inline + registry), per-field width                                                                                                                                                                            |
| [modules.md](./modules.md)                           | The one package system. Apps and plugins are both modules — `kind` on the manifest is the only difference                                                                                                                                                                                                              |
| [modules.md](./modules.md)                           | Module system: first-party app areas (DB-toggled), `make:module`, install from the admin, Settings → Modules                                                                                                                                                                                                           |
| [modules.md](./modules.md) → module READMEs          | A module documents itself: see `modules/<name>/README.md`. E-commerce: [modules/ecommerce/README.md](../../modules/ecommerce/README.md). MCP (AI site-building): [modules/mcp/README.md](../../modules/mcp/README.md)                                                                                                  |
| [modules/mcp/README.md](../../modules/mcp/README.md) | **MCP** module: token-authed builder-API (`/api/mcp/v1/*`) + in-app Streamable-HTTP MCP endpoint + bundled stdio client so an AI can build collections/pages/templates/appearance; block catalog (with module provenance) + Puck content validator; `/admin/mcp` token management, activity audit and write rate-limit |
| [mail.md](./mail.md)                                 | Transactional email: SMTP provider presets, per-email toggles and editable copy, delivery log, `EMAIL` builder templates                                                                                                                                                                                               |
| [auth-and-permissions.md](./auth-and-permissions.md) | Session auth, OAuth, permission grammar                                                                                                                                                                                                                                                                                |
| [security.md](./security.md)                         | Sanitization, CSP (incl. builder `<style>` nonce + SSG snapshot nonce-restamp), media/SVG policy, rollout commands, secure seeds                                                                                                                                                                                       |
| [offline-and-pwa.md](./offline-and-pwa.md)           | Dexie, sync engine, Serwist                                                                                                                                                                                                                                                                                            |
| [api-docs.md](./api-docs.md)                         | Auto OpenAPI docs (adonis-autoswagger + Scalar at `/api/docs`, **dev-only**); implemented                                                                                                                                                                                                                              |
| [api-v1.md](./api-v1.md)                             | External token-authed API (`/api/v1`, PAT + access tokens, content/CMS, RBAC ∩ ability, Redis rate-limit); **implemented**                                                                                                                                                                                             |
| [testing.md](./testing.md)                           | Japa suites and patterns                                                                                                                                                                                                                                                                                               |

## Page builder

| Doc                                      | Topics                                                                                                                                                                            |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [pages-builder.md](./pages-builder.md)   | Puck visual page builder: blocks, render modes (SSR/SSG/CSR), collection binding, entrance animations (scroll/load triggers), relation-label display                              |
| [builder-layers.md](./builder-layers.md) | Webflow-style custom builder layout: Layers tree + Detail style panel + navbar; interaction-state styling (Base/Hover/Focus/Active), custom colour picker + saved-colour swatches |
| [templates.md](./templates.md)           | Reusable HEADER/FOOTER/LAYOUT/COMPONENT/EMAIL/COLLECTION templates + per-page composition                                                                                         |
| [settings-ia.md](./settings-ia.md)       | Which settings screen owns which field, and the `web_settings` key map (incl. `theme` palette + saved colours) — read before adding a setting                                     |
| [page-settings.md](./page-settings.md)   | Page Settings (SEO, General) + per-page & site-wide custom code/meta + Appearance (font + palette + saved colours); `/admin/website-settings`                                     |
| [code-pages.md](./code-pages.md)         | Hand-written React pages (`kind = CODE`) and custom builder blocks — the escape hatches from the builder, and when **not** to use them                                            |
| [auth-pages.md](./auth-pages.md)         | Replacing `/login`, `/register`, password reset and the public 404/500 with builder pages; the working auth form blocks; the password-reset flow                                  |

## Legacy / ops

| Doc                                              | Topics                                           |
| ------------------------------------------------ | ------------------------------------------------ |
| [../LEGACY_MIGRATION.md](../LEGACY_MIGRATION.md) | Legacy stack → driftless migration and checklist |

## Tool-specific entry points

| Tool                    | File                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------ |
| Universal               | [AGENTS.md](../../AGENTS.md)                                                         |
| Claude Code             | [CLAUDE.md](../../CLAUDE.md)                                                         |
| GitHub Copilot          | [.github/copilot-instructions.md](../../.github/copilot-instructions.md)             |
| Cursor rules            | [.cursor/rules/](../../.cursor/rules/)                                               |
| Cursor skill (optional) | [.cursor/skills/driftless-dev/SKILL.md](../../.cursor/skills/driftless-dev/SKILL.md) |

Operator-facing docs live one level up: [DEPLOYMENT.md](../DEPLOYMENT.md) (release layout, supervisor, health) and [RECOVERY.md](../RECOVERY.md) (safe mode, rollback, the recovery CLI).
