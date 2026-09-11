import { useEffect, useState } from 'react'
import { createUsePuck } from '@measured/puck'
import type { CollectionSource } from '~/puck/collection-list'
import { PanelSelect } from '~/puck/panel-select'
import type { AppSelectOption } from '~/components/ui/app-select'

/**
 * The "Template" picker on a Collection List in *Select template* mode.
 *
 * Lists COLLECTION templates bound to the list's own collection — a card
 * designed against `posts` binds `posts` fields, so offering it on a `team`
 * list would render blanks. When there is none yet, the picker becomes the
 * shortcut to make one: a link into the Templates area with the create dialog
 * pre-filled (type + collection), opened in a new tab so the page draft here
 * is not lost, plus a Refresh to pick it up on return.
 */

interface CollectionTemplateMeta {
  id: string
  name: string
  type: string
  collectionKey: string | null
}

const usePuckStore = createUsePuck()

const linkCls =
  'inline-flex items-center rounded-md border border-input px-2 py-1 text-xs font-medium hover:bg-muted'

function useCollectionTemplates(refresh: number): {
  items: CollectionTemplateMeta[]
  loaded: boolean
} {
  const [items, setItems] = useState<CollectionTemplateMeta[]>([])
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    let alive = true
    fetch('/api/admin/templates?type=COLLECTION', { headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        if (!alive) return
        setItems(Array.isArray(d) ? (d as CollectionTemplateMeta[]) : [])
        setLoaded(true)
      })
      .catch(() => {
        if (alive) setLoaded(true)
      })
    return () => {
      alive = false
    }
  }, [refresh])
  return { items, loaded }
}

export function CollectionTemplateField({
  value,
  onChange,
}: {
  value?: string
  onChange: (value: string) => void
}) {
  // The block whose fields are open is the Collection List itself; its own
  // collection scopes which templates apply. A custom field only receives its
  // own value, so the sibling props come from the store.
  const selected = usePuckStore((s) => s.selectedItem)
  const props = selected?.props as { source?: CollectionSource; template?: string } | undefined
  const collectionKey = props?.source?.collectionKey
  const mode = props?.template ?? 'template'

  const [refresh, setRefresh] = useState(0)
  const { items, loaded } = useCollectionTemplates(refresh)

  // The panel prints the field's label itself; an empty row under it would
  // read as broken, so say why nothing is here.
  if (mode !== 'template') {
    return (
      <p className="text-xs text-muted-foreground">
        Not used — Item design is {mode === 'custom' ? 'Custom' : 'the built-in card'}.
      </p>
    )
  }

  if (!collectionKey) {
    return (
      <p className="text-xs text-muted-foreground">
        Select a collection first, then pick its template.
      </p>
    )
  }

  const matching = items.filter((t) => t.collectionKey === collectionKey)
  const createHref = `/admin/templates?new=COLLECTION&collection=${encodeURIComponent(collectionKey)}`
  // The saved template may have been deleted, or belong to a collection this
  // list no longer uses — keep it selectable so the operator sees what is set.
  const stale = value && !matching.some((t) => t.id === value)
  const options: AppSelectOption[] = [
    ...matching.map((t) => ({ value: t.id, label: t.name })),
    ...(stale ? [{ value, label: `Missing template (${value})` }] : []),
  ]

  return (
    <div className="space-y-2">
      <PanelSelect
        value={value}
        onChange={onChange}
        options={options}
        placeholder={loaded && !matching.length ? 'No template yet' : 'Select template…'}
        isClearable
      />
      {loaded && !matching.length ? (
        <p className="text-xs text-muted-foreground">
          No template designed for <span className="font-medium">{collectionKey}</span> yet.
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <a href={createHref} target="_blank" rel="noopener noreferrer" className={linkCls}>
          Create template
        </a>
        <button type="button" className={linkCls} onClick={() => setRefresh((n) => n + 1)}>
          Refresh
        </button>
      </div>
    </div>
  )
}
