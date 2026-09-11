import { useRef, useState } from 'react'
import type { FormFieldDef } from '~/types/api'

/**
 * Render a defined form's fields as themed, email-safe inputs for a public page.
 * Pure presentation: the enclosing `<form>` (in `FormBlockView`) owns submit; here
 * each field is a real `<input name=key>` so the parent reads values via FormData.
 *
 * checkbox_group repeats `name=key` (read with `getAll`); a `file` field uploads
 * on change and stores the returned token in a hidden `<input name=key>`.
 */

const INPUT_CLASS =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50'

function widthClass(width: FormFieldDef['width']): string {
  // 12-col row; collapses to full width on mobile.
  if (width === 'half') return 'col-span-12 sm:col-span-6'
  if (width === 'third') return 'col-span-12 sm:col-span-4'
  if (width === 'quarter') return 'col-span-12 sm:col-span-3'
  if (width === 'sixth') return 'col-span-6 sm:col-span-2'
  return 'col-span-12'
}

const TEXT_INPUT_TYPES: Record<string, string> = {
  text: 'text',
  email: 'email',
  tel: 'tel',
  url: 'url',
  number: 'number',
  date: 'date',
}

export function PublicFormFields({
  fields,
  errors,
}: {
  fields: FormFieldDef[]
  errors?: Record<string, string>
}) {
  return (
    <div className="grid grid-cols-12 gap-4">
      {fields.map((field) => (
        <div key={field.key} className={widthClass(field.width)}>
          <FieldControl field={field} error={errors?.[field.key]} />
        </div>
      ))}
    </div>
  )
}

function FieldControl({ field, error }: { field: FormFieldDef; error?: string }) {
  const req = field.required
  const errorNode = error ? (
    <p className="mt-1 text-sm text-destructive" data-field-error={field.key}>
      {error}
    </p>
  ) : null

  // Single checkbox: the label sits inline with the box.
  if (field.type === 'checkbox') {
    return (
      <div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name={field.key} value="true" required={req} className="mt-0.5" />
          <span>
            {field.label}
            {req ? <span className="text-destructive"> *</span> : null}
          </span>
        </label>
        {field.help ? <p className="mt-1 text-xs text-muted-foreground">{field.help}</p> : null}
        {errorNode}
      </div>
    )
  }

  const groupLabel = (
    <span className="mb-1 block text-sm font-medium">
      {field.label}
      {req ? <span className="text-destructive"> *</span> : null}
    </span>
  )

  let control: React.ReactNode
  if (field.type === 'textarea') {
    control = (
      <textarea
        name={field.key}
        rows={4}
        placeholder={field.placeholder}
        required={req}
        className={INPUT_CLASS}
      />
    )
  } else if (field.type === 'select') {
    control = (
      <select name={field.key} required={req} className={INPUT_CLASS} defaultValue="">
        <option value="" disabled={req}>
          {field.placeholder || 'Choose…'}
        </option>
        {(field.options ?? []).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    )
  } else if (field.type === 'radio') {
    control = (
      <div className="space-y-1.5">
        {(field.options ?? []).map((o) => (
          <label key={o} className="flex items-center gap-2 text-sm">
            <input type="radio" name={field.key} value={o} required={req} />
            {o}
          </label>
        ))}
      </div>
    )
  } else if (field.type === 'checkbox_group') {
    control = (
      <div className="space-y-1.5">
        {(field.options ?? []).map((o) => (
          <label key={o} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name={field.key} value={o} />
            {o}
          </label>
        ))}
      </div>
    )
  } else if (field.type === 'file') {
    control = <FileField field={field} />
  } else {
    control = (
      <input
        type={TEXT_INPUT_TYPES[field.type] ?? 'text'}
        name={field.key}
        placeholder={field.placeholder}
        required={req}
        min={field.type === 'number' && typeof field.min === 'number' ? field.min : undefined}
        max={field.type === 'number' && typeof field.max === 'number' ? field.max : undefined}
        className={INPUT_CLASS}
      />
    )
  }

  return (
    <div>
      {groupLabel}
      {control}
      {field.help ? <p className="mt-1 text-xs text-muted-foreground">{field.help}</p> : null}
      {errorNode}
    </div>
  )
}

/** Uploads on change to `/api/forms/upload`; the returned token goes in a hidden `name=key`. */
function FileField({ field }: { field: FormFieldDef }) {
  const [state, setState] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle')
  const [token, setToken] = useState('')
  const [name, setName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function xsrf(): string | undefined {
    const m =
      typeof document !== 'undefined' ? document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/) : null
    return m ? decodeURIComponent(m[1]!) : undefined
  }

  async function onChange(file: File | undefined) {
    if (!file) return
    setState('uploading')
    const body = new FormData()
    body.append('file', file)
    try {
      const res = await fetch('/api/forms/upload', {
        method: 'POST',
        headers: xsrf() ? { 'X-XSRF-TOKEN': xsrf()! } : {},
        credentials: 'same-origin',
        body,
      })
      if (!res.ok) {
        setState('error')
        setToken('')
        return
      }
      const data = (await res.json()) as { token: string; filename: string }
      setToken(data.token)
      setName(data.filename)
      setState('done')
    } catch {
      setState('error')
      setToken('')
    }
  }

  return (
    <div className="space-y-1">
      <input
        ref={inputRef}
        type="file"
        accept={field.accept || undefined}
        onChange={(e) => void onChange(e.target.files?.[0])}
        className="w-full text-sm"
      />
      {/* The value the form actually submits for this field. */}
      <input type="hidden" name={field.key} value={token} required={field.required} />
      {state === 'uploading' ? <p className="text-xs text-muted-foreground">Uploading…</p> : null}
      {state === 'done' ? <p className="text-xs text-emerald-600">Attached: {name}</p> : null}
      {state === 'error' ? (
        <p className="text-xs text-destructive">That file was not accepted (type or size).</p>
      ) : null}
    </div>
  )
}
