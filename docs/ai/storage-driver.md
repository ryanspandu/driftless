# Storage driver — local disk vs S3-compatible

Media uploads (`MediaService`) and paid digital downloads (`DigitalDeliveryService`) can be
backed by either the local filesystem (default, unchanged since before this existed) or an
S3-compatible bucket — Cloudflare R2, AWS S3, or any other S3-API provider. Selected once,
deployment-wide, via `STORAGE_DRIVER`.

## Why

Local disk assumes every process that touches media (the web server, and the BullMQ `worker`
that runs the site export/import job) shares one filesystem. That's true on a single VPS, but not
on a platform where only one process can hold a persistent volume — there the worker's export job
would silently skip every media file ("file missing on disk"), and the web service is capped at
zero replicas. `STORAGE_DRIVER=s3` removes that constraint: any process can reach the bucket.

## Env vars (`.env.example`)

| Var | Notes |
|---|---|
| `STORAGE_DRIVER` | `local` (default) or `s3` |
| `S3_ENDPOINT` | e.g. `https://<account_id>.r2.cloudflarestorage.com` — **no bucket suffix** |
| `S3_BUCKET` | bucket name |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | scope to "Object Read & Write" on just this bucket, not account-admin |
| `S3_REGION` | `auto` (Cloudflare R2's required value); a real AWS region elsewhere |
| `S3_FORCE_PATH_STYLE` | `false` unless the provider needs path-style addressing (R2 doesn't) |
| `S3_PUBLIC_URL` | optional — public base URL of the bucket; turns on the direct-serve redirect (below) |

## Architecture — `app/services/storage/`

```
types.ts        StorageDriver: putFile / readToBuffer / readToFile / delete / exists / getPresignedGetUrl
local_driver.ts fs-backed. NOT used by local-mode call sites (see below) — exists for the s3
                 driver's tests to have a same-interface counterpart, and as a ready
                 implementation if a call site is ever migrated onto the interface directly.
s3_driver.ts     @aws-sdk/client-s3 + @aws-sdk/s3-request-presigner. Constructor-injectable
                 S3Client so tests can stub it.
driver.ts        isS3() reads STORAGE_DRIVER; getStorageDriver() builds/caches the S3 driver
                 from env (throws if s3 mode is missing S3_BUCKET/keys). Deliberately not named
                 index.ts — Node's ESM loader (via @poppinss/ts-exec, this project's dev/ace
                 runtime) doesn't fall back from a mapped `.js` path to the matching `.ts` source
                 for a file named "index" the way it does for any other filename, which broke
                 `node ace build` on Railway (worked in `npm run dev` regardless — that path never
                 exercises this specific resolution).
```

**`local` mode is provably unchanged**: `media_service.ts`/`digital_delivery_service.ts` keep
their original `fs`/`sharp` code untouched. Every call site instead has a new
`if (isS3()) { ... } else { /* original code */ }` branch — the local branch IS the original
code, not a call into `local_driver.ts`.

## The scratch-directory pattern (`media_service.ts`)

Every image method (`upload`, `replaceFile`, `cropToNew`, `generateVariants`, `importOne`,
`readRasterBase64`) passes a real file path to `sharp()` — never a buffer for the primary source.
Rather than rewrite that to be buffer-based, `s3` mode keeps it as-is and treats `uploadDir` as
**ephemeral local scratch space**:

- **Writing** a new file: the existing `sharp`/`file.move`/`writeFile` code runs against
  `uploadDir` unchanged → `pushToS3()` uploads the result(s) to the bucket → the local scratch
  copy is deleted. `ownedFilenames()` collects the source + every variant filename so one call
  covers all of them.
- **Reading** a pre-existing file (crop's source image, `readRasterBase64`, `rasterPath`):
  `ensureLocalCopy()` downloads it into `uploadDir` first (no-op if already there in the same
  request) via `driver.readToFile`, then the existing `resolveFilePath`/`sharp(path)` code runs
  unchanged.
- **Serving** (`serve`, `serveVariant`) and **exporting** (`exportOne`) read straight to a buffer
  via `driver.readToBuffer` — no local scratch file needed for a pure read-and-respond.
- **Deleting** (`forceDelete`, and `generateVariants`'s old-derivative cleanup before it
  regenerates them) calls `driver.delete` directly — s3 mode never has a lingering local copy to
  `rmSync` between requests, so the local-mode cleanup logic doesn't apply.

`MediaService.serve()`'s signature is `(response, media)`, not `(response, path, media)` —
it resolves bytes internally (driver or disk) instead of making the controller pre-resolve a
path that wouldn't exist in s3 mode. It returns a boolean (found vs not) instead of writing a 404
itself, so the controller still owns the "try the variant next" fallback.

## Serving media straight from the bucket (`S3_PUBLIC_URL`)

By default `s3` mode still streams every image through the app (`serve` / `serveVariant` read the
object into memory and `response.send` it), so each page view is billed as the app's egress. With
`S3_PUBLIC_URL` set, `MediaController.serve` instead answers `302` → `<S3_PUBLIC_URL>/<filename>`
(`Cache-Control: public, max-age=86400`) and the bytes never touch the app. `local` mode ignores it.

- **URLs stay `/media/…`.** Content and Puck data embed those strings, so nothing is rewritten or
  migrated — the redirect is what makes it work retroactively. The query string is forwarded
  (`forwardQueryString: true` in `config/app.ts`), so `?v=<updatedAt>` — the cache-buster for a file
  replaced in place — still busts the bucket URL.
- **Only what the DB knows about.** `MediaService.publicUrl()` redirects a name only if it is a
  `media` row of an image/video type (jpeg, png, gif, webp, mp4, webm) or a `media_variants` row.
  Anything else — including `ecommerce/…` digital-download keys that share the bucket — 404s or keeps
  streaming through the app.
- **SVG, PDF, docs and fonts keep streaming through the app**, because it sanitizes SVG and forces
  `Content-Disposition: attachment`, which a bare bucket URL cannot.
- **Objects carry real metadata.** `pushToS3` now sends `Content-Type` (from the extension) and
  `Cache-Control: public, max-age=31536000, immutable`. Objects uploaded before this have neither and
  a public bucket would serve them as `application/octet-stream` (a download, not a picture), so run
  `node ace media:s3-headers --apply` **before** setting `S3_PUBLIC_URL` (dry-run without `--apply`;
  on Railway the command is `node build/bin/console.js media:s3-headers`). The step-by-step —
  custom domain, order, verification `curl`s, WAF rule — is in
  [RAILWAY_DEPLOYMENT.md](../RAILWAY_DEPLOYMENT.md).

Bucket requirements before turning it on:

1. **Public read.** R2: enable the `r2.dev` subdomain or attach a custom domain. Digital downloads
   live in the same bucket (`ecommerce/<ulid><ext>`, protected only by app-side grants), so on a
   public bucket their keys become directly fetchable. Use a separate bucket for public media, or a
   WAF rule that blocks `/ecommerce/*` on the public hostname.
2. **CORS**: allow `GET` from the site origin if anything `fetch()`es or canvas-reads an image
   (plain `<img>` and `<video>` do not need it).

## Digital downloads — presigned redirect, not a schema change

`app/services/data_transfer/sections/media.ts` (the export/import job) and
`modules/ecommerce/services/digital_delivery_service.ts` follow the same driver, but
`DigitalAsset.storagePath` changes *meaning*, not shape: an absolute local path in `local` mode,
an S3 object key (`ecommerce/<ulid><ext>`) in `s3` mode — still one string column, no migration.

`claimAndServe()`'s atomic auth+quota `UPDATE` against `DownloadGrant` (`max_downloads` /
`downloads_count` / `expires_at` / `revoked_at`) is unchanged in both modes — only what happens
*after* a successful claim differs:

```ts
// local
{ mode: 'stream', stream: createReadStream(asset.storagePath), filename, mimeType, sizeBytes }
// s3 — a ~10 min presigned GET URL under the grant's own (longer-lived) authorization
{ mode: 'redirect', url: await driver.getPresignedGetUrl(asset.storagePath, 600), filename, mimeType }
```

`download_controller.ts#show` and `account_controller.ts#downloadOrderFile` both branch on
`result.mode`: `'redirect'` → `response.redirect(result.url)` (302, bytes never touch this
server); `'stream'` → the original `response.stream()` path.

## Testing

`STORAGE_DRIVER` defaults to `local`, so the whole existing Japa suite runs unaffected —
confirmed by running it before and after this driver existed.

- `tests/unit/storage_local_driver.spec.ts` — real `fs` against a temp dir.
- `tests/unit/storage_s3_driver.spec.ts` — a recording stub `S3Client` for
  put/read/delete/exists (asserts the constructed command's Bucket/Key/Body, no network call),
  plus a **real** `S3Client` (offline — presigning is pure request-signing, no network needed)
  for `getPresignedGetUrl`, asserting the signed URL's host/bucket/key/expiry.
- No functional test exercises `s3` mode against a real bucket — that was done manually against
  a live Cloudflare R2 bucket (upload/serve/delete through the full admin API, and a site export
  running on a genuinely separate `worker` process correctly pulling media into the archive).

## Files

| Path | Role |
|---|---|
| `app/services/storage/*.ts` | The driver interface + both implementations + selector |
| `app/services/media_service.ts` | Every filesystem call site, branched |
| `app/controllers/admin/media_controller.ts` | `serve` — simplified to the 2-arg signature; redirects to `S3_PUBLIC_URL` when set |
| `app/services/media_url.ts` | `mediaPublicBaseUrl()` — validated `S3_PUBLIC_URL`, null outside s3 mode |
| `commands/media_s3_headers.ts` | one-off backfill of Content-Type / Cache-Control on existing objects |
| `app/services/data_transfer/sections/media.ts` | Site export/import — the motivating call site |
| `modules/ecommerce/services/digital_delivery_service.ts` | `attach` (write) + `claimAndServe` (presigned redirect) |
| `modules/ecommerce/controllers/storefront/download_controller.ts`, `account_controller.ts` | Branch on `ResolvedDownload.mode` |
| `start/env.ts`, `.env.example` | The new vars |

## See also

[RAILWAY_DEPLOYMENT.md](../RAILWAY_DEPLOYMENT.md) — the concrete deployment this driver exists
for: three processes with no disk shareable between them.
