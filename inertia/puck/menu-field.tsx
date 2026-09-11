import { useEffect, useMemo, useState } from 'react'
import { PanelSelect } from '~/puck/panel-select'
import type { AppSelectOption } from '~/components/ui/app-select'

/**
 * The MenuBar block's "Menu" picker — a Puck custom field. It fetches the menus
 * built in the Menu Manager and lets the author pick one, instead of typing a
 * handle by hand. Mirrors `CollectionSourceField`: a plain `fetch` (the editor
 * panel has no React Query provider) + a lazy `PanelSelect` (so react-select
 * never ships to the public page bundle). The stored value is the menu handle.
 */

interface MenuOption {
  handle: string
  name: string
}

function useMenusForField(): { menus: MenuOption[]; loaded: boolean } {
  const [menus, setMenus] = useState<MenuOption[]>([])
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    let alive = true
    fetch('/api/admin/menus', { headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        if (!alive) return
        setMenus(
          Array.isArray(d)
            ? (d as MenuOption[]).map((m) => ({ handle: m.handle, name: m.name }))
            : []
        )
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoaded(true)
      })
    return () => {
      alive = false
    }
  }, [])
  return { menus, loaded }
}

export function MenuHandleField({
  value,
  onChange,
}: {
  value?: string
  onChange: (value: string) => void
}) {
  const { menus, loaded } = useMenusForField()
  const opts = useMemo<AppSelectOption[]>(
    () => menus.map((m) => ({ value: m.handle, label: `${m.name} (${m.handle})` })),
    [menus]
  )
  // A handle that no longer matches any menu (renamed/deleted) is still shown so
  // it isn't silently dropped.
  const orphan = value && !menus.some((m) => m.handle === value)
  const options = orphan ? [...opts, { value, label: `${value} (missing)` }] : opts

  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">Menu</span>
      <PanelSelect
        value={value}
        onChange={onChange}
        options={options}
        placeholder={loaded && menus.length === 0 ? 'No menus yet' : 'Choose a menu…'}
        isClearable
      />
      {loaded && menus.length === 0 && (
        <span className="block text-[11px] leading-tight text-muted-foreground">
          Create a menu under Menus in the admin, then pick it here.
        </span>
      )}
    </label>
  )
}
