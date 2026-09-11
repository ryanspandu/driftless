import { useEffect, useState } from 'react'
import { shopApi, type PublicCaptchaConfig } from './_api'

type Flow = 'onLogin' | 'onRegister' | 'onCheckout'

/**
 * Fetches the public CAPTCHA config once and reports whether this flow needs a
 * challenge, along with the widget token as it arrives.
 *
 * The server (the storefront controllers) is the authority — it re-verifies the
 * token and fails closed. This only decides whether to render the widget and
 * whether the submit button should wait for a token, so a config that never
 * loads (`null`) simply means "no challenge shown", and the server still
 * enforces its own rule.
 */
export function useStorefrontCaptcha(flow: Flow) {
  const [config, setConfig] = useState<PublicCaptchaConfig | null>(null)
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    shopApi
      .config()
      .then((d) => alive && setConfig(d.captcha))
      .catch(() => alive && setConfig(null))
    return () => {
      alive = false
    }
  }, [])

  const required = Boolean(config?.enabled && config[flow] && config.siteKey && config.provider)

  return {
    required,
    provider: config?.provider ?? null,
    siteKey: config?.siteKey ?? null,
    token,
    setToken,
  }
}
