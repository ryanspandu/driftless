import { indexPages } from '@adonisjs/inertia'
import { indexEntities } from '@adonisjs/core'
import { defineConfig } from '@adonisjs/core/app'
import { generateRegistry } from '@tuyau/core/hooks'

export default defineConfig({
  /*
  |--------------------------------------------------------------------------
  | Experimental flags
  |--------------------------------------------------------------------------
  |
  | The following features will be enabled by default in the next major release
  | of AdonisJS. You can opt into them today to avoid any breaking changes
  | during upgrade.
  |
  */
  experimental: {},

  /*
  |--------------------------------------------------------------------------
  | Commands
  |--------------------------------------------------------------------------
  |
  | List of ace commands to register from packages. The application commands
  | will be scanned automatically from the "./commands" directory.
  |
  */
  commands: [
    () => import('@adonisjs/core/commands'),
    () => import('@adonisjs/lucid/commands'),
    () => import('@adonisjs/session/commands'),
    () => import('@adonisjs/inertia/commands'),
  ],

  /*
  |--------------------------------------------------------------------------
  | Service providers
  |--------------------------------------------------------------------------
  |
  | List of service providers to import and register when booting the
  | application
  |
  */
  providers: [
    () => import('@adonisjs/core/providers/app_provider'),
    () => import('@adonisjs/core/providers/hash_provider'),
    {
      file: () => import('@adonisjs/core/providers/repl_provider'),
      environment: ['repl', 'test'],
    },
    () => import('@adonisjs/core/providers/vinejs_provider'),
    () => import('@adonisjs/core/providers/edge_provider'),
    () => import('@adonisjs/session/session_provider'),
    () => import('@adonisjs/vite/vite_provider'),
    () => import('@adonisjs/shield/shield_provider'),
    () => import('@adonisjs/static/static_provider'),
    () => import('@adonisjs/lucid/database_provider'),
    () => import('@adonisjs/cors/cors_provider'),
    () => import('@adonisjs/inertia/inertia_provider'),
    () => import('@adonisjs/auth/auth_provider'),
    () => import('@adonisjs/redis/redis_provider'),
    () => import('@adonisjs/limiter/limiter_provider'),
    () => import('@adonisjs/mail/mail_provider'),
    {
      file: () => import('#providers/vite_dev_provider'),
      environment: ['web', 'test'],
    },
    () => import('#providers/api_provider'),
    // Registers core job handlers before modules add theirs.
    () => import('#providers/queue_provider'),
    () => import('#providers/cms_provider'),
    () => import('#providers/modules_provider'),
  ],

  /*
  |--------------------------------------------------------------------------
  | Preloads
  |--------------------------------------------------------------------------
  |
  | List of modules to import before starting the application.
  |
  */
  preloads: [
    () => import('#start/routes'),
    () => import('#start/kernel'),
    () => import('#start/validator'),
  ],

  /*
  |--------------------------------------------------------------------------
  | Tests
  |--------------------------------------------------------------------------
  |
  | List of test suites to organize tests by their type. Feel free to remove
  | and add additional suites.
  |
  */
  tests: {
    suites: [
      {
        files: ['tests/unit/**/*.spec.{ts,js}'],
        name: 'unit',
        timeout: 2000,
      },
      {
        files: ['tests/functional/**/*.spec.{ts,js}'],
        name: 'functional',
        timeout: 30000,
      },
      /**
       * Front-end logic that is pure enough to run under Node.
       *
       * These live beside the code they test rather than in `tests/` because
       * the root `tsconfig.json` excludes `inertia/**` — a spec under `tests/`
       * importing from there fails the project-references typecheck. Keeping
       * them here means they are covered by `tsconfig.inertia.json` and by
       * `npm run typecheck` like everything else.
       *
       * Nothing imports these files, so they never reach a Vite bundle.
       */
      {
        files: ['inertia/**/*.spec.{ts,tsx}'],
        name: 'client',
        timeout: 5000,
      },
      {
        files: ['tests/browser/**/*.spec.{ts,js}'],
        name: 'browser',
        timeout: 300000,
      },
      /**
       * A module's own tests, discovered by shape rather than named here.
       *
       * Modules are meant to be a folder you can drop in, so their tests travel
       * with them instead of living in `tests/`. The timeout matches the
       * functional suite because most of these boot the app and hit the
       * database.
       */
      {
        files: ['modules/*/tests/**/*.spec.{ts,js}'],
        name: 'modules',
        timeout: 30000,
      },
      /**
       * Postgres-only. Advisory locks do not exist on SQLite, so these would
       * pass vacuously in the default suite — green, and proving nothing.
       * Gated on `PG_TEST_URL`; run with `node ace test pg`.
       */
      {
        files: ['tests/pg/**/*.spec.{ts,js}'],
        name: 'pg',
        timeout: 60000,
      },
    ],
    forceExit: false,
  },

  /*
  |--------------------------------------------------------------------------
  | Metafiles
  |--------------------------------------------------------------------------
  |
  | A collection of files you want to copy to the build folder when creating
  | the production build.
  |
  */
  metaFiles: [
    {
      pattern: 'resources/views/**/*.edge',
      reloadServer: false,
    },
    /**
     * Static files the app itself ships — deliberately NOT `public/**`.
     *
     * Two directories under `public/` must never be copied into the build:
     *
     * - `public/assets/**` is Vite's own output. Copying it back over a fresh
     *   build is what let a stale `.vite/manifest.json` overwrite the new one,
     *   leaving the app serving the previous build's JavaScript with nothing
     *   reporting a fault. See `scripts/clean-build.mjs`.
     * - `public/uploads/**` is the customer's media library. A site with 5 GB
     *   of images paid a 5 GB copy on every build, for files the build has no
     *   business touching.
     */
    {
      pattern: 'public/img/**',
      reloadServer: false,
    },
    {
      pattern: 'public/*.{svg,webp,png,ico,txt,webmanifest}',
      reloadServer: false,
    },
    {
      pattern: 'public/sw.js',
      reloadServer: false,
    },
    /**
     * Static files a module or plugin carries and serves from its own route.
     *
     * Only `.js` output survives the build otherwise, so without this a module
     * that ships data — the e-commerce city lists, say — would compile fine and
     * then 404 in production only. Matched by shape, so core still never names
     * one.
     */
    {
      pattern: 'modules/*/data/**',
      reloadServer: false,
    },
  ],

  hooks: {
    init: [
      indexEntities({
        transformers: { enabled: true, withSharedProps: true },
      }),
      indexPages({ framework: 'react' }),
      generateRegistry(),
    ],
    buildStarting: [() => import('@adonisjs/vite/build_hook')],
  },
})
