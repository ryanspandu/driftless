import { useEffect } from 'react'
import { usePage } from '@inertiajs/react'

/**
 * First-party analytics beacon.
 *
 * Rendered only on public surfaces (see `layout-shell`), so the admin is never
 * tracked. Fires once per page — on the initial load (including hydrated SSG
 * snapshots) and again on every Inertia SPA navigation (keyed on `page.url`).
 * Uses `sendBeacon` so it survives the page being unloaded mid-navigation.
 */
export function AnalyticsBeacon() {
  const { url } = usePage()

  useEffect(() => {
    if (typeof window === 'undefined') return
    // Belt-and-suspenders: this component only mounts on public surfaces, but
    // never record the admin area even if that ever changes.
    if (window.location.pathname.startsWith('/admin')) return

    const payload = JSON.stringify({
      path: window.location.pathname,
      referrer: document.referrer || null,
      title: document.title || null,
    })

    try {
      const blob = new Blob([payload], { type: 'application/json' })
      if (navigator.sendBeacon?.('/api/analytics/collect', blob)) return
    } catch {
      // fall through to fetch
    }
    void fetch('/api/analytics/collect', {
      method: 'POST',
      body: payload,
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
    }).catch(() => {})
  }, [url])

  return null
}
