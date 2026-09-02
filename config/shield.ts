import env from '#start/env'
import type { HttpContext } from '@adonisjs/core/http'
import { defineConfig } from '@adonisjs/shield'

/**
 * In development the Vite dev server injects an inline `@vitejs/plugin-react`
 * preamble, serves HMR over a websocket, and applies inline styles. A strict
 * nonce-based CSP blocks all three (a nonce makes the browser ignore the inline
 * preamble entirely), which leaves the SPA unmounted and the page blank.
 *
 * These relaxations apply ONLY when NODE_ENV=development; production keeps the
 * strict nonce-based policy below.
 */
const isDev = env.get('NODE_ENV') === 'development'

const scriptSrc = isDev
  ? [
      "'self'",
      "'unsafe-inline'",
      'https://accounts.google.com',
      'https://www.google.com',
      'https://hcaptcha.com',
      'https://js.hcaptcha.com',
    ]
  : [
      "'self'",
      '@nonce',
      'https://accounts.google.com',
      'https://www.google.com',
      'https://hcaptcha.com',
      'https://js.hcaptcha.com',
    ]

// `fonts.googleapis.com` lets the operator-selected Google Font stylesheet load
// on public pages; the font files it references come from `fonts.gstatic.com`,
// already covered by the `https:` in `fontSrc` below.
const styleSrc = isDev
  ? ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com']
  : ["'self'", '@nonce', 'https://fonts.googleapis.com']

const connectSrc = isDev
  ? [
      "'self'",
      'ws://localhost:*',
      'http://localhost:*',
      'https://accounts.google.com',
      'https://www.google.com',
    ]
  : ["'self'", 'https://accounts.google.com', 'https://www.google.com']

const shieldConfig = defineConfig({
  /**
   * Configure CSP policies for your app. Refer documentation
   * to learn more.
   */
  csp: {
    /**
     * Enable the Content-Security-Policy header.
     */
    enabled: true,

    /**
     * Per-resource CSP directives.
     */
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      scriptSrc,
      scriptSrcAttr: ["'none'"],
      styleSrc,
      // Puck uses React style attributes extensively. These cannot execute JS,
      // and are kept separate from style elements (which require a nonce).
      styleSrcAttr: ["'unsafe-inline'"],
      imgSrc: ["'self'", 'https:', 'data:'],
      fontSrc: ["'self'", 'https:', 'data:'],
      connectSrc,
      frameSrc: [
        "'self'",
        'https://www.youtube.com',
        'https://player.vimeo.com',
        'https://www.google.com',
        'https://maps.google.com',
        'https://www.facebook.com',
        'https://open.spotify.com',
      ],
      formAction: ["'self'"],
    },

    /**
     * Report violations without blocking resources.
     */
    reportOnly: false,
  },

  /**
   * Configure CSRF protection options. Refer documentation
   * to learn more.
   */
  csrf: {
    /**
     * Enable CSRF token verification for state-changing requests.
     */
    enabled: env.get('NODE_ENV') !== 'test',

    /**
     * Route patterns to exclude from CSRF checks.
     *
     * - `/api/v1/*` — the external token-authed API uses Bearer tokens, not
     *   cookies, so CSRF does not apply.
     * - `/api/webhooks/*` — payment gateways cannot send a CSRF token and have
     *   no session to protect. These routes authenticate by verifying the
     *   provider's signature over the raw request body instead, which is
     *   strictly stronger than a CSRF token for this purpose.
     */
    exceptRoutes: (ctx: HttpContext) => {
      const url = ctx.request.url()
      return (
        url.startsWith('/api/v1/') ||
        url.startsWith('/api/webhooks/') ||
        // The analytics beacon is fired by anonymous visitors (often via
        // sendBeacon, which can't set headers) and only ever inserts one row.
        url.startsWith('/api/analytics/')
      )
    },

    /**
     * Expose an encrypted XSRF-TOKEN cookie for frontend HTTP clients.
     */
    enableXsrfCookie: true,

    /**
     * HTTP methods protected by CSRF validation.
     */
    methods: ['POST', 'PUT', 'PATCH', 'DELETE'],
  },

  /**
   * Control how your website should be embedded inside
   * iframes.
   */
  xFrame: {
    /**
     * Enable the X-Frame-Options header.
     */
    enabled: true,

    /**
     * Block all framing attempts. Default value is DENY.
     */
    action: 'DENY',
  },

  /**
   * Force browser to always use HTTPS.
   */
  hsts: {
    /**
     * Enable the Strict-Transport-Security header.
     */
    enabled: true,

    /**
     * HSTS policy duration remembered by browsers.
     */
    maxAge: '180 days',
  },

  /**
   * Disable browsers from sniffing content types and rely only
   * on the response content-type header.
   */
  contentTypeSniffing: {
    /**
     * Enable X-Content-Type-Options: nosniff.
     */
    enabled: true,
  },
})

export default shieldConfig
