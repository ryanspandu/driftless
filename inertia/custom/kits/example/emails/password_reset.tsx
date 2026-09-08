import { EmailRoot, EmailHeading, EmailText, EmailBody, EmailSpacer } from '~/custom/email_kit'
import type { EmailVars } from '~/custom/email_kit'

/**
 * A code EMAIL template — the coded twin of a Puck-designed email.
 *
 * The filename is the template's name; a page-less pointer `codetpl:example/email/password_reset`
 * wires it to a mail event under Settings → Email → Notifications → Design. It is
 * flattened to inline-styled HTML at build time and string-substituted at send.
 *
 * This one is written for the **Password reset** event, whose variables are
 * `siteName`, `name` and `expiresInMinutes` (rendered as `{{siteName}}` etc. in
 * the output, filled in when the email is sent). A designed/coded email shows
 * only the `subject` copy field and its own baked-in text — the heading, intro
 * and closing note here are the template's, not the Notifications copy fields.
 *
 * `<EmailBody/>` marks where the service drops the actual reset-link button; the
 * template places it but never authors it.
 */
export default function PasswordResetEmail({ siteName, name, expiresInMinutes }: EmailVars) {
  return (
    <EmailRoot>
      <EmailHeading>Reset your password</EmailHeading>
      <EmailText>
        Hi {name}, we got a request to reset the password for your {siteName} account. Use the
        button below to choose a new one.
      </EmailText>

      <EmailBody />

      <EmailText color="#71717a">
        This link expires in {expiresInMinutes} minutes. If you didn’t ask to reset your password,
        you can safely ignore this email — your current password still works.
      </EmailText>

      <EmailSpacer height={8} />
      <EmailText color="#a1a1aa">— The {siteName} team</EmailText>
    </EmailRoot>
  )
}
