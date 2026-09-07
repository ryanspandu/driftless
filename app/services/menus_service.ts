import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import Menu from '#models/menu'
import MenuItem from '#models/menu_item'
import Page from '#models/page'
import { newUlid } from '#services/ulid_service'
import type { MenuItemType, MenuItemOpenMode } from '#models/menu_item'

/** `primary-menu` from `Primary Menu`. */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export interface MenuSummaryDto {
  id: string
  handle: string
  name: string
  itemCount: number
  createdAt: string
  updatedAt: string
}

/** A menu item as edited in the admin (the raw stored reference, not resolved). */
export interface MenuItemDto {
  id: string
  label: string
  type: MenuItemType
  pageId: string | null
  url: string | null
  collectionKey: string | null
  recordId: string | null
  target: '_self' | '_blank'
  openMode: MenuItemOpenMode
  children: MenuItemDto[]
}

export interface MenuDto extends MenuSummaryDto {
  items: MenuItemDto[]
}

/** A menu item ready to render — reference resolved to a concrete `href`. */
export interface ResolvedMenuItem {
  id: string
  label: string
  href: string
  target: '_self' | '_blank'
  openMode: MenuItemOpenMode
  children: ResolvedMenuItem[]
}

export interface ResolvedMenu {
  handle: string
  name: string
  items: ResolvedMenuItem[]
}

export interface CreateMenuInput {
  name: string
  handle?: string
}

export interface UpdateMenuInput {
  name?: string
  handle?: string
}

/** One node of a menu tree as submitted by the admin (nested, acyclic). */
export interface MenuItemInput {
  id?: string
  label: string
  type?: MenuItemType
  pageId?: string | null
  url?: string | null
  collectionKey?: string | null
  recordId?: string | null
  target?: '_self' | '_blank'
  openMode?: MenuItemOpenMode
  children?: MenuItemInput[]
}

export default class MenusService {
  async list(): Promise<MenuSummaryDto[]> {
    const rows = await Menu.query().whereNull('deleted_at').orderBy('updated_at', 'desc')
    const counts = await this.itemCounts(rows.map((r) => r.id))
    return rows.map((r) => this.toSummary(r, counts.get(r.id) ?? 0))
  }

  async find(id: string): Promise<MenuDto> {
    const menu = await Menu.query().where('id', id).whereNull('deleted_at').firstOrFail()
    const items = await this.loadItems(menu.id)
    return { ...this.toSummary(menu, items.length), items: this.buildDtoTree(items, null) }
  }

  async create(input: CreateMenuInput): Promise<MenuDto> {
    const name = String(input.name ?? '').trim()
    if (!name) throw new Error('Name is required')
    const handle = await this.uniqueHandle(input.handle?.trim() || slugify(name) || 'menu')
    const menu = await Menu.create({ id: newUlid(), handle, name })
    return { ...this.toSummary(menu, 0), items: [] }
  }

  async update(id: string, input: UpdateMenuInput): Promise<MenuDto> {
    const menu = await Menu.query().where('id', id).whereNull('deleted_at').firstOrFail()
    if (input.name !== undefined) {
      const name = String(input.name).trim()
      if (!name) throw new Error('Name is required')
      menu.name = name
    }
    if (input.handle !== undefined) {
      const next = slugify(input.handle) || menu.handle
      if (next !== menu.handle) menu.handle = await this.uniqueHandle(next, menu.id)
    }
    await menu.save()
    const items = await this.loadItems(menu.id)
    return { ...this.toSummary(menu, items.length), items: this.buildDtoTree(items, null) }
  }

  async remove(id: string): Promise<void> {
    const menu = await Menu.query().where('id', id).whereNull('deleted_at').firstOrFail()
    const now = DateTime.now()
    await db.transaction(async (trx) => {
      menu.useTransaction(trx)
      menu.deletedAt = now
      await menu.save()
      // Soft-delete the items too, so a re-created menu with the same handle
      // never inherits a dead menu's orphaned rows.
      await MenuItem.query({ client: trx })
        .where('menu_id', menu.id)
        .whereNull('deleted_at')
        .update({ deleted_at: now.toSQL() })
    })
  }

  /**
   * Replace a menu's whole item tree in one atomic write.
   *
   * The admin edits the tree client-side and submits it nested; here we walk it,
   * assigning `position` by sibling order and `parentId` by nesting, upserting
   * by id (new nodes get a fresh ULID) and soft-deleting anything dropped. A
   * nested input is acyclic by construction, so no cycle can be introduced.
   */
  async saveTree(id: string, nodes: MenuItemInput[]): Promise<MenuDto> {
    const menu = await Menu.query().where('id', id).whereNull('deleted_at').firstOrFail()
    const existing = await this.loadItems(menu.id)
    const existingIds = new Set(existing.map((r) => r.id))
    const seen = new Set<string>()
    const now = DateTime.now()

    await db.transaction(async (trx) => {
      const walk = async (list: MenuItemInput[], parentId: string | null) => {
        let position = 0
        for (const node of list) {
          const itemId = node.id && existingIds.has(node.id) ? node.id : newUlid()
          seen.add(itemId)
          // Model attributes (camelCase); updateOrCreate handles insert vs update
          // and un-soft-deletes a re-added item via `deletedAt: null`.
          await MenuItem.updateOrCreate(
            { id: itemId },
            {
              id: itemId,
              menuId: menu.id,
              parentId,
              position: position++,
              label: String(node.label ?? '').trim() || 'Untitled',
              type: (node.type ?? 'url') as MenuItemType,
              pageId: node.pageId ?? null,
              url: node.url ?? null,
              collectionKey: node.collectionKey ?? null,
              recordId: node.recordId ?? null,
              target: node.target === '_blank' ? '_blank' : '_self',
              openMode: node.openMode === 'mega' ? 'mega' : 'link',
              deletedAt: null,
            },
            { client: trx }
          )
          if (node.children?.length) await walk(node.children, itemId)
        }
      }
      await walk(nodes, null)

      // Prune items no longer present.
      const stale = [...existingIds].filter((x) => !seen.has(x))
      if (stale.length) {
        await MenuItem.query({ client: trx })
          .whereIn('id', stale)
          .update({ deleted_at: now.toSQL() })
      }
      menu.useTransaction(trx)
      menu.updatedAt = now
      await menu.save()
    })

    const items = await this.loadItems(menu.id)
    return { ...this.toSummary(menu, items.length), items: this.buildDtoTree(items, null) }
  }

  /**
   * A menu resolved for rendering: nested tree, each item's reference turned
   * into a concrete `href`. `null` when no live menu has this handle — the
   * caller renders nothing rather than erroring.
   */
  async resolveByHandle(handle: string): Promise<ResolvedMenu | null> {
    const menu = await Menu.query().where('handle', handle).whereNull('deleted_at').first()
    if (!menu) return null
    const items = await this.loadItems(menu.id)
    const paths = await this.pagePaths(items)
    return {
      handle: menu.handle,
      name: menu.name,
      items: this.buildResolvedTree(items, null, paths),
    }
  }

  // ── internals ──────────────────────────────────────────────────────────

  private async loadItems(menuId: string): Promise<MenuItem[]> {
    return MenuItem.query()
      .where('menu_id', menuId)
      .whereNull('deleted_at')
      .orderBy('position', 'asc')
  }

  private async itemCounts(menuIds: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>()
    if (!menuIds.length) return out
    const rows = await db
      .from('menu_items')
      .whereIn('menu_id', menuIds)
      .whereNull('deleted_at')
      .groupBy('menu_id')
      .count('* as count')
      .select('menu_id')
    for (const row of rows as Array<{ menu_id: string; count: number | string }>) {
      out.set(row.menu_id, Number(row.count))
    }
    return out
  }

  /** Public path for every page an item references, by page id. */
  private async pagePaths(items: MenuItem[]): Promise<Map<string, string>> {
    const ids = items.filter((i) => i.type === 'page' && i.pageId).map((i) => i.pageId as string)
    const out = new Map<string, string>()
    if (!ids.length) return out
    const pages = await Page.query()
      .whereIn('id', [...new Set(ids)])
      .select('id', 'path')
    for (const p of pages) out.set(p.id, p.path)
    return out
  }

  private buildDtoTree(items: MenuItem[], parentId: string | null): MenuItemDto[] {
    return items
      .filter((i) => i.parentId === parentId)
      .map((i) => ({
        id: i.id,
        label: i.label,
        type: i.type,
        pageId: i.pageId,
        url: i.url,
        collectionKey: i.collectionKey,
        recordId: i.recordId,
        target: i.target,
        openMode: i.openMode,
        children: this.buildDtoTree(items, i.id),
      }))
  }

  private buildResolvedTree(
    items: MenuItem[],
    parentId: string | null,
    paths: Map<string, string>
  ): ResolvedMenuItem[] {
    return items
      .filter((i) => i.parentId === parentId)
      .map((i) => ({
        id: i.id,
        label: i.label,
        href: this.hrefFor(i, paths),
        target: i.target,
        openMode: i.openMode,
        children: this.buildResolvedTree(items, i.id, paths),
      }))
  }

  private hrefFor(item: MenuItem, paths: Map<string, string>): string {
    if (item.type === 'page') return (item.pageId && paths.get(item.pageId)) || '#'
    if (item.type === 'url') return item.url || '#'
    // 'collection' record URLs depend on the CMS page routing — not wired yet.
    return '#'
  }

  private async uniqueHandle(base: string, excludeId?: string): Promise<string> {
    const clean = slugify(base) || 'menu'
    let candidate = clean
    let n = 1
    // Small tables; a short loop is fine and keeps the check race-tolerant enough
    // for an admin form (the unique index is the real guarantee).
    while (true) {
      const q = Menu.query().where('handle', candidate).whereNull('deleted_at')
      if (excludeId) q.whereNot('id', excludeId)
      const clash = await q.first()
      if (!clash) return candidate
      n += 1
      candidate = `${clean}-${n}`
    }
  }

  private toSummary(menu: Menu, itemCount: number): MenuSummaryDto {
    return {
      id: menu.id,
      handle: menu.handle,
      name: menu.name,
      itemCount,
      createdAt: menu.createdAt.toISO()!,
      updatedAt: menu.updatedAt.toISO()!,
    }
  }
}
