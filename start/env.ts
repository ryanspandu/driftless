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
  APP_URL: Env.schema.string({ format: 'url', tld: false }),

  SESSION_DRIVER: Env.schema.enum(['cookie', 'memory', 'database'] as const),

  DATABASE_URL: Env.schema.string(),

  SETTINGS_ENCRYPTION_KEY: Env.schema.string.optional(),
  JWT_SECRET: Env.schema.string.optional(),

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
})
