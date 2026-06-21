import type { FC } from 'react'
import { PublicPageView, type PublicPageData } from '~/puck/public-page-view'

/**
 * SSR / SSG render mode — this component name is allowlisted in
 * `config/inertia.ts` (`ssr.pages`), so AdonisJS server-renders it. Identical
 * output to the CSR variant; the difference is server rendering + (for SSG)
 * cache headers set by the controller.
 */
const PublicPageSsr: FC<{ page: PublicPageData }> = ({ page }) => <PublicPageView page={page} />

export default PublicPageSsr
