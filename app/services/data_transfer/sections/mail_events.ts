import MailEventSetting from '#models/mail_event_setting'
import { emptyReport, type DataSection } from '../registry.js'

/**
 * Per-email operator overrides (`mail_event_settings`): the enable toggle and the
 * editable copy (subject/heading/intro/button/outro) for each declared mail
 * event, plus the template wiring (`templateId` → a `templates` row, or a
 * `codeTemplate` kit pointer). Upserted by the natural key `key`.
 *
 * `templateId` is remapped through `ctx.idMap` (identity in preserve mode, the
 * template's new id in regenerate) — this runs at order 73, after the templates
 * section (40) has populated the map. A null content field means "use the
 * template default", so nulls travel verbatim.
 */
export const mailEventsSection: DataSection = {
  name: 'mail_events',
  owner: 'core',
  order: 73,
  label: 'Email content & toggles',
  tables: ['mail_event_settings'],

  async export() {
    const rows = await MailEventSetting.all()
    return {
      mail_events: rows.map((r) => ({
        key: r.key,
        enabled: r.enabled,
        subject: r.subject,
        heading: r.heading,
        intro: r.intro,
        buttonLabel: r.buttonLabel,
        outro: r.outro,
        templateId: r.templateId,
        codeTemplate: r.codeTemplate,
      })),
    }
  },

  async import(ctx, data) {
    const report = emptyReport('mail_events')
    const payload = (data ?? {}) as { mail_events?: Array<Record<string, unknown>> }
    for (const m of payload.mail_events ?? []) {
      const key = String(m.key ?? '')
      if (!key) continue
      try {
        const templateId = m.templateId ? String(m.templateId) : null
        const existing = await MailEventSetting.find(key)
        if (existing && ctx.conflict === 'skip') {
          report.skipped++
          continue
        }
        const values = {
          enabled: !!m.enabled,
          subject: (m.subject as string) ?? null,
          heading: (m.heading as string) ?? null,
          intro: (m.intro as string) ?? null,
          buttonLabel: (m.buttonLabel as string) ?? null,
          outro: (m.outro as string) ?? null,
          templateId: templateId ? (ctx.idMap.get(templateId) ?? templateId) : null,
          codeTemplate: (m.codeTemplate as string) ?? null,
        }
        if (existing) {
          existing.merge(values)
          await existing.save()
          report.updated++
        } else {
          await MailEventSetting.create({ key, ...values })
          report.created++
        }
      } catch (e) {
        report.warnings.push(`mail event "${key}": ${(e as Error).message}`)
      }
    }
    return report
  },
}
