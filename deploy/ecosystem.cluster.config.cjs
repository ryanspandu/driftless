/**
 * PM2 **cluster** mode — opt-in, and only worth it with memory to spare.
 *
 *   pm2 start deploy/ecosystem.cluster.config.cjs
 *   pm2 reload driftless      # the zero-downtime deploy verb in this mode
 *
 * What it buys: with two or more workers, a restart is rolling — one leaves at a
 * time and the others keep serving, so installing an app never takes the site
 * offline.
 *
 * What it costs, and read this before choosing it: **every worker holds a full
 * copy** of the module registry, the CMS native collections and the SSR bundle.
 * On the 1 GB VPS this project is built to run on, two workers is most of the
 * box — and `max_memory_restart` means a front-end build's memory spike can trip
 * an *unrelated* worker restart in the middle of an install.
 *
 * If you are self-hosting on a small box and want restarts that drop no
 * connections, **prefer systemd socket activation** (`deploy/systemd/driftless.socket`).
 * It costs no extra memory at all. This file is for installs with ~4 GB and a
 * reason.
 *
 * `instances` is a number rather than `'max'` on purpose: `'max'` on a 2-vCPU
 * box schedules two full copies of the application and is the most common way to
 * OOM it. Raise it deliberately.
 */
module.exports = {
  apps: [
    {
      name: 'driftless',
      script: 'current/bin/server.js',
      cwd: __dirname + '/..',
      instances: 2,
      exec_mode: 'cluster',
      max_memory_restart: '1G',
      autorestart: true,
      // Adonis emits the literal 'ready' message once listening, so a reload
      // waits for a worker that can actually serve before retiring the old one.
      // Without this, `pm2 reload` is not zero-downtime at all.
      wait_ready: true,
      listen_timeout: 30000,
      // Must exceed DRIFTLESS_DRAIN_MS (10s), or the drain is cut short.
      kill_timeout: 15000,
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'driftless-worker',
      script: 'current/bin/console.js',
      args: 'queue:work',
      cwd: __dirname + '/..',
      // Deliberately not clustered. The queue worker is not a bottleneck here,
      // and BullMQ concurrency already parallelises within one process.
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      kill_timeout: 15000,
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'driftless-maintenance',
      script: 'current/bin/console.js',
      args: 'modules:maintenance',
      cwd: __dirname + '/..',
      cron_restart: '*/5 * * * *',
      autorestart: false,
      env: { NODE_ENV: 'production' },
    },
  ],
}
