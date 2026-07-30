import env from '#start/env'
import { defineConfig, transports } from '@adonisjs/mail'
import type { InferMailers } from '@adonisjs/mail/types'

/**
 * Mail configuration.
 *
 * This file only describes the **env-based fallback**. The effective transport
 * is normally resolved at run time by `app/services/mail_dispatcher.ts`, which
 * prefers SMTP credentials configured from the admin UI (stored encrypted in
 * `mail_settings`) and falls back to what is defined here.
 *
 * Why both: an operator installing Driftless should be able to configure email
 * from the dashboard without editing files or restarting, but a deployment that
 * would rather pin its credentials in the environment should not be forced
 * through a database row.
 */
const mailConfig = defineConfig({
  default: 'smtp',

  /**
   * Sender used when a message does not set its own. The dispatcher overrides
   * this with the admin-configured address when there is one.
   */
  from: {
    address: env.get('MAIL_FROM_ADDRESS', 'no-reply@driftless.local'),
    name: env.get('MAIL_FROM_NAME', 'Driftless'),
  },

  mailers: {
    smtp: transports.smtp({
      host: env.get('SMTP_HOST', 'localhost'),
      port: env.get('SMTP_PORT', 587),
      secure: env.get('SMTP_SECURE', 'false') === 'true',

      ...(env.get('SMTP_USERNAME')
        ? {
            auth: {
              type: 'login' as const,
              user: env.get('SMTP_USERNAME', ''),
              pass: env.get('SMTP_PASSWORD', ''),
            },
          }
        : {}),
    }),
  },
})

export default mailConfig

declare module '@adonisjs/mail/types' {
  export interface MailersList extends InferMailers<typeof mailConfig> {}
}
