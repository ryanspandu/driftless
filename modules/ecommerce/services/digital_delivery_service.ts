import crypto from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { extname, join, relative, isAbsolute } from 'node:path'
import type { Readable } from 'node:stream'
import type { HttpContext } from '@adonisjs/core/http'
import type { MultipartFile } from '@adonisjs/core/bodyparser'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import env from '#start/env'
import { DateTime } from 'luxon'
import { publicError } from '#exceptions/public_error'
import { newUlid } from '#services/ulid_service'
import DigitalAsset from '#modules/ecommerce/models/digital_asset'
import DownloadGrant from '#modules/ecommerce/models/download_grant'
import OrderItem from '#modules/ecommerce/models/order_item'
import type Order from '#modules/ecommerce/models/order'

/**
 * Where protected files live.
 *
 * `storage/` sits outside `public/`, which is the only directory the static
 * server is pointed at. That is the first line of defence and the one that does
 * not depend on any of our code being correct: even if every check below were
 * removed, there would still be no URL that maps to these bytes.
 */
function protectedRoot(): string {
  return app.makePath('storage/protected/ecommerce')
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null
  return crypto.createHmac('sha256', env.get('APP_KEY').release()).update(ip).digest('hex')
}

/**
 * Strip anything that could steer a path.
 *
 * The stored name is only ever used for the `Content-Disposition` header and
 * for choosing an extension — never to build a path, since the path is
 * generated from a fresh ULID. This is belt and braces.
 */
function safeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? 'download'
  // Control characters, quotes and backslashes would let a crafted name break
  // out of the quoted string in `Content-Disposition`.
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001F\u007F"\\]/g, '').trim()
  return cleaned.length > 0 ? cleaned.slice(0, 200) : 'download'
}

export interface DigitalAssetDto {
  id: string
  variantId: string
  filename: string
  mimeType: string | null
  sizeBytes: number | null
  maxDownloads: number
  linkTtlHours: number
  createdAt: string
}

export interface DownloadGrantDto {
  id: string
  filename: string
  sizeBytes: number | null
  downloadsCount: number
  maxDownloads: number
  expiresAt: string | null
  live: boolean
}

export interface ResolvedDownload {
  stream: Readable
  filename: string
  mimeType: string
  sizeBytes: number
}

export default class DigitalDeliveryService {
  // ── Assets (admin side) ──────────────────────────────────────────────────

  async listForVariant(variantId: string): Promise<DigitalAssetDto[]> {
    const rows = await DigitalAsset.query()
      .where('variant_id', variantId)
      .whereNull('deleted_at')
      .orderBy('created_at', 'asc')

    return rows.map((row) => this.toAssetDto(row))
  }

  async listForProduct(productId: string): Promise<DigitalAssetDto[]> {
    const rows = await DigitalAsset.query()
      .whereNull('deleted_at')
      .whereIn(
        'variant_id',
        db.from('ecommerce_product_variants').select('id').where('product_id', productId)
      )
      .orderBy('created_at', 'asc')

    return rows.map((row) => this.toAssetDto(row))
  }

  /**
   * Store an uploaded file against a variant.
   *
   * The name on disk is a ULID plus the original extension: the buyer's
   * filename never becomes a path component, so there is nothing to traverse
   * with and no way to collide with an existing file.
   */
  async attach(
    variantId: string,
    file: MultipartFile,
    options: { maxDownloads?: number; linkTtlHours?: number } = {}
  ): Promise<DigitalAssetDto> {
    const root = protectedRoot()
    if (!existsSync(root)) {
      mkdirSync(root, { recursive: true })
    }

    const id = newUlid()
    const original = safeFilename(file.clientName || 'download')
    const ext = extname(original).slice(0, 16)
    const storedName = `${id}${ext}`

    await file.move(root, { name: storedName, overwrite: false })

    const asset = await DigitalAsset.create({
      id,
      variantId,
      filename: original,
      storagePath: join(root, storedName),
      mimeType: file.type ? `${file.type}/${file.subtype}` : 'application/octet-stream',
      sizeBytes: file.size ?? 0,
      maxDownloads: Math.max(0, Math.trunc(options.maxDownloads ?? 0)),
      linkTtlHours: Math.max(0, Math.trunc(options.linkTtlHours ?? 72)),
    })

    return this.toAssetDto(asset)
  }

  async updateAsset(
    id: string,
    patch: { filename?: string; maxDownloads?: number; linkTtlHours?: number }
  ): Promise<DigitalAssetDto> {
    const asset = await DigitalAsset.query().where('id', id).whereNull('deleted_at').first()
    if (!asset) throw publicError.notFound('Asset not found.', 'asset_not_found')

    if (patch.filename !== undefined) asset.filename = safeFilename(patch.filename)
    if (patch.maxDownloads !== undefined) {
      asset.maxDownloads = Math.max(0, Math.trunc(patch.maxDownloads))
    }
    if (patch.linkTtlHours !== undefined) {
      asset.linkTtlHours = Math.max(0, Math.trunc(patch.linkTtlHours))
    }

    await asset.save()
    return this.toAssetDto(asset)
  }

  /**
   * Soft-delete an asset, and delete the file **only** if nothing was ever
   * granted from it.
   *
   * Removing a product must not retroactively break a download someone paid
   * for. The `RESTRICT` foreign key on `ecommerce_download_grants.asset_id`
   * enforces the same thing at the database level; this is the friendly version
   * of that error.
   */
  async removeAsset(id: string): Promise<void> {
    const asset = await DigitalAsset.query().where('id', id).whereNull('deleted_at').first()
    if (!asset) throw publicError.notFound('Asset not found.', 'asset_not_found')

    const granted = await db
      .from('ecommerce_download_grants')
      .where('asset_id', id)
      .count('* as total')
      .first()
    const total = Number((granted as { total?: string | number } | undefined)?.total ?? 0)

    asset.deletedAt = DateTime.now()
    await asset.save()

    if (total === 0 && existsSync(asset.storagePath)) {
      await unlink(asset.storagePath).catch(() => {
        // The row is already soft-deleted; a stray file is a housekeeping
        // problem, not a reason to fail the request.
      })
    }
  }

  // ── Grants ───────────────────────────────────────────────────────────────

  /**
   * Issue download grants for every digital line on a paid order.
   *
   * Called from inside the `markOrderPaid` transaction, so it runs exactly once
   * per order however many webhooks arrive.
   */
  async grantForOrder(order: Order, trx: TransactionClientContract): Promise<number> {
    const items = await OrderItem.query({ client: trx })
      .where('order_id', order.id)
      .where('product_type', 'digital')

    if (items.length === 0) return 0

    const variantIds = items.map((item) => item.variantId).filter((id): id is string => Boolean(id))
    if (variantIds.length === 0) return 0

    const assets = await trx
      .from('ecommerce_digital_assets')
      .whereIn('variant_id', variantIds)
      .whereNull('deleted_at')

    const now = DateTime.now()
    let issued = 0

    for (const item of items) {
      for (const asset of assets) {
        if (String(asset.variant_id) !== item.variantId) continue

        const ttl = Number(asset.link_ttl_hours ?? 0)

        await trx.table('ecommerce_download_grants').insert({
          id: newUlid(),
          order_id: order.id,
          order_item_id: item.id,
          asset_id: String(asset.id),
          downloads_count: 0,
          /**
           * Snapshotted from the asset, not read through to it. Tightening the
           * quota on a product later must not shrink what an existing buyer
           * was sold.
           */
          max_downloads: Number(asset.max_downloads ?? 0),
          expires_at: ttl > 0 ? now.plus({ hours: ttl }).toSQL() : null,
          created_at: now.toSQL(),
          updated_at: now.toSQL(),
        })

        issued += 1
      }
    }

    return issued
  }

  /** Grants on an order, for the buyer's order page. */
  async grantsForOrder(orderId: string): Promise<DownloadGrantDto[]> {
    const rows = await db
      .from('ecommerce_download_grants as g')
      .join('ecommerce_digital_assets as a', 'a.id', 'g.asset_id')
      .where('g.order_id', orderId)
      .select(
        'g.id',
        'g.downloads_count',
        'g.max_downloads',
        'g.expires_at',
        'g.revoked_at',
        'a.filename',
        'a.size_bytes'
      )
      .orderBy('g.created_at', 'asc')

    return rows.map((row) => {
      const expiresAt = row.expires_at ? DateTime.fromJSDate(new Date(row.expires_at)) : null
      const max = Number(row.max_downloads ?? 0)
      const count = Number(row.downloads_count ?? 0)

      return {
        id: String(row.id),
        filename: String(row.filename),
        sizeBytes: row.size_bytes === null ? null : Number(row.size_bytes),
        downloadsCount: count,
        maxDownloads: max,
        expiresAt: expiresAt?.toISO() ?? null,
        live:
          !row.revoked_at &&
          (!expiresAt || expiresAt > DateTime.now()) &&
          (max === 0 || count < max),
      }
    })
  }

  /**
   * Hand over the bytes for one grant, to whoever holds the order's token.
   *
   * The authorisation, the payment check and the quota decrement are **one
   * statement**, for the same reason `markOrderPaid` is: two requests arriving
   * together must not both pass the last remaining use. Every failure — wrong
   * token, unpaid order, spent quota, expired, revoked, no such grant — returns
   * the identical 404, because a link that fails distinguishably is an oracle
   * for whichever condition it distinguishes.
   */
  async redeem(grantId: string, orderToken: string, ctx: HttpContext): Promise<ResolvedDownload> {
    const denied = () =>
      publicError.notFound('This download link is no longer valid.', 'download_unavailable')

    if (!grantId || !orderToken || grantId.length > 40 || orderToken.length > 128) throw denied()

    const now = DateTime.now()
    const claimed = await db
      .from('ecommerce_download_grants')
      .where('id', grantId)
      .whereNull('revoked_at')
      .where((query) => {
        query.whereNull('expires_at').orWhere('expires_at', '>', now.toSQL())
      })
      .where((query) => {
        query.where('max_downloads', 0).orWhereRaw('downloads_count < max_downloads')
      })
      /**
       * The order must both match the presented token and still be paid. A
       * refunded order stops downloading here even if `revokeForOrder` never
       * ran, so the two guards cannot drift apart.
       */
      .whereIn(
        'order_id',
        db
          .from('ecommerce_orders')
          .select('id')
          .where('access_token_hash', hashToken(orderToken))
          .whereIn('payment_status', ['paid', 'partially_refunded'])
          .whereNull('deleted_at')
      )
      .update({
        downloads_count: db.raw('downloads_count + 1'),
        last_downloaded_at: now.toSQL(),
        last_download_ip_hash: hashIp(ctx.request.ip()),
        updated_at: now.toSQL(),
      })

    if (Number(claimed) === 0) throw denied()

    const grant = await DownloadGrant.findOrFail(grantId)
    const asset = await DigitalAsset.find(grant.assetId)
    if (!asset) throw denied()

    /**
     * The path came from our own insert, but assert the invariant anyway: a
     * stored path that escaped the protected root would mean something has gone
     * badly wrong upstream, and serving it would be the worst possible response.
     */
    const root = protectedRoot()
    const rel = relative(root, asset.storagePath)
    if (rel.startsWith('..') || isAbsolute(rel)) throw denied()

    if (!existsSync(asset.storagePath)) throw denied()
    const stat = statSync(asset.storagePath)

    return {
      stream: createReadStream(asset.storagePath),
      filename: safeFilename(asset.filename),
      mimeType: asset.mimeType ?? 'application/octet-stream',
      sizeBytes: stat.size,
    }
  }

  /** Withdraw a grant — a chargeback, an abusive share, a mistaken order. */
  async revoke(grantId: string): Promise<void> {
    await db
      .from('ecommerce_download_grants')
      .where('id', grantId)
      .whereNull('revoked_at')
      .update({ revoked_at: DateTime.now().toSQL(), updated_at: DateTime.now().toSQL() })
  }

  /** Revoke everything an order granted. Used when a paid order is refunded. */
  async revokeForOrder(orderId: string, trx?: TransactionClientContract): Promise<void> {
    const query = trx ? trx.from('ecommerce_download_grants') : db.from('ecommerce_download_grants')
    await query
      .where('order_id', orderId)
      .whereNull('revoked_at')
      .update({ revoked_at: DateTime.now().toSQL(), updated_at: DateTime.now().toSQL() })
  }

  private toAssetDto(asset: DigitalAsset): DigitalAssetDto {
    return {
      id: asset.id,
      variantId: asset.variantId,
      filename: asset.filename,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes === null ? null : Number(asset.sizeBytes),
      maxDownloads: asset.maxDownloads,
      linkTtlHours: asset.linkTtlHours,
      createdAt: asset.createdAt.toISO() ?? '',
    }
  }
}
