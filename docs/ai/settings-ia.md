# Settings — which screen owns what

**Status:** implemented.

There are several settings screens and one storage table behind most of them, which makes
duplication the default failure mode: two screens grow a field for the same thing, or one screen
grows a field nobody reads. Both have already happened here. This page is the map that stops it
happening again.

## The one rule

> **`/admin/settings/*` is the admin shell. `/admin/website-settings` is the public website.**

Every field belongs to one audience or the other. Before adding one, ask **who reads it** — your
operators, or your visitors. If the answer is "both", it is two fields.

The rule has teeth because it was already broken once, in the most confusing way available: an
"Admin panel name" field was labelled **"Website name"** and sat one click from a **"Site title"**
field on the other screen, both defaulting to `Driftless`, with nothing explaining the difference.

## Screens

| Route | Sidebar | Owns | Storage |
|---|---|---|---|
| `/admin/settings` | **Settings** | Nothing — links only | — |
| `/admin/settings/appearance` | via hub | Admin panel branding, sign-in screens, built-in-page overrides | `web_settings`: `admin_branding`, `auth_pages`, `error_pages` |
| `/admin/settings/general` | via hub | Public site on/off, public sign-up, hidden sidebar menus | `web_settings.app_config` |
| `/admin/settings/email` | via hub | SMTP, per-email toggles + copy, delivery log, email branding | `mail_settings`, `mail_event_settings`, `mail_deliveries`, `web_settings.email_branding` |
| `/admin/settings/application` | via hub | Modules (install / enable / remove) | `modules` table |
| `/admin/integrations` (+ 4 sub-pages) | **not in sidebar** | Google OAuth, CAPTCHA, GA4, Clarity | `integration_settings` (secrets in `*_enc`) |
| `/admin/settings/api-tokens` | via hub | Personal access tokens for `/api/v1` | `auth_access_tokens` |
| `/admin/website-settings` | **UI → Website settings** | Public site title, description, favicon, site-wide meta, appearance (font + palette), forms webhook, global custom code | `web_settings`: `site_meta`, `theme`, `forms`, `page_code` |

The page title of `/admin/settings/application` is **"Modules"**. The route name is a leftover;
link to it as *Settings → Modules*.

## The hub holds no forms

`/admin/settings` is link cards only. It used to be a hub *and* an editor — two live forms above
the cards, inside a tab set whose labels hid what was in them, so the public 404/500 overrides
were filed under **"Login & register"**. Every form now lives on its own page and the hub has one
job.

If you are adding a settings surface: add a page and a card. Do not put a form on the hub.

## `web_settings` — one key, one owning screen

`WEB_DEFAULTS` in [`app/services/settings_service.ts`](../../app/services/settings_service.ts) is
the source of truth for sections and their defaults. `applyPatches` **deletes** a row whose value
is `''`, so empty always means "back to the default" and no screen needs a reset button.

| Section | Keys | Owner |
|---|---|---|
| `admin_branding` | `project_name`, `project_tagline`, `logo_url` | Appearance |
| `auth_pages` | `background_url`, `logo_url`, `login_page_id`, `register_page_id`, `forgot_password_page_id`, `reset_password_page_id` | Appearance |
| `error_pages` | `not_found_page_id`, `server_error_page_id` | Appearance |
| `email_branding` | `logo_url`, `accent_color`, `footer_note` | Email |
| `app_config` | `landing_enabled`, `hidden_nav`, `registration_enabled` | General |
| `site_meta` | `site_title`, `site_description`, `favicon_url`, `meta` | Website settings |
| `page_code` | `snippets` | Website settings **and** the builder's Settings dialog |
| `theme` | `font_family`, `font_css_url`, `font_face_url`, `font_custom_name`, `primary_color`, `secondary_color`, `saved_colors` (JSON `[{slug,name,value}]`) | Website settings (**Appearance** tab) **and** the builder's Settings dialog |

`accent_color` was **removed** from `theme` (it briefly sat alongside primary/secondary):
`--accent` remains in `app.css` for shadcn components but is no longer operator-editable.
Do not confuse it with `email_branding.accent_color`, which is unrelated and still live.

**Add a section to `WEB_DEFAULTS` before any screen writes it.** `admin_branding` was written by
the UI while absent from `WEB_DEFAULTS`, so `getMergedSections()` could not seed it, the API
returned nothing for it until somebody pressed Save, and its defaults lived duplicated in the
front end.

`page_code.snippets` and the whole `theme` section are the keys with two editors, and that is fine
— one data source, two entrances (both are also reachable from the builder, where an author is
already thinking about code / the page's look). The **Appearance** panel
(`inertia/components/appearance-panel.tsx`) is that shared editor for `theme`, rendered on the
Website settings **Appearance** tab and in the builder's Page-settings dialog. Two editors on one
key is acceptable; two keys for one concept is not.

Two `theme` specifics worth knowing. **Any write to section `theme` invalidates every SSG
snapshot** — the palette/font is baked into snapshots via shared props, so `settings_controller`
calls `pagesService.invalidateAllSnapshots()` whenever a patch targets `theme`. And **the server
sanitises `theme` at read time**, not just on write: `settings_service.ts` runs `safeColor`,
`sanitizeSavedColors`, and the font guards inside `mapPublicTheme()` to build the `PublicTheme`
that gets injected as CSS — the server stays the security boundary, since these values become a
`<style>` block on public pages.

## Traps

**A field with no reader is worse than a missing field.** `admin_branding` was saved by the UI and
read by a context whose only consumer was a component nothing imported, while the real sidebar
hardcoded its brand. Pressing Save changed nothing, silently, for as long as that shipped. When
you add a setting, follow it all the way to the pixel it moves.

**Nav placement contradicts the rule, deliberately.** The public-website screen is a child of
**UI** (next to Content/Pages/Templates, where an author works), while the admin-shell screens sit
under top-level **Settings**. That is a usability call, not the boundary — do not infer ownership
from the sidebar.

**`nav_enabled_middleware` gates pages on their sidebar menu, and two screens are exempt.**
`/admin/integrations` and `/admin/website-settings` are absent from `PATH_NAV` because both are
*also* linked from the Settings hub — gating them on the UI menu would 404 a page a visible card
points at. Their siblings have no second entrance, which is why they are listed and these two are
not. This reads like an oversight; it is not.

**`GET /api/admin/settings/web` is auth-only.** The `PUT` is gated on `settings:manage`, the `GET`
is not, so any admin-area user can read every `web_settings` value. Do not put anything sensitive
there — that is what `integration_settings.*_enc` and `mail_settings.password_enc` are for.

## Related

- [page-settings.md](./page-settings.md) — per-page vs site-wide settings, the builder's dialog
- [mail.md](./mail.md) — everything under Settings → Email
- [auth-pages.md](./auth-pages.md) — the built-in-page overrides
- [modules.md](./modules.md) — Settings → Modules, and how a module contributes its own settings
