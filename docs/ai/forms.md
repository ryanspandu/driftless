# Forms

Two things share the "Forms" area:

1. **The inbox** — every builder `FormBlock` set to *Collect submissions* posts to one public
   endpoint and lands in `form_submissions` (a schema-less row: `formName`, a `data` JSON blob,
   `email`, `status`). This has always accepted **any** fields.
2. **Named forms** — an operator builds a form under **Forms** with its own **field schema**. A
   defined form is validated + **whitelisted** on the way in (a security upgrade over accept-all),
   gets its own per-form submissions view, and a `FormBlock` bound to it **auto-renders** its fields.

A form backs **no SQL columns** — its fields live as JSON on the `forms` row — so this is far
simpler than a CMS collection, and the intake pipeline (spam, rate-limit, storage) is reused
unchanged. Legacy free-text `FormBlock`s keep working exactly as before.

## The two kinds, side by side

| | Free-text form (legacy) | Named form (defined) |
|---|---|---|
| Defined where | just a `formName` string on the block | a `forms` row with a `fields` schema |
| Submit handling | accept-all + caps ([`sanitiseFields`](../../app/services/form_submission_service.ts)) | whitelist + per-type validation ([`validateSubmission`](../../app/services/form_schema.ts)) |
| Bad value | stored as-is | **422** with per-field errors (the honeypot still fakes success) |
| On a page | hand-place Input/Select/… child blocks | pick the form → it renders itself |
| Inbox | global only | its own per-form view (`form_id`) |

The submit endpoint resolves `input.form` against an **active** `forms.slug`; a match takes the
defined path, anything else takes the legacy path — so nothing existing breaks.

## Building a form (admin)

`/admin/forms` lists defined forms; **New form** (title only) opens the builder at
`/admin/forms/:id` — three tabs, `?tab=`:

- **Fields** — the field builder ([`form-fields-editor.tsx`](../../inertia/components/forms/form-fields-editor.tsx)):
  drag-reorder (`@dnd-kit`), add/edit/remove, and each field laid out at its **width** in a 12-col
  grid so the card previews the form. **Edits are local until "Save fields"** (a dirty indicator
  shows pending changes) — unlike the CMS field editor, nothing auto-saves.
- **Submissions** — the inbox scoped to this form (`?formId=`).
- **Settings** — title, `slug` (the stable key a block binds to — renaming breaks bindings),
  success message, `status` (`active` accepts submissions; `inactive`/`draft` keep the definition
  but stop intake).

Slug is auto-derived from the title and uniquified (`-2`, `-3`). Deleting a form keeps its
submissions (they stay in the global inbox). Gated by `forms:read` / `forms:manage`.

## Field types

`FORM_FIELD_TYPES` in [`form_schema.ts`](../../app/services/form_schema.ts) is the single source of
truth (the client mirror is `FormFieldType` in `inertia/types/api.ts`):

`text` · `textarea` · `email` · `tel` · `number` (optional `min`/`max`) · `date` · `url` ·
`select` (options) · `radio` (options) · `checkbox` (single/consent) · `checkbox_group` (multi;
options) · `file`.

A field def: `{ key (^[a-z][a-z0-9_]{0,31}$, unique/form), label, type, required?, placeholder?,
help?, options?, width?('full'|'half'|'third'|'quarter'|'sixth'), min?/max?, accept? }`. Deliberately
NOT the full CMS set — richtext/media/relation/component/json/password/slug don't belong on a public
form. `key` is never `_`-prefixed (those are dropped as internal).

## Rendering on a page

The `FormBlock` (config in [`config.tsx`](../../inertia/puck/config.tsx), view
[`blocks-auth.tsx`](../../inertia/puck/blocks-auth.tsx) `FormBlockView`), with **Submits to =
Collect**, has a **Saved form** picker (`formSlug`). When set:

- The block fetches `GET /api/public/forms/:slug` and renders the schema via
  [`public-form-renderer.tsx`](../../inertia/puck/public-form-renderer.tsx) — themed inputs reusing
  the existing form-block styles, in a **12-col grid** (full=12/half=6/third=4/quarter=3/sixth=2
  → 1/2/3/4/6 per row, collapsing to full on mobile).
- On submit it builds the payload **from the schema** — `getAll(key)` for `checkbox_group` (an
  array), `get(key)` otherwise — so multi-value fields aren't collapsed. A **422** shows inline
  per-field errors; the success message swaps in on 2xx.

With no `formSlug`, the block keeps the legacy path (hand-placed child inputs, free-text `formName`).
`/api/public/forms/:slug` exposes only `{ slug, title, fields, successMessage }` — no internals.

## The submit path — validation & security

`POST /api/forms/submit` → [`forms_controller.submit`](../../app/controllers/admin/forms_controller.ts)
→ [`FormSubmissionService.record`](../../app/services/form_submission_service.ts). For a defined
form, [`validateSubmission(fields, raw)`](../../app/services/form_schema.ts):

- **Whitelists** to declared keys — unknown keys (and any `_`-prefixed field) are never stored.
- Enforces `required`; validates per type (email regex, number finite + min/max, calendar date,
  tel, url, `select`/`radio` value ∈ options, `checkbox_group` ⊆ options), caps string length.
- Returns `{ data, errors }`. A non-empty `errors` (and not a honeypot hit) → a `FormValidationError`
  → the controller answers **422 `{ errors }`** so the visitor can fix it.

**Guards, all preserved** (a defined form only adds validation on top):

- **Honeypot** `_hp_url` filled → stored as `status: spam`, notifications skipped, and the response
  is a normal 200 (a bot must never learn the schema — so a honeypot hit never 422s).
- **Rate limit** — per-IP 20 / 10 min (`formsSubmitThrottle`, [`start/limiter.ts`](../../start/limiter.ts)).
- **CSRF** — the form sends `X-XSRF-TOKEN`.
- **Always 200 on infra failure** — a broken store must never read as a broken page; only a
  *validation* failure surfaces (as 422), never an exception.
- **Store even spam** (recoverable false positives), **email extracted** from the `email`-type field,
  **`ip_hash`** = HMAC-SHA256(APP_KEY, ip) (never serialized), caps 40 fields / 100-char keys /
  5000-char values as defense-in-depth.

## File uploads

Anonymous file upload is a real attack surface, so it is **isolated and token-gated** — modelled on
`media_service` but never the media library
([`form_upload_service.ts`](../../app/services/form_upload_service.ts)):

- `POST /api/forms/upload` (public, one file, a **stricter** throttle — 10 / 10 min): validated by
  **magic bytes** (`fileTypeFromFile` — the client MIME/extension is never trusted) against an
  allow-list (pdf, png/jpg/webp/gif, docx/xlsx; svg/html/executables rejected), size-capped (~10 MB),
  stored in `storage/form_uploads` with a random name. Returns an **opaque token** — not a URL.
- The renderer's file field uploads on change and puts the token in a hidden `name=key`; the token
  is the submitted value. On submit, [`record`](../../app/services/form_submission_service.ts) binds
  it to the submission.
- **Served admin-only**: `GET /api/admin/forms/uploads/:token` (gate `forms:read`) streams the file
  as a download; it is never publicly reachable.
- **Lifecycle**: deleting a submission deletes its files; unbound (never-submitted) uploads are
  garbage-collected by `node ace forms:prune-uploads` (cron; default 24h) —
  [`commands/forms_prune_uploads.ts`](../../commands/forms_prune_uploads.ts).

## The inbox

[`forms-inbox.tsx`](../../inertia/components/admin/forms-inbox.tsx) — status tabs (All / Unread /
Read / Spam) + a read-only detail dialog (mark read/spam/unread, delete). The global inbox is
`/admin/forms/submissions`; each form's own view is its **Submissions** tab (`?formId=`). A non-spam
submission fires the optional webhook from Settings → Email (`getFormsConfig().webhookUrl`); the
`notify_email` setting is stored but not yet wired.

## Routes & permissions

- Public: `POST /api/forms/submit`, `POST /api/forms/upload`, `GET /api/public/forms/:slug`.
- Admin (`forms:read` / `forms:manage`): pages `/admin/forms`, `/admin/forms/submissions`,
  `/admin/forms/:id`; `/api/admin/forms/definitions*` CRUD; `GET /api/admin/forms` (+`?status=&formId=`);
  `PUT/DELETE /api/admin/forms/:id(/status)`; `GET /api/admin/forms/uploads/:token`.
- Registered in [`start/routes.ts`](../../start/routes.ts) — `definitions` and `submissions` before
  the `:id` routes so the literal segments win.

## Files

| Path | Role |
|---|---|
| `app/models/form.ts` | Form definition (`slug`, `title`, `fields` JSON, `status`) |
| `app/models/form_submission.ts` | One submission (`data` blob, `email`, `status`, nullable `form_id`) |
| `app/models/form_upload.ts` | An uploaded file (opaque token → stored file, bound to a submission) |
| `app/services/form_schema.ts` | Field types + `validateSubmission` / `sanitiseFormDefinition` (pure, tested) |
| `app/services/form_service.ts` | Definition CRUD |
| `app/services/form_submission_service.ts` | Submit intake + validation + guards + inbox |
| `app/services/form_upload_service.ts` | Secure upload store (magic-byte, bind, GC) |
| `app/controllers/admin/forms_controller.ts` | Public submit + upload; admin inbox API + upload serve |
| `app/controllers/admin/forms_definitions_controller.ts` | Definition pages + CRUD API |
| `app/controllers/public_forms_controller.ts` | Public `GET /api/public/forms/:slug` |
| `inertia/components/forms/form-fields-editor.tsx` | The drag-and-drop field builder (manual save) |
| `inertia/components/admin/forms-inbox.tsx` | The submissions inbox (per-form or global) |
| `inertia/puck/public-form-renderer.tsx` | Renders a form's schema as themed inputs (12-col grid) |
| `inertia/puck/form-picker-field.tsx` | The FormBlock "Saved form" picker |
| `commands/forms_prune_uploads.ts` | Cron GC for orphaned uploads |

## Related

- [pages-builder.md](./pages-builder.md) · [auth-pages.md](./auth-pages.md) · [cms-content-modeling.md](./cms-content-modeling.md) · [mail.md](./mail.md) · [security.md](./security.md)
