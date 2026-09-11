/*
|--------------------------------------------------------------------------
| HTTP server entrypoint
|--------------------------------------------------------------------------
|
| The "server.ts" file is the entrypoint for starting the AdonisJS HTTP
| server. Either you can run this file directly or use the "serve"
| command to run this file and monitor file changes
|
*/

await import('reflect-metadata')
const { Ignitor, prettyPrintError } = await import('@adonisjs/core')
const { createServer } = await import('node:http')

/**
 * Safe to import this early precisely because it reaches for nothing in the
 * container — see the note at the top of the file it comes from. The server
 * callback below is synchronous, so it has to be resolved by now.
 */
const { adoptListenFd } = await import('#services/socket_activation')

/**
 * URL to the application root. AdonisJS need it to resolve
 * paths to file and directories for scaffolding commands
 */
const APP_ROOT = new URL('../', import.meta.url)

/**
 * The importer is used to import files in context of the
 * application.
 */
const IMPORTER = (filePath: string) => {
  if (filePath.startsWith('./') || filePath.startsWith('../')) {
    return import(new URL(filePath, APP_ROOT).href)
  }
  return import(filePath)
}

/**
 * How long a graceful shutdown may take before connections are cut.
 *
 * Ignitor's own close path is a bare `server.close()`: it stops accepting, then
 * waits for every open connection to end on its own, with no timeout and no
 * fallback. One long-lived response — a streamed download out of
 * `storage/protected/`, an SSE-ish poll — holds the process open forever, and
 * the supervisor's kill timer is the only thing that ends it. That turns every
 * restart into a SIGKILL and drops the requests a graceful shutdown exists to
 * protect.
 *
 * Ten seconds is longer than any legitimate request here and shorter than the
 * kill timeout configured in every shipped supervisor config.
 */
const DRAIN_MS = Number(process.env.DRIFTLESS_DRAIN_MS ?? 10_000)

new Ignitor(APP_ROOT, { importer: IMPORTER })
  .tap((app) => {
    app.booting(async () => {
      await import('#start/env')
    })

    /**
     * Deliberately here rather than in the install path: this fixes *every*
     * shutdown, including an operator's `systemctl restart`, not only the ones
     * the installer triggers.
     */
    app.terminating(async () => {
      const timer = setTimeout(() => {
        console.error(`[shutdown] still draining after ${DRAIN_MS}ms — closing connections`)

        void app.container
          .make('server')
          .then((server) => server.getNodeServer()?.closeAllConnections())
          .catch(() => {})
          .finally(() => process.exit(0))
      }, DRAIN_MS)

      /** Never let the deadline itself be the reason the process stays alive. */
      timer.unref()
    })

    /**
     * Record how long boot took, once ready.
     *
     * This is a measurement the admin UI reports verbatim when it tells an
     * operator what a restart will cost them. Under socket activation the
     * client-visible stall *is* this number, and boot here walks every native
     * CMS collection plus every module's `boot()` — so it has to be measured on
     * the box rather than guessed at.
     */
    app.ready(async () => {
      const { markBootComplete } = await import('#services/supervisor')
      markBootComplete(Math.round(process.uptime() * 1000))
    })

    app.listen('SIGTERM', () => app.terminate())
    app.listenIf(app.managedByPm2, 'SIGINT', () => app.terminate())
  })
  .httpServer()
  .start((handler) => {
    const server = createServer(handler)

    /**
     * Under systemd socket activation the listening socket is inherited as fd 3
     * and must be adopted *before* Ignitor calls `listen()`. See
     * `app/services/socket_activation.ts` for why this has to redirect the call
     * Ignitor is going to make rather than listening ahead of it.
     */
    adoptListenFd(server)

    return server
  })
  .catch((error) => {
    process.exitCode = 1
    prettyPrintError(error)
  })
