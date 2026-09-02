import { DateTime } from 'luxon'
import Redirect from '#models/redirect'
import { newUlid } from '#services/ulid_service'

export interface RedirectDto {
  id: string
  fromPath: string
  toPath: string
  status: number
  hits: number
  createdAt: string
  updatedAt: string
}

/** Strip surrounding slashes so `from_path` matches the catch-all's `path`. */
export function normalizeFromPath(input: string): string {
  return String(input ?? '')
    .trim()
    .replace(/^\/+|\/+$/g, '')
}

export default class RedirectsService {
  /**
   * Resolve a request path to its redirect target, if any. Kept lean — this runs
   * on every 404-bound request. Returns the destination + status, or null.
   */
  async resolve(path: string): Promise<{ id: string; toPath: string; status: number } | null> {
    const from = normalizeFromPath(path)
    if (!from) return null
    const row = await Redirect.query().where('from_path', from).first()
    return row ? { id: row.id, toPath: row.toPath, status: row.status } : null
  }

  /** Best-effort hit counter; never blocks the redirect response. */
  async recordHit(id: string): Promise<void> {
    await Redirect.query().where('id', id).increment('hits', 1)
  }

  /**
   * Record that `oldPath` now lives at `newPath`. Called when a published page's
   * path changes. Idempotent; avoids the obvious loop (a redirect the other way
   * already exists) and never points a path at itself.
   */
  async capturePathChange(oldPath: string, newPath: string): Promise<void> {
    const from = normalizeFromPath(oldPath)
    const to = normalizeFromPath(newPath)
    if (!from || !to || from === to) return

    // Would create a 2-cycle (new → old already redirects); skip.
    const reverse = await Redirect.query().where('from_path', to).first()
    if (reverse && normalizeFromPath(reverse.toPath) === from) return

    const existing = await Redirect.query().where('from_path', from).first()
    if (existing) {
      existing.toPath = `/${to}`
      existing.status = 301
      await existing.save()
      return
    }
    await Redirect.create({
      id: newUlid(),
      fromPath: from,
      toPath: `/${to}`,
      status: 301,
    })
    // Any redirect that USED to point at the old path should now point at the
    // new one, so a chain collapses to a single hop.
    await Redirect.query()
      .where('to_path', `/${from}`)
      .update({ to_path: `/${to}` })
  }

  // ── Admin CRUD ─────────────────────────────────────────────────────────────

  async list(): Promise<RedirectDto[]> {
    const rows = await Redirect.query().orderBy('updated_at', 'desc')
    return rows.map((r) => this.toDto(r))
  }

  async create(input: { fromPath: string; toPath: string; status?: number }): Promise<RedirectDto> {
    const from = normalizeFromPath(input.fromPath)
    if (!from) throw new Error('From path is required.')
    const to = String(input.toPath ?? '').trim()
    if (!to) throw new Error('Destination is required.')
    if (normalizeFromPath(to) === from) throw new Error('A redirect cannot point at itself.')
    const exists = await Redirect.query().where('from_path', from).first()
    if (exists) throw new Error('A redirect for that path already exists.')

    const row = await Redirect.create({
      id: newUlid(),
      fromPath: from,
      toPath: to,
      status: input.status === 302 ? 302 : 301,
    })
    return this.toDto(row)
  }

  async update(
    id: string,
    input: { fromPath?: string; toPath?: string; status?: number }
  ): Promise<RedirectDto> {
    const row = await Redirect.findOrFail(id)
    if (input.fromPath !== undefined) {
      const from = normalizeFromPath(input.fromPath)
      if (!from) throw new Error('From path is required.')
      const clash = await Redirect.query().where('from_path', from).whereNot('id', id).first()
      if (clash) throw new Error('A redirect for that path already exists.')
      row.fromPath = from
    }
    if (input.toPath !== undefined) {
      const to = String(input.toPath).trim()
      if (!to) throw new Error('Destination is required.')
      row.toPath = to
    }
    if (input.status !== undefined) row.status = input.status === 302 ? 302 : 301
    if (normalizeFromPath(row.toPath) === row.fromPath) {
      throw new Error('A redirect cannot point at itself.')
    }
    row.updatedAt = DateTime.now()
    await row.save()
    return this.toDto(row)
  }

  async delete(id: string): Promise<void> {
    await Redirect.query().where('id', id).delete()
  }

  private toDto(row: Redirect): RedirectDto {
    return {
      id: row.id,
      fromPath: row.fromPath,
      toPath: row.toPath,
      status: row.status,
      hits: row.hits,
      createdAt: row.createdAt.toISO()!,
      updatedAt: row.updatedAt.toISO()!,
    }
  }
}
