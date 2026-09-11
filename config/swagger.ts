import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/**
 * App root (config/ → ..), with a trailing slash because adonis-autoswagger
 * concatenates `path + 'app'` internally.
 */
const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * adonis-autoswagger configuration.
 *
 * Consumed by the dev-only `/api/openapi` (spec) + `/api/docs` (Scalar UI) routes
 * in `start/routes.ts`. Schemas are auto-derived from Lucid models +
 * `app/validators/*`; richer per-endpoint request/response detail comes from
 * JSDoc `@`-annotations in controllers, added incrementally.
 *
 * `tagIndex: 2` groups endpoints by the 2nd path segment — e.g. `/api/admin/...`
 * → "admin", `/api/public/...` → "public", `/api/v1/...` → "v1". Tunable.
 */
export default {
  path: appRoot + '/',
  title: 'Driftless API',
  version: '1.0.0',
  description: 'JSON API surface (`/api/*`) for the Driftless monolith. Dev-only documentation.',
  tagIndex: 2,
  snakeCase: true,
  // The spec route already filters to `/api/*` and drops the doc routes; this is
  // a belt-and-suspenders guard.
  ignore: ['/api/docs', '/api/openapi'],
  preferredPutPatch: 'PUT',
  common: {
    parameters: {},
    headers: {},
  },
  securitySchemes: {
    cookieAuth: {
      type: 'apiKey',
      in: 'cookie',
      name: 'adonis-session',
      description: 'First-party session cookie (current admin/public API auth).',
    },
    bearerAuth: {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'token',
      description: 'Reserved for the planned external token-authenticated API (/api/v1).',
    },
  },
}
