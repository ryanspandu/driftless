import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import MailSettingsService from '#services/mail_settings_service'
import MailDispatcher, { MailNotConfiguredError } from '#services/mail_dispatcher'
import TestMail from '#mails/test_mail'
import AuditLogService from '#services/audit_log_service'
import MailEventsService from '#services/mail_events_service'
import { WebSettingsService } from '#services/settings_service'
import { renderPage } from '#helpers/inertia_render'
import type User from '#models/user'

const updateValidator = vine.compile(
  vine.object({
    enabled: vine.boolean().optional(),
    host: vine.string().trim().maxLength(255).nullable().optional(),
    port: vine.number().min(1).max(65_535).nullable().optional(),
    secure: vine.boolean().optional(),
    username: vine.string().trim().maxLength(255).nullable().optional(),
    /**
     * Absent means "keep the stored password". An empty string clears it.
     * The admin UI only sends this when someone types a new value, so editing
     * the host does not silently wipe the credential.
     */
    password: vine.string().maxLength(512).nullable().optional(),
    fromAddress: vine.string().trim().email().maxLength(254).nullable().optional(),
    fromName: vine.string().trim().maxLength(128).nullable().optional(),
  })
)

const testValidator = vine.compile(
  vine.object({
    to: vine.string().trim().email().maxLength(254),
  })
)

const eventValidator = vine.compile(
  vine.object({
    enabled: vine.boolean().optional(),
    /**
     * `null` restores the shipped default; `''` is a real value meaning "leave
     * this part out". Both must survive validation, which is why every field is
     * `nullable().optional()` rather than merely optional.
     */
    subject: vine.string().maxLength(512).nullable().optional(),
    heading: vine.string().maxLength(255).nullable().optional(),
    intro: vine.string().maxLength(4000).nullable().optional(),
    buttonLabel: vine.string().maxLength(128).nullable().optional(),
    outro: vine.string().maxLength(4000).nullable().optional(),
    /** A designed EMAIL template, or null for the built-in layout. */
    templateId: vine.string().maxLength(64).nullable().optional(),
  })
)

const settingsService = new MailSettingsService()
const dispatcher = new MailDispatcher()
const webSettings = new WebSettingsService()
const audit = new AuditLogService()
const mailEvents = new MailEventsService()

export default class MailSettingsController {
  async page({ inertia }: HttpContext) {
    return renderPage(inertia, 'admin/settings/email', {})
  }

  async show({ response }: HttpContext) {
    return response.json(await settingsService.getDto())
  }

  /** Every declared email with its effective on/off state. */
  async events({ response }: HttpContext) {
    return response.json(await mailEvents.list())
  }

  async updateEvent(ctx: HttpContext) {
    const { params, request, response, auth } = ctx
    const key = String((params as Record<string, unknown>).key ?? '')
    const payload = await request.validateUsing(eventValidator)

    try {
      let list = await mailEvents.list()
      if (payload.enabled !== undefined) {
        list = await mailEvents.setEnabled(key, payload.enabled)
      }

      if (payload.templateId !== undefined) {
        list = await mailEvents.setTemplate(key, payload.templateId)
      }

      const { enabled: _enabled, templateId: _templateId, ...copy } = payload
      if (Object.keys(copy).length > 0) {
        list = await mailEvents.setCopy(key, copy)
      }

      await audit.record({
        actor: { type: 'user', user: auth.user as User },
        action: 'mail.event_updated',
        subjectType: 'mail_event',
        subjectId: key,
        changes: payload,
        ctx,
      })

      return response.json(list)
    } catch (error) {
      // Unknown key, or an attempt to disable something that may not be —
      // both are the caller's mistake, not a server fault.
      return response.status(422).json({ message: (error as Error).message })
    }
  }

  async deliveries({ request, response }: HttpContext) {
    const limit = Number(request.qs().limit ?? 50)
    return response.json(await mailEvents.recentDeliveries(Number.isFinite(limit) ? limit : 50))
  }

  async update(ctx: HttpContext) {
    const { request, response, auth } = ctx
    const payload = await request.validateUsing(updateValidator)
    const before = await settingsService.getDto()
    const dto = await settingsService.update(payload)

    await audit.record({
      actor: { type: 'user', user: auth.user as User },
      action: 'mail.settings_updated',
      subjectType: 'mail_settings',
      subjectId: 'default',
      // `password` is stripped by the audit sanitiser, but the diff is built
      // from the DTOs, which never carry it in the first place.
      changes: { before, after: dto },
      ctx,
    })

    return response.json(dto)
  }

  /**
   * Send a test message, synchronously.
   *
   * Deliberately not queued: the whole point is to tell the operator whether
   * the settings work, which means they have to wait for the real result. A
   * queued send would report success the moment it was accepted.
   */
  async sendTest(ctx: HttpContext) {
    const { request, response, auth } = ctx
    const { to } = await request.validateUsing(testValidator)

    const resolved = await settingsService.resolve()
    if (!resolved) {
      await settingsService.recordTest(false, 'Email is not configured.')
      return response.status(422).json({
        message: 'Email is not configured. Add SMTP details first.',
        reason: 'mail_not_configured',
      })
    }

    const sections = await webSettings.getMergedSections()
    const siteName = sections['site_meta']?.['site_title'] || 'Driftless'

    try {
      await dispatcher.send(
        new TestMail(to, {
          source: resolved.source,
          host: resolved.host,
          port: resolved.port,
          siteName,
        })
      )
      await settingsService.recordTest(true)

      await audit.record({
        actor: { type: 'user', user: auth.user as User },
        action: 'mail.test_sent',
        subjectType: 'mail_settings',
        subjectId: 'default',
        changes: { to, host: resolved.host, source: resolved.source },
        ctx,
      })

      return response.json({ ok: true, sentTo: to })
    } catch (error) {
      const message =
        error instanceof MailNotConfiguredError
          ? error.message
          : /**
             * SMTP errors are safe to show and genuinely useful ("Invalid
             * login", "connect ECONNREFUSED"): the operator is an admin
             * diagnosing their own relay, and the message contains no secret.
             * This is the deliberate exception to not echoing raw errors.
             */
            ((error as Error).message ?? 'Failed to send')

      await settingsService.recordTest(false, message)
      return response.status(422).json({ ok: false, message, reason: 'mail_send_failed' })
    }
  }
}
