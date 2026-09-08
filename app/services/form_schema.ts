/**
 * Form field types + the validators that turn a raw submission into clean,
 * whitelisted data.
 *
 * This is the single source of truth for what a form field can be, shared by the
 * admin write path (definition sanitising) and the public submit path
 * (validation). It is a **pure** module — no DB, no HTTP — so it is trivially
 * unit-testable and cannot leak request state.
 *
 * Unlike the legacy schema-less path (which accepts any field), a defined form
 * is a **whitelist**: only its declared keys are read from the payload, each is
 * coerced/validated by type, and `required` is enforced. `file` values are
 * opaque upload tokens — their existence/binding is checked by the service
 * (which has DB access), here we only enforce presence.
 */

export const FORM_FIELD_TYPES = [
  'text',
  'textarea',
  'email',
  'tel',
  'number',
  'date',
  'url',
  'select',
  'radio',
  'checkbox',
  'checkbox_group',
  'file',
] as const

export type FormFieldType = (typeof FORM_FIELD_TYPES)[number]

/** Types whose meaning depends on a fixed option list. */
export const OPTION_FIELD_TYPES: readonly FormFieldType[] = ['select', 'radio', 'checkbox_group']

export type FormFieldWidth = 'full' | 'half' | 'third'

export interface FormFieldDef {
  key: string
  label: string
  type: FormFieldType
  required?: boolean
  placeholder?: string
  help?: string
  /** For select / radio / checkbox_group. */
  options?: string[]
  width?: FormFieldWidth
  /** For number. */
  min?: number | null
  max?: number | null
  /** For file — a hint like `.pdf,image/*` (the server also enforces its own allow-list). */
  accept?: string
}

const MAX_VALUE_LEN = 5_000
const MAX_FIELDS = 50
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** Same key shape as CMS fields, and never `_`-prefixed (those are dropped as internal). */
export const FORM_KEY_RE = /^[a-z][a-z0-9_]{0,31}$/
const TEL_RE = /^[+\d][\d\s\-()]{2,31}$/
const WIDTHS: readonly FormFieldWidth[] = ['full', 'half', 'third']

function str(value: unknown): string {
  return String(value ?? '')
    .trim()
    .slice(0, MAX_VALUE_LEN)
}

function isBlank(value: unknown): boolean {
  if (value == null) return true
  if (Array.isArray(value)) return value.length === 0
  return String(value).trim() === ''
}

/** A valid calendar date in `yyyy-mm-dd` form. */
function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

/**
 * Validate a raw submission against a form's field schema.
 *
 * Returns cleaned `data` (only declared, valid, non-empty fields) and `errors`
 * keyed by field key. Unknown payload keys — including the honeypot and any
 * `_`-prefixed field — are ignored by construction (only declared keys are read).
 */
export function validateSubmission(
  fields: FormFieldDef[],
  raw: Record<string, unknown>
): { data: Record<string, unknown>; errors: Record<string, string> } {
  const data: Record<string, unknown> = {}
  const errors: Record<string, string> = {}

  for (const field of fields) {
    const { key, type, label } = field
    const required = Boolean(field.required)
    const rawVal = raw[key]
    const blank = isBlank(rawVal)

    const fail = (message: string) => {
      errors[key] = message
    }
    const requireMsg = `${label || key} is required`

    if (type === 'checkbox') {
      // A single consent-style box: truthy = ticked.
      const checked =
        rawVal === true || rawVal === 'true' || rawVal === 'on' || rawVal === '1' || rawVal === 1
      if (required && !checked) fail(requireMsg)
      else data[key] = checked
      continue
    }

    if (type === 'checkbox_group') {
      const arr = Array.isArray(rawVal) ? rawVal : blank ? [] : [rawVal]
      const values = arr.map((v) => str(v)).filter((v) => v !== '')
      const allowed = new Set(field.options ?? [])
      if (values.some((v) => !allowed.has(v))) fail(`${label || key} has an invalid choice`)
      else if (required && values.length === 0) fail(requireMsg)
      else if (values.length) data[key] = Array.from(new Set(values))
      continue
    }

    if (blank) {
      if (required) fail(requireMsg)
      continue
    }

    if (type === 'number') {
      const n = Number(str(rawVal))
      if (!Number.isFinite(n)) fail(`${label || key} must be a number`)
      else if (typeof field.min === 'number' && n < field.min) fail(`${label || key} is too small`)
      else if (typeof field.max === 'number' && n > field.max) fail(`${label || key} is too large`)
      else data[key] = n
      continue
    }

    const value = str(rawVal)
    switch (type) {
      case 'email':
        if (!EMAIL_RE.test(value)) fail(`${label || key} is not a valid email`)
        else data[key] = value
        break
      case 'url':
        if (!/^https?:\/\/[^\s]+$/i.test(value)) fail(`${label || key} is not a valid URL`)
        else data[key] = value
        break
      case 'tel':
        if (!TEL_RE.test(value)) fail(`${label || key} is not a valid phone number`)
        else data[key] = value
        break
      case 'date':
        if (!isValidDate(value)) fail(`${label || key} is not a valid date`)
        else data[key] = value
        break
      case 'select':
      case 'radio':
        if (!(field.options ?? []).includes(value)) fail(`${label || key} has an invalid choice`)
        else data[key] = value
        break
      case 'file':
        // The value is an upload token; the service checks it exists + binds it.
        data[key] = value
        break
      default: // text, textarea
        data[key] = value
    }
  }

  return { data, errors }
}

/**
 * Clean + validate a form definition's fields on the admin write path.
 *
 * Throws on a structurally invalid definition (bad key, unknown type, missing
 * options, duplicate key). Returns the normalised field list to store.
 */
export function sanitiseFormDefinition(input: unknown): FormFieldDef[] {
  if (!Array.isArray(input)) return []
  const out: FormFieldDef[] = []
  const seen = new Set<string>()

  for (const item of input.slice(0, MAX_FIELDS)) {
    const f = (item ?? {}) as Record<string, unknown>
    const key = String(f.key ?? '').trim()
    const type = String(f.type ?? '') as FormFieldType
    const label = String(f.label ?? '').trim()

    if (!FORM_KEY_RE.test(key)) throw new Error(`Invalid field key "${key}"`)
    if (seen.has(key)) throw new Error(`Duplicate field key "${key}"`)
    if (!FORM_FIELD_TYPES.includes(type)) throw new Error(`Unknown field type "${type}"`)
    if (!label) throw new Error(`Field "${key}" needs a label`)
    seen.add(key)

    const field: FormFieldDef = { key, label, type }
    if (f.required) field.required = true
    if (typeof f.placeholder === 'string' && f.placeholder.trim())
      field.placeholder = f.placeholder.trim().slice(0, 200)
    if (typeof f.help === 'string' && f.help.trim()) field.help = f.help.trim().slice(0, 300)
    const width = String(f.width ?? '') as FormFieldWidth
    if (WIDTHS.includes(width)) field.width = width

    if (OPTION_FIELD_TYPES.includes(type)) {
      const options = Array.isArray(f.options)
        ? f.options.map((o) => String(o ?? '').trim()).filter((o) => o !== '')
        : []
      if (!options.length) throw new Error(`Field "${key}" needs at least one option`)
      field.options = Array.from(new Set(options)).slice(0, 100)
    }
    if (type === 'number') {
      if (typeof f.min === 'number') field.min = f.min
      if (typeof f.max === 'number') field.max = f.max
    }
    if (type === 'file' && typeof f.accept === 'string' && f.accept.trim())
      field.accept = f.accept.trim().slice(0, 200)

    out.push(field)
  }

  return out
}
