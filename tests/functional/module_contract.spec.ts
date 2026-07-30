import { test } from '@japa/runner'
import { execFile } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import app from '@adonisjs/core/services/app'

/**
 * The contract a package must satisfy before it is allowed to load.
 *
 * All of it is enforced during discovery, which runs at import time and cannot
 * be re-run inside a live process — so these boot a real one against a fixture
 * directory (`DRIFTLESS_MODULES_DIR`) and ask what survived. Slower than
 * calling a function, and the only version that exercises the path production
 * uses.
 */

const run = promisify(execFile)
const FIXTURES = app.tmpPath('module-contract-fixtures')

function writeModule(name: string, manifestBody: string) {
  const dir = join(FIXTURES, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'module.ts'),
    `import { defineModule } from '#modules/types'
export default defineModule({
  name: '${name}',
  label: '${name}',
  description: '',
  version: '1.0.0',
  permissions: [],
  registerRoutes: () => {},
${manifestBody}
})
`
  )
}

async function discovered(): Promise<string[]> {
  const { stdout } = await run(
    process.execPath,
    [
      '--import=@poppinss/ts-exec',
      '-e',
      `const r = await import('#modules/registry'); console.log('RESULT:' + JSON.stringify(r.MODULES.map((m) => m.name)))`,
      '--input-type=module',
    ],
    { cwd: app.appRoot.pathname, env: { ...process.env, DRIFTLESS_MODULES_DIR: FIXTURES } }
  )

  const line = stdout.split('\n').find((l) => l.startsWith('RESULT:'))!
  return JSON.parse(line.slice('RESULT:'.length))
}

test.group('Module contract', (group) => {
  group.each.setup(() => {
    rmSync(FIXTURES, { recursive: true, force: true })
    mkdirSync(FIXTURES, { recursive: true })
    return () => rmSync(FIXTURES, { recursive: true, force: true })
  })

  test('a plain module loads', async ({ assert }) => {
    writeModule('plain', '')
    assert.deepEqual(await discovered(), ['plain'])
  }).timeout(30_000)

  test('an incompatible engines range is refused', async ({ assert }) => {
    writeModule('futuristic', `  engines: { driftless: '>=99.0.0' },`)

    /**
     * The point is that it is *refused*, not that it crashes: a package built
     * against a core it does not fit must fail here with a readable reason
     * rather than later in a way that looks like a bug in the CMS.
     */
    assert.deepEqual(await discovered(), [])
  }).timeout(30_000)

  test('a satisfiable engines range loads', async ({ assert }) => {
    writeModule('compatible', `  engines: { driftless: '>=1.0.0 <2.0.0' },`)
    assert.deepEqual(await discovered(), ['compatible'])
  }).timeout(30_000)

  test('a plugin may not declare boot, maintenance or reservedSegments', async ({ assert }) => {
    writeModule('overreaching', `  kind: 'plugin',\n  reservedSegments: ['news'],`)

    // Without this check `kind` would be a label rather than a boundary.
    assert.deepEqual(await discovered(), [])
  }).timeout(30_000)

  test('an app may declare all three', async ({ assert }) => {
    writeModule('privileged', `  kind: 'app',\n  reservedSegments: ['news'],`)
    assert.deepEqual(await discovered(), ['privileged'])
  }).timeout(30_000)

  test('a module whose requirement is absent does not load', async ({ assert }) => {
    writeModule('dependant', `  requires: { modules: { missing: '>=1.0.0' } },`)
    assert.deepEqual(await discovered(), [])
  }).timeout(30_000)

  test('a satisfied requirement loads both', async ({ assert }) => {
    writeModule('base', '')
    writeModule('dependant', `  requires: { modules: { base: '>=1.0.0' } },`)

    assert.sameMembers(await discovered(), ['base', 'dependant'])
  }).timeout(30_000)

  test('a requirement at the wrong version does not load', async ({ assert }) => {
    writeModule('base', '')
    writeModule('dependant', `  requires: { modules: { base: '>=2.0.0' } },`)

    assert.deepEqual(await discovered(), ['base'])
  }).timeout(30_000)

  test('pruning cascades to a module that depended on a pruned one', async ({ assert }) => {
    writeModule('dependant', `  requires: { modules: { missing: '>=1.0.0' } },`)
    writeModule('grandchild', `  requires: { modules: { dependant: '>=1.0.0' } },`)

    /**
     * The reason pruning repeats until it settles. One pass would drop
     * `dependant` and leave `grandchild` loaded against a module that is not
     * there — the exact state the check exists to prevent.
     */
    assert.deepEqual(await discovered(), [])
  }).timeout(30_000)

  test('a manifest whose name does not match its folder is refused', async ({ assert }) => {
    const dir = join(FIXTURES, 'folder-name')
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'module.ts'),
      `import { defineModule } from '#modules/types'
export default defineModule({
  name: 'different-name',
  label: 'x', description: '', version: '1.0.0',
  permissions: [], registerRoutes: () => {},
})
`
    )

    // The row, the routes and the toggle all key on the folder name; a mismatch
    // would flip one module's switch while guarding another's routes.
    assert.deepEqual(await discovered(), [])
  }).timeout(30_000)
})
