/**
 * Clears SSG page HTML snapshots (`pages.rendered_html`) on production boot.
 *
 * The snapshot embeds hashed asset URLs, so a fresh build/deploy would otherwise
 * serve HTML pointing at stale assets. Snapshots self-repopulate on first hit and
 * are also invalidated whenever a page is edited/published/restored.
 */
import pg from 'pg'

const url = process.env.DATABASE_URL || process.env.DRIFTLESS_DATABASE_URL
if (!url) {
  console.log('[clear-page-cache] no DATABASE_URL — skipping')
  process.exit(0)
}

const client = new pg.Client({ connectionString: url })
try {
  await client.connect()
  await client.query('UPDATE pages SET rendered_html = NULL WHERE rendered_html IS NOT NULL')
  console.log('[clear-page-cache] cleared SSG snapshots')
} catch (e) {
  // Table may not exist yet (pre-migration) — non-fatal.
  console.log('[clear-page-cache] skipped:', e.message)
} finally {
  try {
    await client.end()
  } catch {}
}
