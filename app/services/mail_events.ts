/**
 * The catalogue of emails this installation can send.
 *
 * Core owns the transport; whoever owns the *reason* an email exists declares
 * it here. A module registers its events from its `boot()` hook, the same way
 * it registers block resolvers and queue handlers — so core never names a
 * module, and a disabled module's events simply stop existing.
 *
 * Registration is what makes an email addressable: an operator can only toggle,
 * rewrite or re-template an email that something has declared. An email sent
 * without an event key still works, it is just invisible to those screens.
 */

export type MailEventTrigger = 'admin' | 'webhook' | 'cron' | 'visitor'

export interface MailEvent {
  /**
   * Stable identifier, `<owner>.<thing>` — e.g. `auth.password_reset`.
   *
   * Stored in `mail_event_settings.key` and on every delivery row, so renaming
   * one silently orphans an operator's customisations. Treat it as permanent.
   */
  key: string
  /** Owning module name, or 'core'. Groups the list; not a permission. */
  owner: string
  label: string
  /** One line: what causes this to be sent, in an operator's words. */
  description: string
  trigger: MailEventTrigger
  /**
   * Transactional email answers something the recipient did; marketing does
   * not. The distinction drives whether it may be switched off at all, and it
   * is the line consent law cares about.
   */
  category: 'transactional' | 'marketing'
  /**
   * Whether an operator may turn this off.
   *
   * False for anything that would break a flow the user is standing in — a
   * password reset with no email is a dead end with no way out of it.
   */
  canDisable: boolean
  defaultEnabled: boolean
  /**
   * The copy this email ships with.
   *
   * Lives on the declaration rather than in the database so that improving the
   * wording in a release reaches every installation that has not deliberately
   * overridden it. The editor shows these as placeholders.
   */
  defaults: MailEventCopy
  /**
   * Placeholders usable in the copy above, without braces — `['name']` means
   * `{{name}}` works. Declared so the editor can list them and so an operator
   * never has to guess; anything not declared is left as literal text.
   */
  variables: string[]
}

/** The operator-editable parts of an email. */
export interface MailEventCopy {
  subject: string
  heading: string
  intro: string
  buttonLabel: string
  outro: string
}

const events = new Map<string, MailEvent>()

/**
 * Declare an email.
 *
 * Throws on a duplicate key rather than overwriting: two owners claiming one
 * key would mean an operator's toggle silently governs the wrong message.
 */
export function registerMailEvent(event: MailEvent): void {
  if (events.has(event.key)) {
    throw new Error(`A mail event "${event.key}" is already registered`)
  }
  events.set(event.key, event)
}

export function getMailEvent(key: string): MailEvent | undefined {
  return events.get(key)
}

/** Every declared event, grouped-friendly: core first, then modules by name. */
export function registeredMailEvents(): MailEvent[] {
  return [...events.values()].sort((a, b) => {
    if (a.owner !== b.owner) {
      if (a.owner === 'core') return -1
      if (b.owner === 'core') return 1
      return a.owner.localeCompare(b.owner)
    }
    return a.label.localeCompare(b.label)
  })
}

/** Test seam, and what a module unregistering would need. */
export function clearMailEvents(): void {
  events.clear()
}

/** Core's own emails. Registered from `providers/mail_events_provider.ts`. */
export function registerCoreMailEvents(): void {
  registerMailEvent({
    key: 'auth.password_reset',
    owner: 'core',
    label: 'Password reset',
    description: 'Sent when someone asks for a reset link from the sign-in screen.',
    trigger: 'visitor',
    category: 'transactional',
    /**
     * Not disableable. Switching it off leaves the "forgot password" form
     * apparently working — it still reports that a link is on its way — while
     * locking every account out with no way back in.
     */
    canDisable: false,
    defaultEnabled: true,
    defaults: {
      subject: 'Reset your {{siteName}} password',
      heading: 'Reset your password',
      intro:
        'Hi {{name}}, someone asked to reset the password for your {{siteName}} account. Choose a new one with the button below.',
      buttonLabel: 'Choose a new password',
      outro:
        'If you did not ask for this, you can ignore this message — your password stays as it is.',
    },
    variables: ['siteName', 'name', 'expiresInMinutes'],
  })
}

/**
 * Substitute `{{name}}` placeholders.
 *
 * Unknown placeholders are left exactly as written rather than blanked. An
 * operator who mistypes `{{sitename}}` should see their typo in the email and
 * fix it — silently emitting an empty string turns a typo into a sentence with
 * a hole in it that nobody can explain.
 */
export function applyMailVariables(text: string, values: Record<string, unknown>): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (whole, key: string) => {
    const value = values[key]
    return value === undefined || value === null ? whole : String(value)
  })
}
