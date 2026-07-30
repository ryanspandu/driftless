# Mail

Outgoing transactional email — order receipts, download links, password resets.
`@adonisjs/mail` over SMTP, configured either from the admin UI (encrypted at rest) or from
environment variables.

> Core infrastructure, not e-commerce-specific. The e-commerce module contributes templates.

## Two sources of configuration

`MailSettingsService.resolve()` picks, in order:

1. **Database** — `mail_settings` (single row, id `default`), when `enabled` is on and a
   host is set. Edited from Settings → Email.
2. **Environment** — `SMTP_HOST` and friends.

Neither present means email is simply _not configured_: sends fail with a clear message
rather than silently going nowhere.

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

## Templates

Edge, under `resources/views/emails/`. [`layout.edge`](../../resources/views/emails/layout.edge)
is the shared shell: inline styles only, a single-column table, no external stylesheet and
no web fonts — email clients strip `<style>`, ignore flex and grid, and block remote assets.

Mail classes live in `app/mails/`, or alongside the feature that sends them — the
e-commerce receipt is at
[`modules/ecommerce/mails/order_confirmation_mail.ts`](../../modules/ecommerce/mails/order_confirmation_mail.ts).
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

- [ecommerce.md](./ecommerce.md) · [dev-workflow.md](./dev-workflow.md)
