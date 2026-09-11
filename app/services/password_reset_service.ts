import crypto from 'node:crypto'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import PasswordResetToken from '#models/password_reset_token'
import User from '#models/user'
import UserAuthService from '#services/user_auth_service'
import MailDispatcher from '#services/mail_dispatcher'
import EventMail from '#mails/event_mail'
import MailEventsService from '#services/mail_events_service'
import { WebSettingsService } from '#services/settings_service'
import { newUlid } from '#services/ulid_service'

const dispatcher = new MailDispatcher()
const webSettingsService = new WebSettingsService()
const mailEvents = new MailEventsService()

/** Declared in `mail_events.ts`; the key an operator's overrides hang off. */
const PASSWORD_RESET_EVENT = 'auth.password_reset'

/** How long a reset link stays usable. */
const TOKEN_TTL_MINUTES = 60

/** The reset URL is interpolated into HTML, so it must not be able to close a tag. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Everything the reset email renders. */
export interface PasswordResetContext {
  recipient: string
  name: string
  siteName: string
  resetUrl: string
  expiresInMinutes: number
}

/**
 * Password reset links.
 *
 * The plaintext token exists in exactly two places: the email that was sent and
 * the URL the recipient clicks. This table stores only its SHA-256, so a stolen
 * database dump yields hashes rather than working links.
 */
export default class PasswordResetService {
  /** 32 random bytes, url-safe. `Math.random()` is not acceptable here. */
  private mintToken(): { plain: string; hash: string } {
    const plain = crypto.randomBytes(32).toString('base64url')
    return { plain, hash: hashToken(plain) }
  }

  /**
   * Everything the email renders, or null when no link should be sent.
   *
   * Split from the sending so the context — most importantly the URL — can be
   * asserted in a test without an SMTP server, the same split
   * `OrderNotifierService` uses.
   */
  async buildReset(email: string): Promise<PasswordResetContext | null> {
    /**
     * Minted before we know whether the account exists, and unconditionally, so
     * both branches do the same crypto. This narrows the timing difference
     * rather than erasing it — the "found" branch still writes a row and queues
     * a job. The rate limit on the route is the real defence; this just avoids
     * handing out a free oracle.
     */
    const token = this.mintToken()

    const user = await UserAuthService.findByLogin(email)
    if (!user || user.status !== 'ACTIVE') return null

    /**
     * Requesting a new link invalidates any outstanding one. Otherwise a
     * forwarded or shoulder-surfed old email stays live for the rest of its
     * hour after the owner has already noticed and reset again.
     */
    await PasswordResetToken.query().where('user_id', user.id).whereNull('used_at').delete()

    await PasswordResetToken.create({
      id: newUlid(),
      userId: user.id,
      tokenHash: token.hash,
      expiresAt: DateTime.now().plus({ minutes: TOKEN_TTL_MINUTES }),
      usedAt: null,
    })

    const sections = await webSettingsService.getMergedSections()

    return {
      recipient: user.email,
      name: user.displayName,
      siteName: sections['site_meta']?.['site_title'] || 'Driftless',
      resetUrl: resetUrl(token.plain),
      expiresInMinutes: TOKEN_TTL_MINUTES,
    }
  }

  /**
   * Turn the reset context into a message, applying the operator's copy.
   *
   * The link is composed here as `bodyHtml` rather than being part of the
   * editable copy: an operator who deletes the wrong line must not be able to
   * ship a reset email with no way to reset anything.
   */
  private async buildMail(context: PasswordResetContext): Promise<EventMail> {
    const values = {
      siteName: context.siteName,
      name: context.name,
      expiresInMinutes: context.expiresInMinutes,
    }
    const bodyHtml = [
      `<p style="margin:0 0 16px 0; font-size:13px; color:#71717a;">`,
      `The link works once and expires in ${context.expiresInMinutes} minutes.`,
      ` If the button does not work, copy this address into your browser:`,
      `</p>`,
      `<p style="margin:0 0 16px 0; font-size:12px; line-height:1.5; word-break:break-all;`,
      ` font-family:ui-monospace,SFMono-Regular,Menlo,monospace; color:#3f3f46;">`,
      escapeHtml(context.resetUrl),
      `</p>`,
    ].join('')

    const [copy, branding, designed] = await Promise.all([
      mailEvents.copy(PASSWORD_RESET_EVENT, values),
      mailEvents.branding(),
      /**
       * A template designed in the builder, if one is wired up. Null — the
       * usual case — falls through to `emails/event.edge` below, so a deleted
       * or unpublished design degrades to the built-in email rather than to no
       * email at all.
       */
      mailEvents.renderedTemplate(PASSWORD_RESET_EVENT, values, bodyHtml),
    ])

    return new EventMail({
      designedHtml: designed,
      recipient: context.recipient,
      siteName: context.siteName,
      ...copy,
      buttonUrl: context.resetUrl,
      bodyHtml,
      logoUrl: branding.logoUrl,
      accentColor: branding.accentColor,
      footerNote: branding.footerNote,
      text: [
        copy.heading,
        '',
        copy.intro,
        '',
        context.resetUrl,
        '',
        `The link works once and expires in ${context.expiresInMinutes} minutes.`,
        '',
        copy.outro,
      ]
        .filter((line, i, all) => line !== '' || all[i - 1] !== '')
        .join('\n'),
    })
  }

  /**
   * Send a reset link, if there is an account to send one to.
   *
   * Returns nothing on purpose. The caller must not be able to tell a
   * registered address from an unregistered one, and the surest way to
   * guarantee that is to give it nothing to branch on.
   */
  async request(email: string): Promise<void> {
    try {
      const context = await this.buildReset(email)
      if (!context) return
      if (!(await dispatcher.isConfigured())) {
        console.error('[auth] password reset requested but email is not configured')
        return
      }
      await dispatcher.sendLater(await this.buildMail(context), {
        event: PASSWORD_RESET_EVENT,
      })
    } catch (error) {
      /**
       * Logged, never rethrown. A failure here must still produce the same
       * generic "check your inbox" response — an error page on one address and
       * a success page on another is the enumeration oracle we just avoided.
       */
      console.error('[auth] password reset failed', { error: (error as Error).message })
    }
  }

  /** The live token row for this plaintext, or null if it is unknown, spent or expired. */
  async verify(plain: string): Promise<PasswordResetToken | null> {
    if (!plain) return null

    const row = await PasswordResetToken.query().where('token_hash', hashToken(plain)).first()
    if (!row) return null
    if (row.usedAt) return null
    if (row.expiresAt <= DateTime.now()) return null

    return row
  }

  /**
   * Spend a token and set the new password.
   *
   * Returns false for any dead token, so the caller renders "this link has
   * expired" rather than a stack trace.
   */
  async consume(plain: string, newPassword: string): Promise<boolean> {
    const row = await this.verify(plain)
    if (!row) return false

    const user = await User.find(row.userId)
    if (!user || user.deletedAt || user.status !== 'ACTIVE') return false

    const trx = await db.transaction()
    try {
      row.useTransaction(trx)
      row.usedAt = DateTime.now()
      await row.save()

      user.useTransaction(trx)
      /**
       * Assigned in plaintext. `withAuthFinder`'s `beforeSave` hook hashes it
       * with scrypt; hashing here as well would store a hash of a hash and the
       * password could never be used again.
       */
      user.password = newPassword
      await user.save()

      /**
       * Every other outstanding link for this account dies too. If the reset
       * was prompted by a compromise, leaving a second live link is leaving the
       * door the attacker came through.
       */
      await PasswordResetToken.query({ client: trx })
        .where('user_id', user.id)
        .whereNot('id', row.id)
        .delete()

      await trx.commit()
      return true
    } catch (error) {
      await trx.rollback()
      throw error
    }
  }
}

export function hashToken(plain: string): string {
  return crypto.createHash('sha256').update(plain).digest('hex')
}

/**
 * The recipient-facing reset URL.
 *
 * Built from `APP_URL`, never from the incoming request's host: a Host header
 * is attacker-controlled, and that is precisely how a reset email ends up
 * pointing at someone else's server with a live token attached.
 */
export function resetUrl(token: string): string {
  const base = env.get('APP_URL', 'http://localhost:3333').replace(/\/+$/, '')
  return `${base}/reset-password/${encodeURIComponent(token)}`
}
