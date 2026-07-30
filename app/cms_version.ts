import { readFileSync } from 'node:fs'

/**
 * The version of Driftless itself.
 *
 * Nothing read `package.json` at runtime before this — the app genuinely had no
 * idea what version it was. A marketplace cannot serve compatible packages to a
 * host that cannot say what it is, so this is the first thing the whole thing
 * rests on.
 *
 * Read from `package.json` rather than generated into a file, so there is one
 * source of truth and no build step to forget. The relative URL resolves in
 * both layouts: `app/cms_version.ts` → `<root>/package.json` in development,
 * and `build/app/cms_version.js` → `build/package.json` in production, because
 * the bundler copies `package.json` into the build.
 *
 * Read once, at import. The file cannot change under a running process without
 * a restart, and a version that could drift mid-request would be worse than
 * useless.
 */
function readVersion(): string {
  try {
    const raw = readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    const version = (JSON.parse(raw) as { version?: unknown }).version
    return typeof version === 'string' && version.length > 0 ? version : '0.0.0'
  } catch {
    /**
     * `0.0.0` rather than a throw: a missing or unreadable `package.json` is a
     * broken deployment, but refusing to boot over it would take the whole site
     * down to protect a version string. Every semver range fails against
     * `0.0.0`, so the marketplace refuses to install anything — which is the
     * safe direction to fail in.
     */
    return '0.0.0'
  }
}

export const CMS_VERSION = readVersion()
