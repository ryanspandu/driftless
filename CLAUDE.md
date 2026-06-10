# Claude Code — Driftless

**Read [AGENTS.md](AGENTS.md) first** before changing code in this repository.

## Project

- Private **Driftless** monolith: AdonisJS 7 + Inertia/React + PostgreSQL.
- Node **≥ 24**. Local dev: `npm run dev` after `docker compose up -d` and migrations/seed.

## Claude-specific

- Respect local [.claude/settings.local.json](.claude/settings.local.json) if present (permissions only; do not copy secrets into docs).
- Do not run destructive git commands or push unless the user explicitly requests it.
- Do not commit unless the user asks.
- Deep docs: [docs/ai/](docs/ai/).
