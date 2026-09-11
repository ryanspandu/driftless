/**
 * Known SMTP providers, so setting up outgoing email is pasting one secret
 * rather than looking up four values.
 *
 * A preset fills host, port, implicit-TLS and username — everything that is a
 * property of the provider rather than of the account. It never carries a
 * credential: those belong to the operator and are encrypted at rest
 * (`mail_settings.password_enc`).
 *
 * **Why Resend is the default.** The free tiers with the biggest allowances —
 * Brevo, Mailjet, SendPulse — all stamp their own branding on every message,
 * transactional ones included. A password-reset email carrying another
 * company's logo reads as phishing to the person receiving it, and puts a
 * stranger's brand on the operator's product. Resend's 100/day is roughly 3,000
 * password resets a month, far past what a CMS needs, and the message arrives
 * clean. Brevo is still offered for the case where volume genuinely outweighs
 * that.
 */
export interface SmtpPreset {
  id: string
  label: string
  /** One line under the picker: what the free tier gives, and any catch. */
  note: string
  host: string
  port: number
  /** Implicit TLS — true only for port 465-style ports. */
  secure: boolean
  /** Fixed for the provider (Resend), or empty when it is per-account. */
  username: string
  /** What to paste into the password field, in the provider's own words. */
  passwordHint: string
  /** Where to get it. */
  docsUrl?: string
}

export const SMTP_PRESET_CUSTOM = 'custom'

export const SMTP_PRESETS: SmtpPreset[] = [
  {
    id: 'resend',
    label: 'Resend',
    note: '3,000 emails/month, 100/day free. No provider branding on the message. Needs one verified domain.',
    host: 'smtp.resend.com',
    port: 587,
    secure: false,
    // Literally the string "resend" for every account — the API key is the password.
    username: 'resend',
    passwordHint: 'Your Resend API key (starts with re_)',
    docsUrl: 'https://resend.com/docs/send-with-smtp',
  },
  {
    id: 'smtp2go',
    label: 'SMTP2GO',
    note: '1,000/month, 200/day, free with no expiry. Sends before your domain is verified, capped at 25/hour until it is.',
    host: 'mail.smtp2go.com',
    port: 587,
    secure: false,
    username: '',
    passwordHint: 'The SMTP password from your SMTP2GO user',
    docsUrl: 'https://www.smtp2go.com/setupguide/smtp/',
  },
  {
    id: 'brevo',
    label: 'Brevo',
    note: '300/day (~9,000/month) free — the largest here, but every message carries a "Sent with Brevo" sticker, password resets included.',
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    username: '',
    passwordHint: 'Your Brevo SMTP key (not your account password)',
    docsUrl: 'https://help.brevo.com/hc/en-us/articles/7924908994450',
  },
  {
    id: 'mailpit',
    label: 'Mailpit / MailHog (local)',
    note: 'Catches mail on your machine instead of delivering it. No account, no credentials — the fastest way to see what an email looks like.',
    host: '127.0.0.1',
    port: 1025,
    secure: false,
    username: '',
    passwordHint: 'Leave blank — local catchers accept anything',
    docsUrl: 'https://mailpit.axllent.org',
  },
]

/** The preset a fresh install starts on. */
export const SMTP_DEFAULT_PRESET = 'resend'

export function findSmtpPreset(id: string): SmtpPreset | undefined {
  return SMTP_PRESETS.find((p) => p.id === id)
}

/**
 * Which preset a stored configuration corresponds to, or `custom`.
 *
 * Matched on host alone. Port and TLS are the parts an operator legitimately
 * varies (465 instead of 587 behind a firewall that blocks it), and treating
 * that as "custom" would drop them out of the preset for no reason.
 */
export function detectSmtpPreset(host: string | null | undefined): string {
  const h = (host ?? '').trim().toLowerCase()
  if (!h) return SMTP_DEFAULT_PRESET
  return SMTP_PRESETS.find((p) => p.host.toLowerCase() === h)?.id ?? SMTP_PRESET_CUSTOM
}
