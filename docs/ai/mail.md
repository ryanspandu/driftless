# Mail

Outgoing transactional email — order receipts, download links, password resets.
`@adonisjs/mail` over SMTP, configured either from the admin UI (encrypted at rest) or from
environment variables.

> Core infrastructure, not e-commerce-specific.
>
> **Note:** the e-commerce module's Edge templates physically live in core, at
> `resources/views/emails/`, not in the module folder — `find modules -name '*.edge'` returns
> nothing. That contradicts the "a module is a folder and nothing outside it" rule in
> [modules.md](./modules.md); supporting per-module view paths is unfinished work, not a
> deliberate exception.

## Two sources of configuration

`MailSettingsService.resolve()` picks, in order:

1. **Database** — `mail_settings` (single row, id `default`), when `enabled` is on and a
   host is set. Edited from Settings → Email.
2. **Environment** — `SMTP_HOST` and friends.

Neither present means email is simply _not configured_: sends fail with a clear message
rather than silently going nowhere.

### Provider presets

Settings → Email has a **Provider** picker
([`inertia/lib/smtp-presets.ts`](../../inertia/lib/smtp-presets.ts)) that fills host, port and
implicit-TLS, so setting up mail is pasting one secret rather than looking up four values. It
carries no credentials — those are the operator's, and are encrypted at rest.

| Preset | Free tier | Catch |
|---|---|---|
| **Resend** (default) | 3,000/month, 100/day | Needs one verified domain. Username is the literal string `resend`; the password is the API key |
| SMTP2GO | 1,000/month, 200/day, no expiry | Capped at 25/hour until the domain is verified |
| Brevo | 300/day (~9,000/month) | Every message carries a "Sent with Brevo" sticker |
| Mailpit / MailHog | — | Local catcher; shows mail in a UI instead of delivering it |

**Why Resend and not the bigger allowances.** Brevo, Mailjet and SendPulse all have larger
free tiers, and all three stamp their own branding on every message — transactional ones
included. A password-reset email carrying another company's logo reads as phishing to the
person receiving it, and puts a stranger's brand on the operator's product. Resend's 100/day
is roughly 3,000 password resets a month, well past what a CMS needs, and the message arrives
clean. Brevo is still in the list for the case where volume genuinely outweighs that.

The picker is presentation only: the stored configuration is still just host/port/credentials,
and `detectSmtpPreset` labels it by matching the host on load. Typing a host by hand switches
the label to Custom rather than leaving it claiming a provider the settings no longer point
at.

An operator installing Driftless should be able to set email up from the dashboard without
editing files or restarting; a deployment that prefers to pin credentials in the
environment should not be forced through a database row. Hence both.

## Why credentials are not in `web_settings`

`web_settings.value` is a plaintext `text` column. The SMTP password lives in
`mail_settings.password_enc`, AES-256-GCM via [`config/encryption.ts`](../../config/encryption.ts),
bound to the purpose `mail_settings` so the ciphertext cannot be moved to another column
and decrypted there.

The `_enc` suffix marks ciphertext columns throughout this codebase. The plaintext never
leaves the server — the admin API returns `passwordMasked` and `hasPasswordInDb`, and a
functional test walks the whole response body asserting the secret is absent at any depth.

Omitting `password` from an update keeps the stored value; sending `''` clears it. Without
that distinction, editing the host would silently wipe the password.

## Sending

[`MailDispatcher`](../../app/services/mail_dispatcher.ts) builds a `Mailer` at run time from
whatever the current settings describe, cached on the resolved values — so changing a
setting takes effect on the next send, with no restart and no invalidation call to forget.

```ts
const dispatcher = new MailDispatcher()
await dispatcher.send(mail) // now, in this request — the caller waits for the result
await dispatcher.sendLater(mail) // queued; falls back to an inline send if the queue is down
```

Use `sendLater` for everything except the "send test email" button, where the whole point is
to report the real outcome.

`sendLater` routes through a messenger that pushes the **compiled** message
(`{ message, views }` — plain JSON) onto BullMQ. The worker rebuilds the transport from
current settings rather than trusting the payload, so a credential rotated while a job sat
in the queue takes effect.

If the queue is unreachable, the message is sent inline instead of dropped. A delayed
receipt is bad; a lost one is worse.

## Mail events — what can be sent, and whether it is

Every email is **declared**, in [`app/services/mail_events.ts`](../../app/services/mail_events.ts).
Core registers its own from `providers/mail_events_provider.ts`; a module registers its own from
its `boot()` hook, exactly as it does block resolvers — so core never names a module, and a
disabled module's emails disappear from the screen rather than leaving dead toggles behind.

```ts
registerMailEvent({
  key: 'ecommerce.order_confirmation',   // permanent: overrides hang off it
  owner: 'ecommerce', label: '…', description: '…',
  trigger: 'webhook', category: 'transactional',
  canDisable: true, defaultEnabled: true,
  defaults: { subject, heading, intro, buttonLabel, outro },
  variables: ['siteName', 'number', 'total'],
})
```

Passing `{ event }` to `send`/`sendLater` is what makes an email governable:

```ts
await dispatcher.sendLater(mail, { event: 'auth.password_reset' })
```

The dispatcher then checks the toggle and opens a delivery row. An email sent with no `event`
is never suppressed — something nobody has described yet is not something an operator switched
off, and dropping it silently would be far worse than sending it.

`canDisable: false` is enforced in the service, not just the UI. A password reset that could be
switched off leaves the forgot-password form reporting success while every account is locked
out; a stale row from before the flag changed cannot resurrect that.

### Editing the copy

Settings → Email → Notifications. Subject, heading, opening paragraph, button label and closing
note are editable per email, with `{{placeholders}}` from the event's declared `variables`.

- Resolution is **field by field**: rewriting the subject keeps the shipped wording everywhere
  else, and keeps getting improvements to it.
- `null` restores a field's default; `''` is a real value meaning "leave this part out". Blank
  inputs in the editor show the default as a placeholder, so "not overridden" is visible.
- An unknown placeholder is left **as written**. An operator who typed `{{sitename}}` should see
  their typo and fix it; blanking it leaves a sentence with a hole nobody can explain.
- What the email exists to carry — the reset link, the order table, the tracking number — is
  composed by the service and is not editable. A template that could drop the link would break
  the flow it exists to serve.

Logo, button colour and footer note are site-wide (`web_settings` section `email_branding`),
because a logo that differs between the receipt and the password reset reads as one of them
being forged.

### The delivery log

`mail_deliveries` records recipient, subject and outcome — never the body, which can hold a live
reset token and an order's contents. Both transactional senders swallow their errors on purpose
(a paid order stays paid whether or not the receipt went out), so before this a dead relay was a
console line in a process nobody watches.

**`queued` is not success.** The row is opened before the send and closed by the worker, so rows
stuck at `queued` mean `npm run worker` is not running.

## Designing an email in the page builder

A template of type `EMAIL` (Templates → Emails) is designed with a **separate block set**,
[`inertia/puck/email-config.tsx`](../../inertia/puck/email-config.tsx) — about a dozen blocks
emitting table markup with literal inline styles.

**The page blocks cannot be reused, and inlining their CSS would not fix it.** Three independent
reasons, each sufficient on its own:

1. They carry Tailwind classes (`bg-primary`, `text-muted-foreground`) resolving through CSS
   custom properties in `oklch()`. An email has no stylesheet — clients strip `<style>`.
2. Flex and grid live in the **saved document**, not just in classes: `VFlex` ships
   `display:flex` in its `defaultProps`, `Columns` writes `gridTemplateColumns` inline. A
   faithful CSS inliner copies those across and Outlook stacks every column.
3. Around 35 of the ~50 page blocks are meaningless in mail — video, Lottie, Spline, Rive,
   iframes, forms, anything with a click handler.

An email that looks right in the builder and breaks in Outlook is the worst failure available:
invisible until a customer says so. So a block whose output would be a guess is not offered.

### Rendered on publish, not on send

The builder flattens the document with `renderToStaticMarkup` **in the operator's browser** and
stores it in `templates.rendered_html`. The queue worker loads no Vite/SSR bundle, so rendering
React at send time would mean building and shipping a second one purely to format mail. Sending
costs a string substitution instead.

That makes the stored HTML client-supplied. Reaching the endpoint needs `template:update`, and
an actor with it can already put arbitrary markup in a page's Code Block — so this widens no
boundary, but it is worth knowing it is not server-generated.

### The one slot an operator cannot author

The **Order / details block** renders a marker element. At send time
`MailEventsService.renderedTemplate` replaces it with the service-composed HTML. An operator
places it; they never write what goes in it.

A template that was deleted or never published resolves to `null`, and the email falls back to
the built-in `emails/event.edge` layout. A missing design must never mean a missing email.

Two guards worth knowing: an `EMAIL` template is never served by
`/api/public/templates/:id` (the check precedes the `isDefault` shortcut, which would otherwise
publish an operator's copy unauthenticated), and `TemplatesService.usages()` counts
notifications, so a wired template cannot be deleted out from under the email using it.

## Templates

Edge, under `resources/views/emails/`. [`layout.edge`](../../resources/views/emails/layout.edge)
is the shared shell: inline styles only, a single-column table, no external stylesheet and
no web fonts — email clients strip `<style>`, ignore flex and grid, and block remote assets.

Mail classes live in `app/mails/`, or alongside the feature that sends them — the
e-commerce receipt is at
[`modules/ecommerce/mails/order_confirmation_mail.ts`](../../modules/ecommerce/mails/order_confirmation_mail.ts),
and the password-reset link at
[`app/mails/event_mail.ts`](../../app/mails/event_mail.ts)
(see [auth-pages.md](./auth-pages.md#password-reset)).
Each should set a `.text()` alternative as well as the HTML view: HTML-only messages score
worse with spam filters and are unreadable in plain-text clients.

**Templates receive finished values, never things to compute.** A mail renders in a queue
worker with no request context, so a template that formats money or looks a record up is a
template that fails silently at 3am. Build the whole context in a service, hand it over,
and let the Edge file do nothing but place strings — the order confirmation splits this
explicitly into `buildConfirmation` and `sendOrderConfirmation` so the context can be
asserted in a test without an SMTP server.

## Running the worker

```bash
node ace queue:work      # or: npm run worker
```

Handlers are registered at boot by providers and by each enabled module's `boot()` hook, so
the worker needs a fully booted container — hence `startApp: true`. It drains in-flight jobs
on SIGINT/SIGTERM rather than abandoning them mid-deploy.

Set `QUEUE_ENABLED=false` to disable queuing entirely (no Redis needed); callers then take
their synchronous path.

## Environment

```
SMTP_HOST=            # empty means "not configured"
SMTP_PORT=587
SMTP_SECURE=false     # true only for implicit TLS (465); 587 negotiates STARTTLS anyway
SMTP_USERNAME=
SMTP_PASSWORD=
MAIL_FROM_ADDRESS=no-reply@driftless.local
MAIL_FROM_NAME=Driftless
```

## Related

- [ecommerce.md](../../modules/ecommerce/README.md) · [dev-workflow.md](./dev-workflow.md)
