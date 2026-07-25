import { useEffect } from 'react'
import { useAuthPublicConfig } from '~/hooks/api/use-auth'

/**
 * Applies the site-wide appearance (title, favicon) and custom `<meta>` tags to
 * non-builder public pages (landing, posts) client-side. Builder pages render the
 * same global meta server-side in `PublicPageView`, so this only covers the rest.
 */
export function PublicWebMeta() {
  const { data } = useAuthPublicConfig()
  const web = data?.web

  useEffect(() => {
    if (!web) return

    if (web.siteTitle?.trim()) {
      document.title = web.siteTitle.trim()
    }

    const href = web.faviconUrl?.trim() || '/logo.svg'

    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']")
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.href = href
  }, [web])

  // Site-wide custom <meta> tags (Website settings → Site & SEO).
  const metaTags = web?.metaTags
  useEffect(() => {
    if (!metaTags?.length) return
    const els = metaTags
      .map((m) => {
        const attr = m.name ? 'name' : m.property ? 'property' : null
        const key = m.name || m.property
        if (!attr || !key) return null
        const el = document.createElement('meta')
        el.setAttribute(attr, key)
        el.setAttribute('content', typeof m.content === 'string' ? m.content : '')
        el.setAttribute('data-global-meta', '')
        document.head.appendChild(el)
        return el
      })
      .filter((e): e is HTMLMetaElement => e !== null)
    return () => {
      for (const el of els) el.remove()
    }
  }, [metaTags])

  return null
}
