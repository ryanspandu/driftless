import type { FC } from 'react'
import { CodePageView } from '~/custom/code-page-view'
import type { CodePageEnvelope } from '~/custom/types'

/**
 * SSR / SSG render mode for a hand-written page.
 *
 * This component name is allowlisted in `config/inertia.ts` (`ssr.pages`), which
 * is an exact-match array — which is exactly why the custom component is looked
 * up inside `CodePageView` rather than being named by Inertia. One wrapper name
 * covers every code page; naming them individually would mean editing the
 * allowlist for each new file.
 */
const CodePageSsr: FC<{ page: CodePageEnvelope }> = ({ page }) => <CodePageView page={page} />

export default CodePageSsr
