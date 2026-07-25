import CodeMirror from '@uiw/react-codemirror'
import { css } from '@codemirror/lang-css'
import { javascript } from '@codemirror/lang-javascript'
import { oneDark } from '@codemirror/theme-one-dark'
import { useTheme } from 'next-themes'
import type { CodeLang } from './custom-code'

/**
 * CodeMirror 6 editor — the heavy part, kept behind a `lazy()` boundary
 * (`code-editor.tsx`) so it never lands in the SSR/public bundle and only loads
 * when the builder's Settings dialog opens an editor. Default export so `lazy`
 * can import it directly.
 */
const LANG_EXT = { css, javascript } as const

export default function CodeEditorInner({
  language,
  value,
  onChange,
  height = '340px',
}: {
  language: CodeLang
  value: string
  onChange: (value: string) => void
  height?: string
}) {
  const { resolvedTheme } = useTheme()
  const ext = language === 'css' ? LANG_EXT.css() : LANG_EXT.javascript()

  return (
    <CodeMirror
      value={value}
      height={height}
      theme={resolvedTheme === 'dark' ? oneDark : 'light'}
      extensions={[ext]}
      onChange={onChange}
      basicSetup={{
        lineNumbers: true,
        highlightActiveLine: true,
        bracketMatching: true,
        closeBrackets: true,
        autocompletion: true,
        foldGutter: true,
        indentOnInput: true,
      }}
      className="overflow-hidden rounded-md border border-border text-[13px]"
    />
  )
}
