/**
 * PM2 process definitions for a self-hosted Driftless install.
 *
 *   pm2 start deploy/ecosystem.config.cjs
 *   pm2 save && pm2 startup
 *
 * Three processes, because two of them are silently load-bearing:
 *
 * - **worker** delivers mail and retries payment webhooks. Without it those sit
 *   undelivered forever, and nothing on the site says so.
 * - **maintenance** releases stock held by abandoned checkouts, matures
 *   affiliate commissions and closes orders past their refund window. Skipping
 *   it does not break a page; it quietly stops the shop from being correct.
 *
 * `cwd` is the source checkout, and the web process runs `current/bin/server.js`
 * through the release symlink — see `scripts/build-release.mjs`.
 *
 * This is the **default** config: a single process, restarted with a short gap.
 * For continuity during restarts prefer systemd socket activation
 * (`deploy/systemd/driftless.socket`), which costs no extra memory. PM2 cluster
 * is in `ecosystem.cluster.config.cjs` and is only worth it on a box with RAM to
 * spare — see docs/DEPLOYMENT.md.
 */
module.exports = {
  apps: [
    {
      name: 'driftless',
      script: 'current/bin/server.js',
      cwd: __dirname + '/..',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '1G',
      // The installer restarts by exiting; PM2 must bring it straight back.
      autorestart: true,
      // Adonis emits the literal 'ready' message once the server is listening,
      // so PM2 can wait for a real ready signal instead of guessing from uptime.
      // Without this a reload reports success before the app can serve.
      wait_ready: true,
      listen_timeout: 30000,
      // Must exceed DRIFTLESS_DRAIN_MS (10s) or PM2 SIGKILLs mid-drain and the
      // graceful shutdown in bin/server.ts never gets to finish its work.
      // PM2's default is 1600ms.
      kill_timeout: 15000,
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'driftless-worker',
      script: 'current/bin/console.js',
      args: 'queue:work',
      cwd: __dirname + '/..',
      instances: 1,
      autorestart: true,
      // The worker drains in-flight jobs on SIGTERM; cutting it short means a
      // half-processed job is retried from the beginning.
      kill_timeout: 15000,
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'driftless-maintenance',
      script: 'current/bin/console.js',
      args: 'modules:maintenance',
      cwd: __dirname + '/..',
      // A cron job, not a daemon: it runs, does its sweep and exits.
      cron_restart: '*/5 * * * *',
      autorestart: false,
      env: { NODE_ENV: 'production' },
    },
  ],
}
