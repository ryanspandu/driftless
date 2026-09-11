import { lazy, Suspense } from 'react'
import type { CodeLang } from './custom-code'

/**
 * Lazy boundary around the CodeMirror editor — keeps the editor bundle out of the
 * SSR/public render path (mirrors how `rich-text-field.tsx` is lazy-loaded). Used
 * by the builder Settings dialog only.
 */
const CodeEditorInner = lazy(() => import('./code-editor-inner'))

export function CodeEditor(props: {
  language: CodeLang
  value: string
  onChange: (value: string) => void
  height?: string
}) {
  return (
    <Suspense
      fallback={
        <div className="flex h-40 items-center justify-center rounded-md border border-border bg-muted/30 text-sm text-muted-foreground">
          Loading editor…
        </div>
      }
    >
      <CodeEditorInner {...props} />
    </Suspense>
  )
}
