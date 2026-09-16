export type TitleFormat = 'suffix' | 'prefix' | 'none'

/** Shared by app.tsx and ssr.tsx so the client and SSR <title> stay in sync. */
export function formatPageTitle(title: string, appName: string, format: TitleFormat): string {
  if (!title) return appName
  if (format === 'none') return title
  if (format === 'prefix') return `${appName} - ${title}`
  return `${title} - ${appName}`
}
