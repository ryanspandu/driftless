# Auth pages — replacing the built-in screens with builder pages

**Status:** implemented.

`/login`, `/register`, `/forgot-password`, `/reset-password/:token` and the public 404/500
each render a hard-coded React component by default. Any of them can instead render a page
built in the **page builder**, chosen from Settings → Appearance.

## How an operator uses it

1. Build a page at `/admin/pages` and drop a **Forms → Login Form** (or Sign-up / Forgot
   Password / Reset Password) block on it. Publish it.
2. Settings → Appearance → **Built-in pages** → pick it. The 404 and 500 overrides are in the
   same card — they replace built-in screens too, and used to hide under a "Login & register"
   label where nobody would look for them.
3. `/login` now serves that page. Clearing the picker restores the built-in screen.

`node ace db:seed --files ./database/seeders/auth_pages_seeder.ts` creates **draft** "Sign in"
and "Sign up" pages as starting points. They are drafts because publishing auth screens
nobody asked for would put two live URLs on the site, and because the picker only offers
published pages — so a seeded example cannot take over `/login` by accident.

## Why the override is a lookup, not a route

`login`, `register`, `logout`, `forgot-password` and `reset-password` are all in
`RESERVED_FIRST_SEGMENT` ([`pages_public_controller.ts`](../../app/controllers/pages_public_controller.ts)),
so a builder page can never be *authored at* `/login` — the catch-all refuses to resolve it.
Each auth controller therefore asks
[`AuthPageOverrideService`](../../app/services/auth_page_override_service.ts) for a page and
hands it to [`PageRenderer`](../../app/services/page_renderer.ts), the same entry point the
e-commerce module uses for `/shop/p/:slug`.

A useful side effect: the page keeps its own public path, so it can be previewed and shared
before it is wired up.

### Only the GET branches

```
GET /login → SessionController.create → override? PageRenderer : inertia.render('auth/login')
POST /login → unchanged
```

Every credential check, throttle, CAPTCHA rule and redirect lives on the POST, which this
feature does not touch. A form drawn in the builder posts to the same endpoint the built-in
one does.

### `skipSnapshot` is required

The page is being served at `/login`, not at its own path. Without `skipSnapshot` the SSG
cache — which is keyed on the page — would be written here and then served at the page's real
URL, and one visitor's flashed error message could be baked into it. It also forces
`Cache-Control: no-store`, which is what a credential screen wants anyway.

### Every unhealthy state falls back

No setting, a deleted page, a page moved back to Draft, a stale id: all resolve to `null` and
the built-in screen renders. That fail-open is deliberate — a sign-in screen that throws locks
an operator out of their own site, and no amount of correct error reporting is worth that.

`kind: 'CODE'` is accepted rather than rejected: `PageRenderer` renders both kinds, so a
hand-written screen works too. The picker only lists `BUILDER` pages, which is the intended
path.

## The blocks

| Block | Posts to | Notes |
|---|---|---|
| Login Form | `POST /login` | Google button and CAPTCHA appear when configured |
| Sign-up Form | `POST /register` | Renders nothing when `registration_enabled` is off |
| Forgot Password Form | `POST /forgot-password` | Always the same generic response |
| Reset Password Form | `POST /reset-password` | Reads the token from route bindings |

They live in [`inertia/puck/blocks-auth.tsx`](../../inertia/puck/blocks-auth.tsx) as real
components — `render: (props) => <LoginFormView {...props} />` — so hooks are valid however
Puck invokes `render`, the same shape `blocks-interactive.tsx` uses. Each spreads
`styleFields` and wraps `<Box>`, so it inherits the whole Element panel.

Inside the builder canvas they are **inert**: `puck.isEditing` disables submit, so an operator
cannot sign themselves in (and navigate away) from the page they are editing.

### Where the config comes from

The blocks need the public auth config (is Google on, is CAPTCHA on, is sign-up open). They
read `BlockDataContext['auth:config']` first and fall back to `useAuthPublicConfig()` — the
same "context first, fetch fallback" shape `CollectionList` uses.

The server half is [`core_block_resolvers.ts`](../../app/services/core_block_resolvers.ts),
registered from [`providers/blocks_provider.ts`](../../providers/blocks_provider.ts). This is
core's first use of `registerBlockResolver`; it needs a provider because the registry throws
on a duplicate block type, so registration must happen exactly once per process. Without it
the blocks still work, but a server-rendered sign-in page would paint and then pop its Google
button in, which on a credential screen reads as a page that has not finished loading.

### Errors

The auth controllers flash a message and redirect back rather than returning Inertia
validation errors, and `flash` is shared on *every* render — including the `public/page_ssr`
one a builder page uses. The blocks read `usePage().props.flash.error` and show it inline,
because a builder page has no `AuthLayout` to toast it.

## Assembling a form by hand

`FormBlock` has a **Submits to** field (`handler`). Set it and the form posts to the matching
endpoint, reading values with `new FormData` off the real `<input name=…>` elements the
`Input` block renders.

| Submits to | Input names the server reads |
|---|---|
| Sign in | `login`, `password`, `captchaToken?` |
| Sign up | `email`, `username`, `password`, `firstName?`, `lastName?`, `captchaToken?` |
| Forgot password | `email` |
| Reset password | `token`, `password`, `passwordConfirmation` |

A mistyped `name` is a form that fails with no message, which is why the names are in the
field's own option labels rather than only here.

**A hand-assembled form cannot satisfy CAPTCHA.** The `Recaptcha` block is a visual
placeholder that produces no token, so when CAPTCHA is enabled for login or registration the
server rejects the submission with "CAPTCHA verification failed" and there is no way to build
a passing form this way. The turnkey blocks embed the real `CaptchaWidget` and do work.
Prefer them unless the layout genuinely needs hand assembly — and if CAPTCHA is on, they are
the only option.

## Password reset

The flow did not exist before this feature. See
[`password_reset_service.ts`](../../app/services/password_reset_service.ts).

- **Token**: 32 CSPRNG bytes, base64url. Only its SHA-256 is stored, so a leaked dump is a
  list of hashes rather than working account-takeover links.
- **Single use, one hour.** Requesting a new link kills the outstanding one; spending a link
  revokes every other one for that account.
- **No enumeration.** `POST /forgot-password` returns the same status, destination and flash
  whether or not the address is registered — including for a malformed address, so there is
  one exit path and no chance of getting the distinction wrong. The token is minted before the
  account lookup so both branches do the same crypto; the rate limits are the real defence.
- **Links are built from `APP_URL`**, never the request host. A `Host` header is
  attacker-controlled, and that is exactly how a reset email ends up pointing at someone
  else's server with a live token attached.
- **`Referrer-Policy: no-referrer`** on `GET /reset-password/:token`, because the token is in
  the URL and would otherwise leak in the `Referer` of every third-party asset the page loads.
  Nothing else in this app sets a referrer policy.
- **No auto-login.** Signing in once with the new password proves it was stored, and keeps
  "clicked a link in an email" from being a login on its own.
- Rate limits: `forgotPasswordIpThrottle` (5/hour/IP) and `forgotPasswordAccountThrottle`
  (3/hour/address) on top of `authIpThrottle`.

## Error pages

`app/exceptions/handler.ts` resolves `notFound` / `serverError` the same way. The whole
lookup-and-render is inside one `try`: a 500 is very often a database that has gone away, and
both the lookup and the render need the database — an unguarded call turns one failure into a
loop. The admin 404 has no override, deliberately: an operator who mistypes a URL should keep
their sidebar.

## Trust boundary

A builder page can carry a `CodeBlock`, a `CodeEmbed` or per-page custom JS. Pointing one at
`/login` therefore means **anyone who can edit that page can run script on the sign-in
screen**, where the password is typed.

Choosing the override needs `settings:manage`; editing the page needs `page:update`. That is a
real escalation from "can edit a marketing page" to "can touch the login screen", and it is
recorded here rather than left for someone to discover. Treat edit rights on a designated auth
page as equivalent to admin.

## Files

| Path | Role |
|---|---|
| `app/services/auth_page_override_service.ts` | Setting → page, with the fail-open rules |
| `app/services/password_reset_service.ts` | Mint / verify / consume reset tokens |
| `app/services/core_block_resolvers.ts` | Server-side `auth:config` for the blocks |
| `app/controllers/password_reset_controller.ts` | Forgot + reset screens and submissions |
| `app/mails/password_reset_mail.ts` · `resources/views/emails/password_reset.edge` | The email |
| `app/models/password_reset_token.ts` | Token rows (hash only) |
| `inertia/puck/blocks-auth.tsx` | The four form blocks and `FormBlockView` |
| `inertia/pages/auth/forgot-password.tsx` · `reset-password.tsx` | Built-in screens |
| `database/seeders/auth_pages_seeder.ts` | Draft starting points |
| `tests/functional/password_reset.spec.ts` · `auth_page_override.spec.ts` | Coverage |

## Related

- [pages-builder.md](./pages-builder.md) · [auth-and-permissions.md](./auth-and-permissions.md) · [mail.md](./mail.md)
