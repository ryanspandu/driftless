import { useEffect, useState } from 'react'
import { PanelSelect } from '~/puck/panel-select'
import type { AppSelectOption } from '~/components/ui/app-select'

/**
 * The "Saved form" picker on a Form Block. Lists the forms defined under Forms
 * and stores the chosen `slug`; picking one makes the block render that form's
 * fields itself (and validate against its schema on submit).
 */
export function FormPickerField({
  value,
  onChange,
}: {
  value?: string
  onChange: (value: string) => void
}) {
  const [forms, setForms] = useState<{ slug: string; title: string }[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    fetch('/api/admin/forms/definitions', { headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        if (!alive) return
        setForms(Array.isArray(d) ? d : [])
        setLoaded(true)
      })
      .catch(() => alive && setLoaded(true))
    return () => {
      alive = false
    }
  }, [])

  const options: AppSelectOption[] = forms.map((f) => ({ value: f.slug, label: f.title }))

  return (
    <div className="space-y-2">
      <PanelSelect
        value={value}
        onChange={onChange}
        options={options}
        placeholder={loaded && !forms.length ? 'No forms defined yet' : 'Pick a saved form…'}
        isClearable
      />
      <p className="text-xs text-muted-foreground">
        Pick a form built under <span className="font-medium">Forms</span> and its fields render here.
        Leave empty to place inputs by hand.
      </p>
    </div>
  )
}
