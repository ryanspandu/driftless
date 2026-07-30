import env from '#start/env'
import type { HttpContext } from '@adonisjs/core/http'
import { defineConfig } from '@adonisjs/shield'

const shieldConfig = defineConfig({
  /**
   * Configure CSP policies for your app. Refer documentation
   * to learn more.
   */
  csp: {
    /**
     * Enable the Content-Security-Policy header.
     */
    enabled: false,

    /**
     * Per-resource CSP directives.
     */
    directives: {},

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
      return url.startsWith('/api/v1/') || url.startsWith('/api/webhooks/')
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
