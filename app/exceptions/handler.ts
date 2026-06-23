import app from '@adonisjs/core/services/app'
import { type HttpContext, ExceptionHandler } from '@adonisjs/core/http'
import type { StatusPageRange, StatusPageRenderer } from '@adonisjs/core/types/http'
import { renderPage } from '#helpers/inertia_render'

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
    '404': (_, ctx) => {
      // Admin pages get the in-dashboard 404 (sidebar chrome); everything else
      // gets the public 404.
      const path = ctx.request.url()
      const page = path.startsWith('/admin') ? 'admin/not_found' : 'errors/not_found'
      return renderPage(ctx.inertia, page, { path })
    },
    '500..599': (_, ctx) => ctx.inertia.render('errors/server_error', {}),
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
