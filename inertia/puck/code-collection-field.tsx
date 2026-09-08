import { useEffect, useState } from 'react'
import { createUsePuck } from '@measured/puck'
import type { CollectionSource } from '~/puck/collection-list'
import { PanelSelect } from '~/puck/panel-select'
import type { AppSelectOption } from '~/components/ui/app-select'

/**
 * The "Code template" picker on a Collection List in *Code template* mode. Lists
 * kit `collection/<collectionKey>.tsx` components bound to the list's collection
 * (the filename is the key), offering `codetpl:<kit>/collection/<key>` values.
 */

interface CodeCollectionMeta {
  kit: string
  collectionKey: string
}

const usePuckStore = createUsePuck()

function useCodeCollections(): { items: CodeCollectionMeta[]; loaded: boolean } {
  const [items, setItems] = useState<CodeCollectionMeta[]>([])
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    let alive = true
    fetch('/api/admin/pages/collection-templates', { headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        if (!alive) return
        setItems(Array.isArray(d) ? d : [])
        setLoaded(true)
      })
      .catch(() => alive && setLoaded(true))
    return () => {
      alive = false
    }
  }, [])
  return { items, loaded }
}

export function CodeCollectionField({
  value,
  onChange,
}: {
  value?: string
  onChange: (value: string) => void
}) {
  const selected = usePuckStore((s) => s.selectedItem)
  const props = selected?.props as { source?: CollectionSource; template?: string } | undefined
  const collectionKey = props?.source?.collectionKey
  const mode = props?.template ?? 'builtin'
  const { items, loaded } = useCodeCollections()

  if (mode !== 'code') {
    return (
      <p className="text-xs text-muted-foreground">
        Not used — Item design is not a code template.
      </p>
    )
  }
  if (!collectionKey) {
    return (
      <p className="text-xs text-muted-foreground">
        Select a collection first, then pick a code template.
      </p>
    )
  }

  const matching = items.filter((t) => t.collectionKey === collectionKey)
  const options: AppSelectOption[] = matching.map((t) => ({
    value: `codetpl:${t.kit}/collection/${t.collectionKey}`,
    label: `${t.kit} · code`,
  }))

  return (
    <div className="space-y-2">
      <PanelSelect
        value={value}
        onChange={onChange}
        options={options}
        placeholder={loaded && !matching.length ? 'No code template' : 'Select code template…'}
        isClearable
      />
      {loaded && !matching.length ? (
        <p className="text-xs text-muted-foreground">
          No kit ships a <span className="font-medium">collection/{collectionKey}.tsx</span>{' '}
          component.
        </p>
      ) : null}
    </div>
  )
}
