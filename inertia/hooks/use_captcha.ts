import { useEffect, useState } from 'react'
import type { PublicCaptchaConfig } from '~/types/api'

export type CaptchaFlow = 'forms' | 'discount'

/**
 * Fetches the public, module-agnostic CAPTCHA config (`GET
 * /api/captcha/config`) once and reports whether this flow needs a
 * challenge, along with the widget token as it arrives.
 *
 * Plain `fetch`, not the admin `apiFetch` — this runs on public pages
 * (including template-kit pages), and a public visitor hitting a 401 must
 * never bounce to `/login`. Mirrors
 * `modules/ecommerce/ui/storefront/_use_captcha.ts`, but reads the neutral
 * config endpoint instead of the ecommerce module's own `/api/shop/config`,
 * so any page — regardless of module — can use it.
 *
 * The server (the relevant controller) is the authority: it re-verifies the
 * token and fails closed. This hook only decides whether to render the
 * widget and whether to wait for a token before submitting; a config that
 * never loads (`null`) simply means "no challenge shown," and the server
 * still enforces its own rule.
 */
export function useCaptcha(flow: CaptchaFlow) {
  const [config, setConfig] = useState<PublicCaptchaConfig | null>(null)
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/captcha/config', { credentials: 'same-origin' })
      .then((r) => (r.ok ? (r.json() as Promise<PublicCaptchaConfig>) : null))
      .then((d) => alive && setConfig(d))
      .catch(() => alive && setConfig(null))
    return () => {
      alive = false
    }
  }, [])

  const flowKey = flow === 'forms' ? 'onForms' : 'onDiscount'
  const required = Boolean(config?.enabled && config[flowKey] && config.siteKey && config.provider)

  return {
    required,
    provider: config?.provider ?? null,
    siteKey: config?.siteKey ?? null,
    token,
    setToken,
  }
}
