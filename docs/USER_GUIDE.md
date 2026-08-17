# Driftless — User guide

A practical guide to running the Driftless admin dashboard. For developer/architecture docs see
[docs/ai/](./ai/).

## The dashboard

Sign in at `/login`; you land on the **Overview** (`/admin/dashboard`) — content stats and a
"Recent content" table. The left **sidebar** is your main navigation; the top bar shows a
breadcrumb plus sync status, the theme toggle, and your account menu. Collapse the sidebar with
the toggle next to the logo.

Sidebar sections, top to bottom:

1. **Core menus** — Dashboard, Analytics, UI (Content / Pages / Templates / Website settings),
   Media, Collections, Components, User Management, Settings.
2. **Apps** — enabled [modules](#modules) (e.g. Tasks).
3. **Collections** — your dynamic CMS collections.
4. **Account** — your name/role + sign out.

Integrations is deliberately **not** in the sidebar — it is configured once and then forgotten,
so it lives at *Settings → Integrations* rather than sitting next to Dashboard.

## Light / dark mode

Use the theme toggle (top bar) to switch the dashboard between light and dark. This affects
**only the dashboard and the login/register pages** — your public website (landing page, posts)
always stays light, regardless of the toggle.

## Settings

**Settings** is a hub of links — every form lives on its own page. All of them need the
*Settings: manage* permission.

| Page | What it holds |
|---|---|
| **Appearance** | Admin panel name and logo, the sign-in screens, and which of your pages replace the built-in ones |
| **General** | Public site on/off, and which sidebar menus appear |
| **Website settings** | Your *public* site's title, favicon, SEO and global custom code (also under UI in the sidebar) |
| **Email** | SMTP, which emails send, their wording, and a delivery log |
| **Modules** | Install, enable and remove [modules](#modules) |
| **Integrations** | Google sign-in, CAPTCHA, Google Analytics, Microsoft Clarity |
| **API tokens** | Personal tokens for the external `/api/v1` |

One distinction worth getting right, because the two look alike: **Appearance** sets what *your
operators* see (the "Admin panel name" in the sidebar), while **Website settings** sets what
*your visitors* see (the "Site title" in the browser tab). One installation can be "Acme CMS"
to your team and "Acme Store" to the public.

### General

Toggle **Landing page & public pages** off to run Driftless as a **dashboard-only app** (SAAS
mode): the public landing and posts redirect visitors to the dashboard / login, so only the admin
exists.

**Public sign-up** is off by default. Leave it off unless you actually want strangers creating
accounts — while it is off, `/register` does not exist at all, and the sign-in page hides the
link to it.

**Dashboard management** hides core sidebar menus you don't use (e.g. turn off **Analytics** if
you never look at it). Dashboard and Settings can't be hidden. When a menu is hidden it's removed
from the sidebar **and its pages return a 404** — so a hidden area is genuinely turned off, not
just visually tucked away. Turn it back on and it reappears instantly.

### Appearance

Three cards:

- **Admin panel** — the logo, name and tagline shown at the top of the sidebar. Leave the logo
  empty and you get a lettered badge instead.
- **Sign-in screens** — the background image and panel logo on the built-in login and register
  pages.
- **Built-in pages** — see [Using your own login & register pages](#using-your-own-login--register-pages).

### Modules

Enable or disable each installed [module](#modules). Disabling one removes its sidebar group and
turns off its pages.

## Modules

**Modules** are self-contained feature areas built into the product (think of a task tracker,
project management, a CRM). They appear under the **Apps** group in the sidebar when enabled, and
are managed from *Settings → Modules*.

The bundled example is **Tasks** (`/admin/tasks`) — a lightweight task tracker with status (To
do / In progress / Done), priority, and due dates, using the same clean table layout as the rest
of the dashboard. It's a starting point you can grow into full project management.

Apps and plugins are the same system — a package's `kind` is the only difference: plugins are optional/third-party
add-ons; modules are first-party parts of *your* product. Developers add a new module with one
command — see [docs/ai/modules.md](./ai/modules.md).

## Content & CMS

- **Content** (UI → Content) manages posts/pages/media entries with status filters and search.
- **Collections** lets you model any content type with custom fields (no migrations). Each
  collection gets its own sidebar entry and records table. Fields cover text, rich text, number /
  integer / decimal, email, password, boolean, date/time, select, media, slug and JSON. A
  collection can be a **Single type** (exactly one entry — e.g. a homepage or global settings)
  instead of a list.
- **Relations** link entries across collections — one-to-one, many-to-one, many-to-many, or
  one-to-many — and you pick the related entries right in the record editor.
- **Components** are reusable groups of fields (e.g. an "SEO" group): build one under
  **Collections → Components**, then attach it to any collection as a single group or a repeatable
  list. You can also define a group inline on a single field.
- In a collection's **Fields** tab, drag to reorder and set each field's **width** (full / half /
  third) to lay fields out side-by-side — the same layout is used when editing records.
- **Pages / Templates** is the visual page builder (layouts, headers, footers, components). In the
  builder, the **gear** opens *Page settings* — page SEO/meta tags and per-page custom CSS/JS that
  runs only on that page.
- **Website settings** (UI → Website settings) sets your site title, favicon, site-wide meta tags,
  and global custom CSS/JS applied across your published pages.
- Tables everywhere share the same toolbar (search + filters), tinted status badges, and
  pagination, so every list page feels identical.

## Email

*Settings → Email*, three tabs.

**Settings** — your SMTP details. Pick a **Provider** and the host, port and username fill
themselves in; you only paste the one secret. Resend is the default because, unlike the bigger
free tiers, it does not stamp its own logo on your messages — a password-reset email carrying
another company's branding reads as phishing to whoever receives it. Brevo is offered too if you
need the higher volume more than you mind the sticker.

Press **Send test email** before trusting it. That send is deliberately *not* queued, so the
result you see is the real one.

Nothing is sent at all until this is filled in. Requests still look like they worked — the
forgot-password form still says a link is on its way, because telling the visitor otherwise would
reveal whose email is registered — so a silent installation is worth checking here first.

**Notifications** — every email this site can send, with a switch each.

- Switching one off stops it being sent. It is not queued for later.
- **Password reset cannot be switched off.** Turning it off would leave the forgot-password form
  reporting success while every locked-out account stayed locked out.
- **Edit content** opens the wording: subject, heading, opening paragraph, button label and
  closing note, with `{{placeholders}}` listed underneath. Leave a field empty and it uses the
  wording shown in grey — so you can change only the subject and keep everything else, including
  any later improvement to it.
- What the email exists to carry — the reset link, the order table, the tracking number — is not
  editable. That is on purpose: a rewritten receipt with no receipt in it is worse than a plain one.
- **Design** lets you point an email at a template you built yourself — see
  [Designing an email](#designing-an-email).

**Log** — the last 50 attempts: who it went to, what it was, and what happened. Message bodies
are never stored.

> **`Queued` is not success.** It means the job was accepted but no worker has finished it. If
> rows sit there, your queue worker is not running — see
> [Self-hosting](./SELF_HOSTING.md#the-part-people-get-wrong-three-processes).

## Using your own login & register pages

*Settings → Appearance → Built-in pages* points any of six screens at a page you built yourself:
sign in, sign up, forgot password, reset password, and the public 404 and 500.

1. Build a page under **UI → Pages** and drop a **Login form** or **Sign-up form** block on it
   (they are under *Forms* in the block list). Publish it.
2. Pick it in the dropdown for that screen.

The forms are real — they post to the same place the built-in ones do, so rate limits, CAPTCHA
and everything else still apply. Only *published* pages are offered, because a draft would
silently fall back to the built-in screen anyway.

Every unhealthy state falls back rather than breaking: clear the dropdown, move the page back to
Draft, or delete it, and the built-in screen returns. That is deliberate — a sign-in page that
cannot load would lock you out of your own site.

> The 404 and 500 overrides are in this same card. They replace built-in screens too, which is
> why they are not filed under a "login" heading.

> **Who may edit these pages matters.** A page can carry custom JavaScript, so whoever can edit
> the page you designate can run script on your sign-in screen, where passwords are typed. Treat
> edit rights on it as admin rights.

## Designing an email

Emails can be designed in the page builder, but **not with the page blocks**. Create a template
under **UI → Templates → New template** and choose type **Email**; the builder then offers a
smaller, email-specific block set.

That is not a limitation anyone chose for fun. Email clients throw away stylesheets and ignore
modern layout, so the page blocks — which rely on both — arrive broken. The email blocks emit the
old-fashioned table markup that actually survives Outlook and Gmail.

Drop an **Order / details block** wherever the order table or reset link should appear. You place
it; its contents are filled in when the email is sent, and cannot be edited.

Then wire it up under *Settings → Email → Notifications → Design*.

> Always send yourself a test after designing one. A design that looks right in the builder can
> still land badly in a particular mail client, and the only way to know is to look.

## Password reset

Anyone can reset from the sign-in page via **Forgot password?**. The link works **once** and
expires after an hour; requesting a new one kills the old one.

The response is deliberately identical whether or not the address has an account — otherwise the
form becomes a way to discover who is registered.

This needs [Email](#email) configured. Without it the flow appears to work and no message is ever
sent, so set SMTP up before relying on it.

## Offline editing

If offline mode is enabled, you can keep editing Content and CMS records when the network drops —
changes queue locally (the sync indicator in the top bar shows pending/synced) and sync
automatically when you reconnect. Creating an item and editing it before it syncs is handled
safely (no stuck "conflict").

## Users, roles & permissions

**User Management** covers Users, Roles, and Permissions. Access to each area and action is
governed by permissions assigned to roles; if you can't see a menu or get a 404 / "no
permission", your role likely lacks that permission. A superadmin holds everything.

## Related

- [Developer / AI docs](./ai/) — architecture, modules, CMS, offline.
