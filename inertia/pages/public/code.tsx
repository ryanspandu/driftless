import type { FC } from 'react'
import { CodePageView } from '~/custom/code-page-view'
import type { CodePageEnvelope } from '~/custom/types'

/** CSR / PWA render mode for a hand-written page — client-rendered. */
const CodePage: FC<{ page: CodePageEnvelope }> = ({ page }) => <CodePageView page={page} />

export default CodePage
