import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

/**
 * Enumerate the custom-template "kits" this build knows about.
 *
 * A kit is a self-contained coded page under `inertia/custom/kits/` (see that
 * folder's README). A kit provides two things, both listed here:
 *
 *  - a **template** the operator points a DB page at (`index.tsx` → `kit:<id>`);
 *  - zero or more **file-pages** (`pages/*.tsx`) — standalone routes that live in
 *    the folder, with NO database row (`kitpage:<kit>/<file>`).
 *
 * This mirrors `generate-code-pages.mjs`, and for the same two reasons: the
 * server cannot `readdir` the `.tsx` sources in a production build, so it needs a
 * generated manifest to validate against and to route/list from; and Tailwind
 * skips gitignored folders unless each is named by an explicit `@source`.
 *
 * Two committed, sorted, write-on-change artifacts:
 *   app/services/custom_templates.generated.ts   the manifests (under `#services/*`)
 *   inertia/css/custom-templates.generated.css    the Tailwind `@source` lines
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const kitsDir = join(root, 'inertia/custom/kits')
const inertiaDir = join(root, 'inertia')
const tsOut = join(root, 'app/services/custom_templates.generated.ts')
const cssOut = join(root, 'inertia/css/custom-templates.generated.css')
const emailOut = join(root, 'app/services/custom_email_templates.generated.ts')

/** A kit = a directory holding `kit.json`; `.`/`_`-prefixed folders are skipped. */
function kitFolders() {
  try {
    return readdirSync(kitsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => !name.startsWith('.') && !name.startsWith('_'))
      .filter((name) => existsSync(join(kitsDir, name, 'kit.json')))
      .sort()
  } catch {
    return []
  }
}

/** Read `{ name, description }` from a kit's marker, tolerating a bad/missing file. */
function readMeta(id) {
  try {
    const raw = JSON.parse(readFileSync(join(kitsDir, id, 'kit.json'), 'utf8'))
    const name = typeof raw?.name === 'string' && raw.name.trim() ? raw.name.trim() : id
    const description = typeof raw?.description === 'string' ? raw.description.trim() : ''
    return { id, name, description }
  } catch {
    return { id, name: id, description: '' }
  }
}

/** `about-us` / `about_us` → `About us`; `index` → `Home`. */
function titleize(slug) {
  if (slug === 'index') return 'Home'
  const words = slug.replace(/[-_]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Pull a simple `export const <name> = '...'` string literal, or null. */
function matchExport(src, name) {
  const m = src.match(new RegExp(`export\\s+const\\s+${name}\\s*=\\s*['"\`]([^'"\`]+)['"\`]`))
  return m ? m[1] : null
}

const stripSlashes = (p) => p.replace(/^\/+|\/+$/g, '')

/**
 * File-pages: `inertia/custom/kits/<kit>/pages/*.tsx`. Each file is a route.
 * The path is the filename (`index` → home `''`), overridable with an
 * `export const path = '...'`; the title is the titleized filename, overridable
 * with `export const title = '...'`. `.`/`_`-prefixed files are skipped.
 */
function filePages() {
  const out = []
  for (const kit of kitFolders()) {
    const pagesDir = join(kitsDir, kit, 'pages')
    if (!existsSync(pagesDir)) continue
    for (const entry of readdirSync(pagesDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.tsx')) continue
      if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue
      const file = entry.name.replace(/\.tsx$/, '')
      const src = readFileSync(join(pagesDir, entry.name), 'utf8')
      const rawPath = matchExport(src, 'path') ?? (file === 'index' ? '' : file)
      out.push({
        path: stripSlashes(rawPath),
        kit,
        file,
        title: matchExport(src, 'title') ?? titleize(file),
      })
    }
  }
  out.sort((a, b) => a.path.localeCompare(b.path))
  const seen = new Map()
  for (const p of out) {
    const clash = seen.get(p.path)
    if (clash) {
      throw new Error(
        `[custom-templates] two file-pages resolve to "/${p.path}": ` +
          `${clash.kit}/pages/${clash.file}.tsx and ${p.kit}/pages/${p.file}.tsx`
      )
    }
    seen.set(p.path, p)
  }
  return out
}

/**
 * Code-chrome templates: `inertia/custom/kits/<kit>/templates/{header,footer,layout}.tsx`.
 * Each is a React component a page can point its header/footer/layout at (per-page,
 * like a DB template) via the pointer `codetpl:<kit>/<type>`.
 */
const CHROME_TYPES = ['header', 'footer', 'layout']
function codeTemplates() {
  const out = []
  for (const kit of kitFolders()) {
    const tdir = join(kitsDir, kit, 'templates')
    if (!existsSync(tdir)) continue
    for (const type of CHROME_TYPES) {
      if (existsSync(join(tdir, `${type}.tsx`))) out.push({ kit, type: type.toUpperCase() })
    }
  }
  out.sort((a, b) => `${a.kit}/${a.type}`.localeCompare(`${b.kit}/${b.type}`))
  return out
}

/**
 * Code collection templates: `inertia/custom/kits/<kit>/collection/<collectionKey>.tsx`.
 * A component that renders ONE CMS record, used as a Collection List item via the
 * pointer `codetpl:<kit>/collection/<collectionKey>`. The filename is the
 * collection key so the picker can scope them like a builder COLLECTION template.
 */
function codeCollections() {
  const out = []
  for (const kit of kitFolders()) {
    const dir = join(kitsDir, kit, 'collection')
    if (!existsSync(dir)) continue
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.tsx')) continue
      if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue
      out.push({ kit, collectionKey: entry.name.replace(/\.tsx$/, '') })
    }
  }
  out.sort((a, b) => `${a.kit}/${a.collectionKey}`.localeCompare(`${b.kit}/${b.collectionKey}`))
  return out
}

/**
 * Code EMAIL templates: `inertia/custom/kits/<kit>/emails/<name>.tsx`. Each is a
 * React component flattened to inline-styled email HTML, wired to a mail event
 * via the pointer `codetpl:<kit>/email/<name>`. `.`/`_`-prefixed files skipped.
 */
function codeEmails() {
  const out = []
  for (const kit of kitFolders()) {
    const dir = join(kitsDir, kit, 'emails')
    if (!existsSync(dir)) continue
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.tsx')) continue
      if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue
      out.push({ kit, name: entry.name.replace(/\.tsx$/, '') })
    }
  }
  out.sort((a, b) => `${a.kit}/${a.name}`.localeCompare(`${b.kit}/${b.name}`))
  return out
}

/**
 * Flatten every kit email to inline-styled HTML at BUILD time.
 *
 * The send-time worker has no React/Vite bundle (see docs/ai/mail.md), so a code
 * email — like a Puck EMAIL template rendered in the operator's browser — must be
 * pre-rendered to a plain HTML string the worker can string-substitute. We bundle
 * a tiny self-contained render program per email (component + react + the
 * `{{token}}`-proxy) with esbuild and run it, capturing the markup. esbuild is
 * dynamic-imported so a build with no kit emails pays nothing for it.
 */
async function renderEmails(emails) {
  if (!emails.length) return []
  const { build } = await import('esbuild')
  const work = mkdtempSync(join(tmpdir(), 'kit-emails-'))
  try {
    const rows = []
    for (const { kit, name } of emails) {
      const component = join(kitsDir, kit, 'emails', `${name}.tsx`)
      const entry = join(work, `entry-${kit}-${name}.tsx`)
      const bundle = join(work, `bundle-${kit}-${name}.cjs`)
      // Every variable access yields its own `{{token}}` so the send path can
      // substitute it — the generator never needs the runtime event catalog.
      writeFileSync(
        entry,
        [
          "import { renderToStaticMarkup } from 'react-dom/server'",
          `import Component from ${JSON.stringify(component)}`,
          "const vars = new Proxy({}, { get: (_t, k) => (typeof k === 'string' ? '{{' + k + '}}' : '') })",
          // Call the component directly (not via createElement, which copies only
          // enumerable keys and would drop the proxy's every-key {{token}} trap).
          // Email components are pure, so calling them with props is safe.
          'process.stdout.write(renderToStaticMarkup(Component(vars)))',
          '',
        ].join('\n')
      )
      try {
        await build({
          entryPoints: [entry],
          outfile: bundle,
          bundle: true,
          format: 'cjs',
          platform: 'node',
          jsx: 'automatic',
          alias: { '~': inertiaDir },
          // The entry lives in a temp dir with no node_modules above it — point
          // bare imports (react, react-dom/server) at the repo's, like NODE_PATH.
          nodePaths: [join(root, 'node_modules')],
          loader: {
            '.css': 'empty',
            '.svg': 'dataurl',
            '.png': 'dataurl',
            '.jpg': 'dataurl',
            '.jpeg': 'dataurl',
            '.webp': 'dataurl',
            '.gif': 'dataurl',
            '.woff': 'dataurl',
            '.woff2': 'dataurl',
          },
          logLevel: 'silent',
        })
        const html = execFileSync(process.execPath, [bundle], {
          encoding: 'utf8',
          maxBuffer: 32 * 1024 * 1024,
        })
        if (!html.includes('data-email-body-slot')) {
          // Not fatal — a marketing email needs no service slot — but usually a mistake.
          console.warn(
            `[custom-templates] warning: ${kit}/emails/${name}.tsx has no <EmailBody/> — ` +
              'the order table / reset link (bodyHtml) will be dropped for events that compose one.'
          )
        }
        rows.push({ kit, name, html })
      } catch (err) {
        throw new Error(
          `[custom-templates] could not render ${kit}/emails/${name}.tsx: ${(err && err.message) || err}`
        )
      }
    }
    return rows
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

const folders = kitFolders()
// A single-template kit has an index.tsx (a page points at it via `kit:<id>`); a
// kit may instead (or also) provide file-pages via `pages/`. Only index kits go
// in CUSTOM_TEMPLATES so the picker never offers a folder with nothing to render.
const kits = folders.filter((id) => existsSync(join(kitsDir, id, 'index.tsx'))).map(readMeta)
const pages = filePages()
const chrome = codeTemplates()
const collections = codeCollections()
const emails = codeEmails()
const emailRows = await renderEmails(emails)

const tsBody = [
  '/* Generated by scripts/generate-custom-templates.mjs — do not edit. */',
  '',
  '/**',
  ' * Every custom-template kit under `inertia/custom/kits/` (a folder with a',
  ' * `kit.json` marker + `index.tsx` entry).',
  ' *',
  ' * Read by `PagesService` to reject a CODE page whose `kit:<id>` component does',
  ' * not exist, and served to the admin / MCP page-create pickers so they only',
  ' * ever offer real kits. `id` is the folder name and the value stored as',
  ' * `page.component = "kit:<id>"`.',
  ' */',
  'export interface CustomTemplate {',
  '  id: string',
  '  name: string',
  '  description: string',
  '}',
  '',
  `export const CUSTOM_TEMPLATES: readonly CustomTemplate[] = ${JSON.stringify(kits, null, 2)}`,
  '',
  '/**',
  ' * File-pages: standalone routes that live in a kit as code, with NO database',
  ' * row (`inertia/custom/kits/<kit>/pages/*.tsx`). `path` is the URL path without',
  ' * a leading slash (`""` = home); the renderer resolves the component pointer',
  ' * `kitpage:<kit>/<file>`. Read by the public router (a DB page at the same path',
  ' * wins) and merged into the admin pages list as read-only rows.',
  ' */',
  'export interface FilePage {',
  '  path: string',
  '  kit: string',
  '  file: string',
  '  title: string',
  '}',
  '',
  `export const FILE_PAGES: readonly FilePage[] = ${JSON.stringify(pages, null, 2)}`,
  '',
  '/**',
  ' * Code-chrome templates a page can point its header / footer / layout at,',
  ' * per-page like a DB template — `templates/{header,footer,layout}.tsx` in a',
  ' * kit, referenced by the pointer `codetpl:<kit>/<type>`.',
  ' */',
  "export type CodeTemplateType = 'HEADER' | 'FOOTER' | 'LAYOUT'",
  'export interface CodeTemplate {',
  '  kit: string',
  '  type: CodeTemplateType',
  '}',
  '',
  `export const CODE_TEMPLATES: readonly CodeTemplate[] = ${JSON.stringify(chrome, null, 2)}`,
  '',
  '/**',
  ' * Code collection templates a Collection List can render each record with —',
  ' * `collection/<collectionKey>.tsx` in a kit, referenced by the pointer',
  ' * `codetpl:<kit>/collection/<collectionKey>`. The component receives one record.',
  ' */',
  'export interface CodeCollectionTemplate {',
  '  kit: string',
  '  collectionKey: string',
  '}',
  '',
  `export const COLLECTION_TEMPLATES: readonly CodeCollectionTemplate[] = ${JSON.stringify(collections, null, 2)}`,
  '',
].join('\n')

const cssBody = [
  '/* Generated by scripts/generate-custom-templates.mjs — do not edit. */',
  '/*',
  ' * One line per custom-template kit, naming each directory explicitly so',
  ' * Tailwind scans it: installed kits are gitignored operator payloads, and',
  ' * Tailwind skips gitignored paths for a directory source or a broad glob but',
  ' * honours a path that names the directory itself.',
  ' */',
  ...folders.map((id) => `@source "../custom/kits/${id}";`),
  '',
].join('\n')

const emailBody = [
  '/* Generated by scripts/generate-custom-templates.mjs — do not edit. */',
  '',
  '/**',
  ' * Code EMAIL templates a mail event can be wired to — `emails/<name>.tsx` in a',
  ' * kit, referenced by the pointer `codetpl:<kit>/email/<name>`.',
  ' *',
  ' * Each `html` is the component flattened to inline-styled email HTML at BUILD',
  ' * time, because the send-time worker has no React bundle (see docs/ai/mail.md).',
  ' * The mail path substitutes `{{tokens}}` and the `data-email-body-slot` marker',
  ' * into it, exactly as it does a Puck EMAIL template’s `renderedHtml`.',
  ' */',
  'export interface CodeEmailTemplate {',
  '  kit: string',
  '  name: string',
  '  html: string',
  '}',
  '',
  `export const EMAIL_TEMPLATES: readonly CodeEmailTemplate[] = ${JSON.stringify(emailRows, null, 2)}`,
  '',
].join('\n')

function writeIfChanged(file, body) {
  const current = existsSync(file) ? readFileSync(file, 'utf8') : null
  if (current === body) return false
  writeFileSync(file, body)
  return true
}

const changed = [
  writeIfChanged(tsOut, tsBody),
  writeIfChanged(cssOut, cssBody),
  writeIfChanged(emailOut, emailBody),
].some(Boolean)
console.log(
  changed
    ? `[custom-templates] wrote ${kits.length} kit(s), ${pages.length} file-page(s), ${emailRows.length} email(s)`
    : `[custom-templates] up to date (${kits.length} kit(s), ${pages.length} file-page(s), ${emailRows.length} email(s))`
)
