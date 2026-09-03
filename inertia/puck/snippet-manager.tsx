import { useState, type ReactNode } from 'react'
import { ChevronLeft, Code2, Plus, Trash2 } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Switch } from '~/components/ui/switch'
import { cn } from '~/lib/utils'
import { CodeEditor } from './code-editor'
import { newSnippet, type CodeLang, type CodeSnippet } from './custom-code'

/**
 * List-first manager for a set of CSS/JS snippets — shared by the builder's
 * "Page code" (per-page) and "Global code" (site-wide) sections. Holds only the
 * editor open/close state; the snippet array is owned by the caller (`onChange`).
 * Opening shows the list; the CodeMirror editor appears only when you Add/open one.
 */
export function SnippetManager({
  snippets,
  onChange,
  title,
  description,
}: {
  snippets: CodeSnippet[]
  onChange: (next: CodeSnippet[]) => void
  /** Omit when the surrounding chrome (e.g. the settings dialog header) shows it. */
  title?: string
  description: ReactNode
}) {
  const [editingId, setEditingId] = useState<string | null>(null)

  const add = (lang: CodeLang) => {
    const s = newSnippet(lang)
    onChange([...snippets, s])
    setEditingId(s.id)
  }
  const patch = (id: string, p: Partial<CodeSnippet>) =>
    onChange(snippets.map((s) => (s.id === id ? { ...s, ...p } : s)))
  const remove = (id: string) => {
    onChange(snippets.filter((s) => s.id !== id))
    if (editingId === id) setEditingId(null)
  }

  const editing = editingId ? snippets.find((s) => s.id === editingId) : undefined

  if (editing) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b p-3 pr-12">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => setEditingId(null)}
            aria-label="Back"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <LangBadge lang={editing.lang} />
          <Input
            value={editing.name}
            onChange={(e) => patch(editing.id, { name: e.target.value })}
            placeholder="Snippet name"
            className="h-8 max-w-xs"
          />
          <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            Enabled
            <Switch
              checked={editing.enabled}
              onCheckedChange={(v) => patch(editing.id, { enabled: v })}
            />
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-3">
          <CodeEditor
            language={editing.lang}
            value={editing.code}
            onChange={(code) => patch(editing.id, { code })}
            height="100%"
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b p-4">
        {title ? <h3 className="text-sm font-semibold">{title}</h3> : null}
        <p className={cn('text-sm text-muted-foreground', title && 'mt-1')}>{description}</p>
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => add('css')}>
            <Plus className="size-4" /> Add CSS
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => add('js')}>
            <Plus className="size-4" /> Add JS
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {snippets.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
            <Code2 className="size-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No snippets yet. Add CSS or JS to get started.
            </p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {snippets.map((s) => (
              <li
                key={s.id}
                className="group flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2"
              >
                <Switch checked={s.enabled} onCheckedChange={(v) => patch(s.id, { enabled: v })} />
                <button
                  type="button"
                  onClick={() => setEditingId(s.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <LangBadge lang={s.lang} />
                  <span
                    className={cn(
                      'truncate text-sm',
                      !s.enabled && 'text-muted-foreground line-through'
                    )}
                  >
                    {s.name || (s.lang === 'css' ? 'Untitled CSS' : 'Untitled script')}
                  </span>
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7"
                  onClick={() => setEditingId(s.id)}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground hover:text-destructive"
                  onClick={() => remove(s.id)}
                  aria-label="Delete snippet"
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function LangBadge({ lang }: { lang: CodeLang }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        lang === 'css'
          ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
          : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
      )}
    >
      {lang}
    </span>
  )
}
