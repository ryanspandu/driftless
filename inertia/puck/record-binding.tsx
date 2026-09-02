import { createContext, useContext, type ReactNode } from 'react'

/**
 * Per-record binding for the CollectionList repeater.
 *
 * A CollectionList in "custom template" mode renders its designed item slot once
 * per published record. Each render is wrapped in this context carrying that
 * record's field values, and token-aware leaf blocks (Text, Heading, Button,
 * Image) substitute `{{fieldKey}}` placeholders in their strings against it.
 *
 * There is no global token system in the builder — this is scoped entirely to
 * inside a repeater. Outside one (`null` context), tokens are left untouched.
 */
export interface RecordContextValue {
  fields: Record<string, unknown>
  /** In the editor, an unresolved token stays visible (`{{title}}`); live, it blanks. */
  editing: boolean
}

export const RecordContext = createContext<RecordContextValue | null>(null)

export function useRecordContext(): RecordContextValue | null {
  return useContext(RecordContext)
}

/**
 * The collection a whole document is designed against.
 *
 * Inside a page, a block learns its collection from the CollectionList it sits
 * in. A COLLECTION template has no such ancestor — the entire document *is* the
 * item card — so the templates builder provides the scope here and the Settings
 * tab falls back to it when no enclosing list is found.
 */
export const CollectionScopeContext = createContext<string | null>(null)

export function useCollectionScope(): string | null {
  return useContext(CollectionScopeContext)
}

const TOKEN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

/** Replace `{{key}}` tokens in a string with the record's field values. */
export function applyRecordTokens(
  input: string,
  fields: Record<string, unknown>,
  editing: boolean
): string {
  return input.replace(TOKEN, (whole, key: string) => {
    const v = fields[key]
    if (v == null || v === '') return editing ? whole : ''
    return String(v)
  })
}

/** True when a string carries at least one `{{token}}`. */
export function hasTokens(input: string): boolean {
  TOKEN.lastIndex = 0
  return TOKEN.test(input)
}

/**
 * Substitutes tokens in string children when inside a repeater; a passthrough
 * otherwise. Used for element *content* (Text/Heading). Attribute binding
 * (href/src) is done directly in the block's view component instead.
 */
export function Bound({ children }: { children?: ReactNode }): ReactNode {
  const ctx = useRecordContext()
  if (!ctx || typeof children !== 'string') return children
  return applyRecordTokens(children, ctx.fields, ctx.editing)
}

/** Resolve tokens in an arbitrary string against the current record (or return it). */
export function useBoundString(input: string | undefined): string {
  const ctx = useRecordContext()
  const v = input ?? ''
  if (!ctx) return v
  return applyRecordTokens(v, ctx.fields, ctx.editing)
}

// ── Explicit field binding (Webflow-style "Get X from field") ────────────────
//
// A block stores `binding: { <slot>: <fieldKey> }`. When it renders inside a
// repeater and a slot is bound, that slot's value comes straight from the
// record's field — the block's own static value is ignored. This is the primary,
// dropdown-driven binding; the `{{token}}` path above stays as an escape hatch.

/** The block prop shape for field bindings, e.g. `{ text: 'title', href: 'slug' }`. */
export type Binding = Record<string, string | undefined>

/**
 * Resolve a bound slot to its record value. Returns:
 *  - the field value (string) when bound and present,
 *  - a `[field]` placeholder in the editor when bound but empty (so the author
 *    sees which field feeds it),
 *  - `undefined` when the slot is not bound (caller falls back to static),
 *  - `null` when bound but there is no record context at all.
 */
export function useBoundField(fieldKey: string | undefined): string | null | undefined {
  const ctx = useRecordContext()
  if (!fieldKey) return undefined
  if (!ctx) return null
  const v = ctx.fields[fieldKey]
  if (v == null || v === '') return ctx.editing ? `[${fieldKey}]` : ''
  return String(v)
}

/**
 * Element text content: the bound field value when a slot is bound and in a
 * repeater, else the static text (with `{{token}}` support). Use for
 * Text/Heading/Paragraph children.
 */
export function FieldOrText({
  field,
  children,
}: {
  field?: string
  children?: ReactNode
}): ReactNode {
  const bound = useBoundField(field)
  // undefined = not bound; null = bound but outside a collection → static fallback.
  if (bound == null) return <Bound>{children}</Bound>
  return bound
}

/** One conditional-visibility rule: show the element only when the field passes. */
export interface VisibilityCondition {
  field: string
  op: 'set' | 'notset'
}

/** Read `conditions` off a loose props bag. */
export function readConditions(value: unknown): VisibilityCondition[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (c): c is VisibilityCondition =>
      !!c && typeof c === 'object' && typeof (c as VisibilityCondition).field === 'string'
  )
}

/**
 * Whether conditional-visibility rules hide this element for the current record.
 * Only meaningful inside a repeater; with no record context nothing is hidden.
 * All rules must pass (AND), mirroring Webflow's default.
 */
export function useConditionallyHidden(conditions: VisibilityCondition[]): boolean {
  const ctx = useRecordContext()
  if (!ctx || !conditions.length) return false
  return conditions.some((c) => {
    if (!c.field) return false // an unconfigured rule never hides
    const raw = ctx.fields[c.field]
    const isSet = raw != null && String(raw).trim() !== ''
    return c.op === 'set' ? !isSet : isSet
  })
}
