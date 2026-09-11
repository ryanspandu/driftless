import { Plus, Trash2 } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { AppSelect } from '~/components/ui/app-select'

/** One custom `<meta>` tag — exactly one of name/property is set. */
export interface MetaTag {
  name?: string
  property?: string
  content?: string
}

/**
 * Free-form list of `<meta>` rows (each: name|property + content). Shared by the
 * per-page SEO section (builder Settings dialog) and the site-wide Website
 * settings page.
 */
export function MetaTagsEditor({
  tags,
  onChange,
  label = 'Custom meta tags',
}: {
  tags: MetaTag[]
  onChange: (tags: MetaTag[]) => void
  label?: string
}) {
  const update = (i: number, p: Partial<MetaTag>) =>
    onChange(tags.map((t, idx) => (idx === i ? { ...t, ...p } : t)))
  const add = () => onChange([...tags, { name: '', content: '' }])
  const remove = (i: number) => onChange(tags.filter((_, idx) => idx !== i))

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <Button type="button" size="sm" variant="outline" className="h-7 gap-1.5" onClick={add}>
          <Plus className="size-3.5" /> Add
        </Button>
      </div>
      {tags.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          None. Add any tag, e.g. <code>twitter:card</code> or <code>theme-color</code>.
        </p>
      ) : (
        <div className="space-y-2">
          {tags.map((t, i) => {
            const kind: 'name' | 'property' = t.property != null && t.name == null ? 'property' : 'name'
            const key = kind === 'property' ? (t.property ?? '') : (t.name ?? '')
            return (
              <div key={i} className="flex items-center gap-1.5">
                <AppSelect
                  value={kind}
                  onChange={(v) =>
                    update(i, v === 'property' ? { property: key, name: undefined } : { name: key, property: undefined })
                  }
                  options={[
                    { value: 'name', label: 'name' },
                    { value: 'property', label: 'property' },
                  ]}
                  isSearchable={false}
                  size="sm"
                  className="w-28 shrink-0"
                />
                <Input
                  value={key}
                  placeholder={kind === 'property' ? 'og:type' : 'twitter:card'}
                  onChange={(e) =>
                    update(i, kind === 'property' ? { property: e.target.value } : { name: e.target.value })
                  }
                  className="h-9 min-w-0 flex-1"
                />
                <Input
                  value={t.content ?? ''}
                  placeholder="content"
                  onChange={(e) => update(i, { content: e.target.value })}
                  className="h-9 min-w-0 flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => remove(i)}
                  aria-label="Remove meta tag"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
