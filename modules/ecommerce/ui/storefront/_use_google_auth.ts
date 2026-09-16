import { useEffect, useState } from 'react'
import { shopApi, type PublicGoogleAuthConfig } from './_api'

/**
 * Fetches the public Google sign-in config once and reports whether the
 * storefront should show a "Continue with Google" button.
 *
 * Mirrors `useStorefrontCaptcha`'s shape. The server (the new
 * `google_auth_controller.ts#start` route) is the authority — it re-checks
 * `googleAuthEnabledForShop` itself, so a config that never loads simply means
 * "no button shown", nothing more.
 */
export function useStorefrontGoogleAuth() {
  const [config, setConfig] = useState<PublicGoogleAuthConfig | null>(null)

  useEffect(() => {
    let alive = true
    shopApi
      .config()
      .then((d) => alive && setConfig(d.google))
      .catch(() => alive && setConfig(null))
    return () => {
      alive = false
    }
  }, [])

  return { enabled: Boolean(config?.enabled) }
}
