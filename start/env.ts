/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.string(),

  APP_KEY: Env.schema.secret(),
  /**
   * The previous `APP_KEY`, kept only while rotating. Encryption tries every
   * configured key when decrypting, so keeping the old one here lets already
   * stored ciphertext (integration secrets, payment credentials) be read until
   * it has been re-encrypted under the new key. Remove it once rotation is done.
   */
  APP_KEY_PREVIOUS: Env.schema.string.optional(),
  APP_URL: Env.schema.string({ format: 'url', tld: false }),

  /**
   * Which upstream addresses may set `X-Forwarded-For`. Passed straight to
   * `proxy-addr`, so it accepts `loopback` (the default), `linklocal`,
   * `uniquelocal`, a CIDR, or a comma-separated list.
   *
   * This decides what `request.ip()` returns, and therefore whether every
   * IP-keyed rate limit is meaningful. Behind a load balancer or CDN, leaving
   * it at `loopback` makes the whole fleet share the balancer's address.
   */
  /** Test-only: point module discovery at a fixture directory. */
  DRIFTLESS_MODULES_DIR: Env.schema.string.optional(),
  TRUST_PROXY: Env.schema.string.optional(),

  SESSION_DRIVER: Env.schema.enum(['cookie', 'memory', 'database'] as const),

  DATABASE_URL: Env.schema.string(),

  GOOGLE_CLIENT_ID: Env.schema.string.optional(),
  GOOGLE_CLIENT_SECRET: Env.schema.string.optional(),
  GOOGLE_CALLBACK_URL: Env.schema.string.optional(),

  MEDIA_STORAGE_PATH: Env.schema.string.optional(),
  MEDIA_URL_PREFIX: Env.schema.string.optional(),

  SEED_ADMIN_EMAIL: Env.schema.string.optional(),
  SEED_ADMIN_PASSWORD: Env.schema.string.optional(),
  SEED_ADMIN_USERNAME: Env.schema.string.optional(),
  FORCE_SEED_PASSWORD: Env.schema.string.optional(),

  TURNSTILE_SITE_KEY: Env.schema.string.optional(),
  TURNSTILE_SECRET_KEY: Env.schema.string.optional(),
  HCAPTCHA_SITE_KEY: Env.schema.string.optional(),
  HCAPTCHA_SECRET_KEY: Env.schema.string.optional(),
  RECAPTCHA_SITE_KEY: Env.schema.string.optional(),
  RECAPTCHA_SECRET_KEY: Env.schema.string.optional(),
  CAPTCHA_SITE_KEY: Env.schema.string.optional(),
  CAPTCHA_SECRET_KEY: Env.schema.string.optional(),

  DISABLE_OFFLINE: Env.schema.string.optional(),

  /*
  |----------------------------------------------------------
  | Rate limiter (@adonisjs/limiter) + Redis store
  |----------------------------------------------------------
  */
  LIMITER_STORE: Env.schema.enum(['redis', 'memory'] as const),
  REDIS_HOST: Env.schema.string.optional(),
  REDIS_PORT: Env.schema.number.optional(),
  REDIS_PASSWORD: Env.schema.string.optional(),

  /**
   * Set to `false` to disable background jobs entirely (no Redis needed).
   * `enqueue()` then reports failure and callers fall back to their synchronous
   * path, so the app keeps working — emails just send in-request.
   */
  QUEUE_ENABLED: Env.schema.string.optional(),

  /*
  |----------------------------------------------------------
  | Outgoing mail (@adonisjs/mail, SMTP)
  |----------------------------------------------------------
  | These are the fallback. SMTP configured from Settings → Email is stored
  | encrypted in `mail_settings` and takes precedence when enabled.
  */
  SMTP_HOST: Env.schema.string.optional(),
  SMTP_PORT: Env.schema.number.optional(),
  /** `true` for implicit TLS (port 465). STARTTLS on 587 is negotiated anyway. */
  SMTP_SECURE: Env.schema.string.optional(),
  SMTP_USERNAME: Env.schema.string.optional(),
  SMTP_PASSWORD: Env.schema.string.optional(),
  MAIL_FROM_ADDRESS: Env.schema.string.optional(),
  MAIL_FROM_NAME: Env.schema.string.optional(),

  /** Comma-separated production CORS allowlist for the external API. */
  CORS_ALLOWED_ORIGINS: Env.schema.string.optional(),
})
