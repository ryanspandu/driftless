/**
 * Breadcrumb labels contributed by a module.
 *
 * A module drops `ui/labels.ts` exporting this and its admin pages get readable
 * crumbs. Core used to carry the list itself — ten `/admin/ecommerce/...`
 * entries hardcoded in `header.tsx` — which meant installing a module required
 * editing a core file, and an installer cannot do that.
 */
export interface ModulePageLabels {
  /** Exact pathname → label. Checked first, so a specific page beats a prefix. */
  exact?: Record<string, string>
  /**
   * Prefix rules for detail routes — `/admin/ecommerce/orders/` → "Order".
   * The longest matching prefix wins, so a nested section can override a
   * broader one whichever order the modules happen to load in.
   */
  prefix?: { path: string; label: string }[]
}

const contributions = import.meta.glob<{ default: ModulePageLabels }>(
  '../../modules/*/ui/labels.ts',
  { eager: true }
)

const exact: Record<string, string> = {}
const prefix: { path: string; label: string }[] = []

for (const mod of Object.values(contributions)) {
  const labels = mod?.default
  if (!labels) continue
  Object.assign(exact, labels.exact ?? {})
  prefix.push(...(labels.prefix ?? []))
}

// Longest first, so `/admin/shop/orders/` is tried before `/admin/shop/`.
prefix.sort((a, b) => b.path.length - a.path.length)

/** A module's label for this path, or `null` if no module claims it. */
export function modulePageLabel(pathname: string): string | null {
  if (exact[pathname]) return exact[pathname]

  for (const rule of prefix) {
    if (pathname.startsWith(rule.path)) return rule.label
  }

  return null
}
