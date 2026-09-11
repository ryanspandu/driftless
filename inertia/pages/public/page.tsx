import type { FC } from 'react'
import { PublicPageView, type PublicPageData } from '~/puck/public-page-view'

/** CSR / PWA render mode — client-rendered, cached offline by Serwist. */
const PublicPage: FC<{ page: PublicPageData }> = ({ page }) => <PublicPageView page={page} />

export default PublicPage
