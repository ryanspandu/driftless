# Legacy stack → Driftless migration

## Pre-migration checklist

- [ ] PostgreSQL running (`docker compose up -d` in the project root)
- [ ] `DATABASE_URL` points at the **driftless** database (e.g. `postgresql://postgres:postgres@localhost:5433/driftless`) — do **not** run Lucid migrations against the legacy Prisma database; it already has conflicting tables like `media`
- [ ] `node ace migration:run && node ace db:seed`
- [ ] `SEED_ADMIN_PASSWORD` is quoted in `.env` if it contains `#` — unquoted `#` is treated as a comment by dotenv
- [ ] If an existing non-production admin needs a reset, run `FORCE_SEED_PASSWORD=1 node ace db:seed` (development/test only; production rejects it)
- [ ] Start dev server with `npm run dev` (or `npm run serve`) — **not** plain `node ace serve`, which runs in static mode and needs a prior build
- [ ] Google OAuth + CAPTCHA configured in Admin → Integrations
- [ ] Create a dynamic CMS collection, add records, test revision restore
- [ ] Offline: disable network → edit content → reconnect → sync drains outbox
- [ ] PWA: build app, install, verify `/offline` fallback

## Data migration

If migrating from an existing legacy PostgreSQL database (Prisma schema):

```bash
LEGACY_DATABASE_URL=postgresql://user:pass@host:5432/legacy_db \
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/driftless \
node ace migrate:from-legacy
```

Then seed builtin permissions, roles, and the admin user:

```bash
node ace db:seed
```

**Note:** Legacy user IDs are ULIDs; Driftless uses integer IDs. The migrator assigns new user IDs and remaps `role_user` / `content.author_id`. Password hashes are copied as-is (`password_hash` → `password`); bcrypt hashes are upgraded to scrypt on first login.

## Static assets

Place brand assets under `public/` (`bg-login.webp`, `logo-text.svg`, integration logos under `/img/*`).

## Production

Point production DNS / reverse proxy to the Driftless Adonis monolith on port 3333 (or your configured `PORT`).
