import app from '@adonisjs/core/services/app'
import env from '#start/env'
import { defineConfig } from '@adonisjs/cors'

/**
 * Production allowlist for cross-origin clients of the external API. Set
 * `CORS_ALLOWED_ORIGINS` to a comma-separated list of origins
 * (e.g. `https://app.example.com,https://other.example.com`).
 */
const prodOrigins = (env.get('CORS_ALLOWED_ORIGINS', '') ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

/**
 * Configuration options to tweak the CORS policy. The following
 * options are documented on the official documentation website.
 *
 * https://docs.adonisjs.com/guides/security/cors
 */
const corsConfig = defineConfig({
  /**
   * Enable or disable CORS handling globally.
   */
  enabled: true,

  /**
   * In development, allow every origin to simplify local front/backend setup.
   * In production, use the explicit allowlist from `CORS_ALLOWED_ORIGINS`
   * (empty by default, so no cross-origin browser access until configured).
   */
  origin: app.inDev ? true : prodOrigins,

  /**
   * HTTP methods accepted for cross-origin requests.
   */
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE'],

  /**
   * Reflect request headers by default. Use a string array to restrict
   * allowed headers.
   */
  headers: true,

  /**
   * Response headers exposed to the browser.
   */
  exposeHeaders: [],

  /**
   * Allow cookies/authorization headers on cross-origin requests.
   */
  credentials: true,

  /**
   * Cache CORS preflight response for N seconds.
   */
  maxAge: 90,
})

export default corsConfig
