import app from '@adonisjs/core/services/app'
import { type HttpContext, ExceptionHandler } from '@adonisjs/core/http'
import type { StatusPageRange, StatusPageRenderer } from '@adonisjs/core/types/http'
import { renderPage } from '#helpers/inertia_render'
import AuthPageOverrideService, { type OverrideSlot } from '#services/auth_page_override_service'
import PageRenderer from '#services/page_renderer'

const overrides = new AuthPageOverrideService()
const renderer = new PageRenderer()

/**
 * Render a designated builder page for an error screen, or `null` to fall back.
 *
 * Everything is inside one `try`, and that is load-bearing rather than
 * defensive habit: this runs on the 500 path, a 500 is very often a database
 * that has gone away, and both the lookup and the render need the database. An
 * unguarded call here turns one failure into a loop and the visitor gets
 * nothing at all.
 *
 * `skipSnapshot` because the page is being served at some other URL entirely —
 * caching that output under the page's own id would then serve an error screen
 * at the page's real address.
 */
async function renderErrorOverride(
  slot: OverrideSlot,
  ctx: HttpContext,
  status: number
): Promise<unknown | null> {
  try {
    const page = await overrides.resolve(slot)
    if (!page) return null
    ctx.response.status(status)
    return await renderer.render(page, ctx, { skipSnapshot: true })
  } catch (error) {
    console.error('[errors] error page override failed', { slot, error: (error as Error).message })
    return null
  }
}

export default class HttpExceptionHandler extends ExceptionHandler {
  /**
   * In debug mode, the exception handler will display verbose errors
   * with pretty printed stack traces.
   */
  protected debug = !app.inProduction

  /**
   * Custom status pages for browser and Inertia requests in all environments.
   */
  protected renderStatusPages = true

  protected ignoreStatuses = [404]

  /**
   * Status pages is a collection of error code range and a callback
   * to return the HTML contents to send as a response.
   */
  protected statusPages: Record<StatusPageRange, StatusPageRenderer> = {
    '404': async (_, ctx) => {
      // Admin pages get the in-dashboard 404 (sidebar chrome); everything else
      // gets the public 404. The admin branch deliberately has no override —
      // an operator who mistypes a URL should keep their sidebar.
      const path = ctx.request.url()
      if (path.startsWith('/admin')) {
        return renderPage(ctx.inertia, 'admin/not_found', { path })
      }

      const override = await renderErrorOverride('notFound', ctx, 404)
      if (override !== null) return override

      return renderPage(ctx.inertia, 'errors/not_found', { path })
    },
    '500..599': async (_, ctx) => {
      const override = await renderErrorOverride('serverError', ctx, 500)
      if (override !== null) return override

      return ctx.inertia.render('errors/server_error', {})
    },
  }

  /**
   * The method is used for handling errors and returning
   * response to the client
   */
  async handle(error: unknown, ctx: HttpContext) {
    const httpError = this.toHttpError(error)

    if (httpError.status === 404 && ctx.request.url().startsWith('/api/')) {
      return ctx.response.status(404).json({ message: 'Not found' })
    }

    return super.handle(error, ctx)
  }

  /**
   * The method is used to report error to the logging service or
   * the a third party error monitoring service.
   *
   * @note You should not attempt to send a response from this method.
   */
  async report(error: unknown, ctx: HttpContext) {
    return super.report(error, ctx)
  }
}
