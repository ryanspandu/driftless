import { DateTime } from 'luxon'
import MailEventSetting from '#models/mail_event_setting'
import MailDelivery, { type MailDeliveryStatus } from '#models/mail_delivery'
import Template from '#models/template'
import {
  applyMailVariables,
  getMailEvent,
  registeredMailEvents,
  type MailEvent,
  type MailEventCopy,
} from '#services/mail_events'
import { WebSettingsService } from '#services/settings_service'
import { newUlid } from '#services/ulid_service'

const webSettingsService = new WebSettingsService()

/**
 * The `EmailBody` block's marker element, as the builder renders it.
 *
 * Matched by its `data-email-body-slot` attribute rather than by its contents,
 * so restyling the placeholder in `email-config.tsx` cannot quietly stop the
 * order table being injected. `[\s\S]` because the element spans lines.
 */
const EMAIL_BODY_SLOT_PATTERN = /<div[^>]*data-email-body-slot[^>]*>[\s\S]*?<\/div>/gi

export interface MailEventDto extends MailEvent {
  /** Declared default merged with the operator's override. */
  enabled: boolean
  /** Whether an operator has changed anything, i.e. a row exists. */
  customised: boolean
  /** A designed EMAIL template, or null for the built-in layout. */
  templateId: string | null
  /** The operator's overrides only — null per field where none is set. */
  overrides: {
    subject: string | null
    heading: string | null
    intro: string | null
    buttonLabel: string | null
    outro: string | null
  }
}

/** Shared look, applied to every email. */
export interface MailBranding {
  logoUrl: string
  accentColor: string
  footerNote: string
}

const BRANDING_DEFAULTS: MailBranding = {
  logoUrl: '',
  // Matches the primary in `inertia/css/app.css`, as a literal hex — email
  // clients do not resolve `oklch()` or CSS variables.
  accentColor: '#4f39f6',
  footerNote: '',
}

export interface MailDeliveryDto {
  id: string
  eventKey: string | null
  eventLabel: string | null
  toAddress: string
  subject: string | null
  status: MailDeliveryStatus
  error: string | null
  createdAt: string
  completedAt: string | null
}

export default class MailEventsService {
  /** Every declared event with its effective settings applied. */
  async list(): Promise<MailEventDto[]> {
    const rows = await MailEventSetting.all()
    const overrides = new Map(rows.map((r) => [r.key, r]))

    return registeredMailEvents().map((event) => {
      const override = overrides.get(event.key)
      return {
        ...event,
        /**
         * A non-disableable event is always on, whatever a row says. The flag
         * is enforced here rather than only in the UI so that a stale row —
         * written while the event still allowed it — cannot keep a
         * password-reset email switched off forever.
         */
        enabled: event.canDisable ? (override?.enabled ?? event.defaultEnabled) : true,
        customised: Boolean(override),
        templateId: override?.templateId ?? null,
        overrides: {
          subject: override?.subject ?? null,
          heading: override?.heading ?? null,
          intro: override?.intro ?? null,
          buttonLabel: override?.buttonLabel ?? null,
          outro: override?.outro ?? null,
        },
      }
    })
  }

  /**
   * The copy to render for this email, with placeholders already substituted.
   *
   * Field-by-field: an operator who rewrote only the subject keeps the shipped
   * wording everywhere else, and gets any later improvement to it. `null` means
   * "not overridden"; `''` is a real value meaning "leave this part empty".
   */
  async copy(key: string, values: Record<string, unknown> = {}): Promise<MailEventCopy> {
    const event = getMailEvent(key)
    const defaults: MailEventCopy = event?.defaults ?? {
      subject: '',
      heading: '',
      intro: '',
      buttonLabel: '',
      outro: '',
    }

    const override = await MailEventSetting.find(key)
    const pick = (value: string | null | undefined, fallback: string) =>
      applyMailVariables(value ?? fallback, values)

    return {
      subject: pick(override?.subject, defaults.subject),
      heading: pick(override?.heading, defaults.heading),
      intro: pick(override?.intro, defaults.intro),
      buttonLabel: pick(override?.buttonLabel, defaults.buttonLabel),
      outro: pick(override?.outro, defaults.outro),
    }
  }

  /** Replace this event's copy. Pass `null` for a field to restore its default. */
  async setCopy(
    key: string,
    copy: Partial<Record<keyof MailEventCopy, string | null>>
  ): Promise<MailEventDto[]> {
    const event = getMailEvent(key)
    if (!event) throw new Error(`Unknown mail event "${key}"`)

    const row = (await MailEventSetting.find(key)) ?? new MailEventSetting()
    if (!row.$isPersisted) {
      row.key = key
      row.enabled = event.defaultEnabled
    }

    for (const field of ['subject', 'heading', 'intro', 'buttonLabel', 'outro'] as const) {
      if (copy[field] !== undefined) row[field] = copy[field]
    }
    await row.save()

    return this.list()
  }

  /**
   * The designed email body for this event, or null to use the built-in layout.
   *
   * Two substitutions happen here and nowhere else:
   *
   *  - `{{placeholders}}` in the operator's text, from `values`.
   *  - the `EmailBody` block's marker element, replaced by the service-composed
   *    HTML (the order table, the reset link). The operator can place that
   *    block but cannot author what goes in it, which is what stops a design
   *    change from shipping a receipt with no receipt in it.
   *
   * Returns null when the template was deleted or never published, so a missing
   * design degrades to the built-in email rather than to no email.
   */
  async renderedTemplate(
    key: string,
    values: Record<string, unknown> = {},
    bodyHtml = ''
  ): Promise<string | null> {
    const row = await MailEventSetting.find(key)
    if (!row?.templateId) return null

    const template = await Template.query()
      .where('id', row.templateId)
      .whereNull('deleted_at')
      .first()
    if (!template?.renderedHtml) return null

    return applyMailVariables(template.renderedHtml, values).replace(
      EMAIL_BODY_SLOT_PATTERN,
      bodyHtml
    )
  }

  /** Point an event at a designed template, or back at the built-in layout. */
  async setTemplate(key: string, templateId: string | null): Promise<MailEventDto[]> {
    const event = getMailEvent(key)
    if (!event) throw new Error(`Unknown mail event "${key}"`)

    if (templateId) {
      const template = await Template.query()
        .where('id', templateId)
        .whereNull('deleted_at')
        .first()
      if (!template) throw new Error('That template no longer exists')
      // A header template would render flex layout and Tailwind classes into
      // an inbox. Refused rather than silently ignored.
      if (template.type !== 'EMAIL') throw new Error('Only Email templates can be used here')
    }

    const row = (await MailEventSetting.find(key)) ?? new MailEventSetting()
    if (!row.$isPersisted) {
      row.key = key
      row.enabled = event.defaultEnabled
    }
    row.templateId = templateId
    await row.save()

    return this.list()
  }

  /** Logo, accent colour and footer note, shared by every email. */
  async branding(): Promise<MailBranding> {
    const sections = await webSettingsService.getMergedSections()
    const section = sections['email_branding'] ?? {}
    return {
      logoUrl: section['logo_url']?.trim() || BRANDING_DEFAULTS.logoUrl,
      accentColor: section['accent_color']?.trim() || BRANDING_DEFAULTS.accentColor,
      footerNote: section['footer_note']?.trim() || BRANDING_DEFAULTS.footerNote,
    }
  }

  /**
   * Whether this email should be sent at all.
   *
   * Unknown keys return true. An email that nothing declared is not something
   * an operator has switched off — it is something nobody has described yet,
   * and silently dropping it would be far worse than sending it.
   */
  async isEnabled(key: string): Promise<boolean> {
    const event = getMailEvent(key)
    if (!event) return true
    if (!event.canDisable) return true

    const row = await MailEventSetting.find(key)
    return row?.enabled ?? event.defaultEnabled
  }

  /** Turn one event on or off. Refuses for events that may not be disabled. */
  async setEnabled(key: string, enabled: boolean): Promise<MailEventDto[]> {
    const event = getMailEvent(key)
    if (!event) throw new Error(`Unknown mail event "${key}"`)
    if (!event.canDisable && !enabled) {
      throw new Error(`"${event.label}" cannot be switched off`)
    }

    const existing = await MailEventSetting.find(key)
    if (existing) {
      existing.enabled = enabled
      await existing.save()
    } else {
      await MailEventSetting.create({ key, enabled })
    }

    return this.list()
  }

  // ── Delivery log ─────────────────────────────────────────────────────────

  /**
   * Open a delivery row before the send is attempted.
   *
   * Written first, on purpose: a process that dies mid-send leaves a `queued`
   * row rather than no evidence at all, and "queued and never completed" is a
   * far more useful thing to find than silence.
   */
  async recordAttempt(input: {
    eventKey?: string | null
    toAddress: string
    subject?: string | null
  }): Promise<string> {
    const row = await MailDelivery.create({
      id: newUlid(),
      eventKey: input.eventKey ?? null,
      // Bounded to the column width; a malformed recipient must not throw
      // inside a mail path whose whole contract is that it never throws.
      toAddress: String(input.toAddress).slice(0, 320),
      subject: input.subject ? String(input.subject).slice(0, 512) : null,
      status: 'queued',
      error: null,
      completedAt: null,
    })
    return row.id
  }

  /** Close a delivery row. Never throws — logging must not break sending. */
  async completeAttempt(
    id: string | null,
    status: MailDeliveryStatus,
    error?: string | null
  ): Promise<void> {
    if (!id) return
    try {
      const row = await MailDelivery.find(id)
      if (!row) return
      row.status = status
      row.error = error ? String(error).slice(0, 2000) : null
      row.completedAt = DateTime.now()
      await row.save()
    } catch (err) {
      console.error('[mail] could not record delivery outcome', {
        id,
        error: (err as Error).message,
      })
    }
  }

  async recentDeliveries(limit = 50): Promise<MailDeliveryDto[]> {
    const rows = await MailDelivery.query()
      .orderBy('created_at', 'desc')
      .limit(Math.min(Math.max(limit, 1), 200))

    return rows.map((row) => ({
      id: row.id,
      eventKey: row.eventKey,
      eventLabel: row.eventKey ? (getMailEvent(row.eventKey)?.label ?? null) : null,
      toAddress: row.toAddress,
      subject: row.subject,
      status: row.status,
      error: row.error,
      createdAt: row.createdAt.toISO()!,
      completedAt: row.completedAt ? row.completedAt.toISO() : null,
    }))
  }
}
