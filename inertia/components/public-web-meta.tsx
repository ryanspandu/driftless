
import { useEffect } from 'react'
import { useAuthPublicConfig } from '~/hooks/api/use-auth'

export function PublicWebMeta() {
  const { data } = useAuthPublicConfig()

  useEffect(() => {
    const web = data?.web
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
  }, [data?.web])

  return null
}
