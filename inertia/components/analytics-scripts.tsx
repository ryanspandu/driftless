import { useEffect } from 'react'
import { usePage } from '@inertiajs/react'
import { useAuthPublicConfig } from '~/hooks/api/use-auth'

function injectScript(id: string, src?: string, inline?: string, nonce?: string) {
  if (document.getElementById(id)) return
  const el = document.createElement('script')
  el.id = id
  if (src) {
    el.src = src
    el.async = true
  }
  if (inline) el.textContent = inline
  // Production CSP is a strict nonce-based script-src (no 'unsafe-inline') — an
  // inline script with no nonce is silently dropped by the browser. Mirrors
  // `public-page-frame.tsx`'s identical fix for site-wide custom-code snippets.
  if (nonce) el.setAttribute('nonce', nonce)
  document.head.appendChild(el)
}

export function AnalyticsScripts() {
  const { data } = useAuthPublicConfig()
  const { cspNonce } = usePage<{ cspNonce?: string }>().props
  const ga = data?.analytics?.googleAnalytics
  const cl = data?.analytics?.microsoftClarity

  useEffect(() => {
    if (!ga?.enabled || !ga.measurementId) return
    const id = encodeURIComponent(ga.measurementId)
    injectScript(
      'ga4-inline',
      undefined,
      `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config',${JSON.stringify(ga.measurementId)});`,
      cspNonce
    )
    injectScript('ga4-loader', `https://www.googletagmanager.com/gtag/js?id=${id}`)
  }, [ga?.enabled, ga?.measurementId, cspNonce])

  useEffect(() => {
    if (!cl?.enabled || !cl.projectId) return
    injectScript(
      'ms-clarity',
      undefined,
      `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window, document, "clarity", "script", ${JSON.stringify(cl.projectId)});`,
      cspNonce
    )
  }, [cl?.enabled, cl?.projectId, cspNonce])

  return null
}
