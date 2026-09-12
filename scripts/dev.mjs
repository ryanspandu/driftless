import { spawn } from 'node:child_process'

/**
 * Dev runner: the web server AND the queue worker in one command.
 *
 * The BullMQ worker (`node ace queue:work`) is a SEPARATE process from the web
 * server — it is what actually runs background jobs (mail delivery, payment-webhook
 * retries, and site export/import). Without it those jobs sit unprocessed, so dev
 * used to need a second terminal. This starts both so `npm run dev` "just works".
 *
 * The web server keeps the TTY (its HMR output, colours and clears are worth
 * preserving); the worker's less chatty output is line-prefixed with `[worker]`.
 * A no-dependency alternative to `concurrently`.
 *
 * Notes:
 * - `predev` (in package.json) already ran the codegen/clean steps before this.
 * - HMR only reloads the web process; worker code changes still need a restart
 *   (services/modules are not hot-reloaded — the hotHook boundary).
 */

const children = []
let shuttingDown = false

function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM')
  }
  // Give the worker a moment to drain in-flight jobs, then exit.
  setTimeout(() => process.exit(code), 300)
}

// Web server — inherits stdio so HMR keeps its pretty, interactive output.
const web = spawn('node', ['ace', 'serve', '--hmr'], { stdio: 'inherit' })
children.push(web)
web.on('exit', (code) => {
  // The web server is the primary process; when it goes, take the worker with it.
  console.log(`\n[dev] web server exited (${code ?? 0}) — stopping worker`)
  shutdown(code ?? 0)
})

// Queue worker — piped so each line is prefixed and never fights the web TTY.
const worker = spawn('node', ['ace', 'queue:work'], { stdio: ['ignore', 'pipe', 'pipe'] })
children.push(worker)
const prefix = (stream, tag) => {
  let buffer = ''
  stream.on('data', (chunk) => {
    buffer += chunk.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) process.stdout.write(`${tag} ${line}\n`)
  })
}
prefix(worker.stdout, '[worker]')
prefix(worker.stderr, '[worker]')
worker.on('exit', (code) => {
  // A worker crash should not kill the web server in dev — surface it and carry on.
  if (!shuttingDown) console.log(`[worker] exited (${code ?? 0}). Restart \`npm run dev\` to bring it back.`)
})

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => shutdown(0))
}
