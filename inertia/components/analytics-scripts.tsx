
import { useEffect } from 'react'
import { useAuthPublicConfig } from '~/hooks/api/use-auth'

function injectScript(id: string, src?: string, inline?: string) {
  if (document.getElementById(id)) return
  const el = document.createElement('script')
  el.id = id
  if (src) {
    el.src = src
    el.async = true
  }
  if (inline) el.textContent = inline
  document.head.appendChild(el)
}

export function AnalyticsScripts() {
  const { data } = useAuthPublicConfig()
  const ga = data?.analytics?.googleAnalytics
  const cl = data?.analytics?.microsoftClarity

  useEffect(() => {
    if (!ga?.enabled || !ga.measurementId) return
    const id = encodeURIComponent(ga.measurementId)
    injectScript(
      'ga4-inline',
      undefined,
      `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config',${JSON.stringify(ga.measurementId)});`
    )
    injectScript('ga4-loader', `https://www.googletagmanager.com/gtag/js?id=${id}`)
  }, [ga?.enabled, ga?.measurementId])

  useEffect(() => {
    if (!cl?.enabled || !cl.projectId) return
    injectScript(
      'ms-clarity',
      undefined,
      `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window, document, "clarity", "script", ${JSON.stringify(cl.projectId)});`
    )
  }, [cl?.enabled, cl?.projectId])

  return null
}
