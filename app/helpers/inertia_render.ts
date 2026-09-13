import type { HttpContext } from '@adonisjs/core/http'

/** Typed inertia.render wrapper — page prop inference requires FC exports. */
export function renderPage(
  inertia: HttpContext['inertia'],
  page: string,
  props: Record<string, unknown> = {},
  /**
   * Locals for the root edge view itself (`resources/views/inertia_layout.edge`),
   * as opposed to `props` (Inertia page props, sent to the React component). The
   * favicon `<link>` needs to be right in the initial HTML — before any React
   * code runs — which page props can't do.
   */
  viewProps?: Record<string, unknown>
) {
  return inertia.render(page as never, props as never, viewProps)
}
