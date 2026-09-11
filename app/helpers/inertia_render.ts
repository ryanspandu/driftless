import type { HttpContext } from '@adonisjs/core/http'

/** Typed inertia.render wrapper — page prop inference requires FC exports. */
export function renderPage(
  inertia: HttpContext['inertia'],
  page: string,
  props: Record<string, unknown> = {}
) {
  return inertia.render(page as never, props as never)
}
