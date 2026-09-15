import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import { newUlid } from '#services/ulid_service'
import { emptyReport, type DataSection } from '../registry.js'

/**
 * Site navigation: the Menu Manager's `menus` + `menu_items` tables. MenuBar
 * blocks reference a menu by its stable `handle`, so handles are ALWAYS
 * preserved (never regenerated) — otherwise a block would render empty on the
 * target. Item ids may regenerate; `page_id`/`record_id` are remapped through
 * `ctx.idMap` (identity in preserve mode), which is why this runs AFTER pages
 * (60) and collection_records (50) so those maps are already populated.
 *
 * `menu_items` self-references `parent_id`, so import is a two-pass parent→child
 * insert. Loose references (page/record that no longer exists) resolve to '#' at
 * render time, so a dangling target is not fatal.
 */
export const menusSection: DataSection = {
  name: 'menus',
  owner: 'core',
  order: 62,
  label: 'Menus & navigation',
  // Dependency order (parents first); the replace-wipe reverses it so child
  // rows (menu_items) are deleted before their menus.
  tables: ['menus', 'menu_items'],

  async export() {
    const menus = await db
      .from('menus')
      .whereNull('deleted_at')
      .select('id', 'handle', 'name')
    const items = await db
      .from('menu_items')
      .whereNull('deleted_at')
      .select(
        'id',
        'menu_id',
        'parent_id',
        'position',
        'label',
        'type',
        'page_id',
        'url',
        'collection_key',
        'record_id',
        'target',
        'open_mode'
      )
    return { menus, menu_items: items }
  },

  async import(ctx, data) {
    const report = emptyReport('menus')
    const payload = (data ?? {}) as {
      menus?: Array<{ id?: string; handle?: string; name?: string }>
      menu_items?: Array<Record<string, unknown>>
    }
    const regen = ctx.mode === 'regenerate'
    const now = DateTime.now().toSQL()

    // old menu id -> resolved menu id in the target.
    const menuIdMap = new Map<string, string>()
    // Menus whose items should be (re)written this run: the ones we created, or
    // existing ones we're overwriting. In `skip` mode an existing menu is left
    // untouched, items included.
    const menusToWriteItems = new Set<string>()

    // Pass 1 — menus, upserted by natural key `handle` (handle never changes).
    for (const m of payload.menus ?? []) {
      const handle = String(m.handle ?? '')
      const oldId = String(m.id ?? '')
      if (!handle) continue
      try {
        const existing = await db.from('menus').where('handle', handle).select('id').first()
        if (existing) {
          const resolvedId = String(existing.id)
          if (oldId) menuIdMap.set(oldId, resolvedId)
          if (ctx.conflict === 'skip') {
            report.skipped++
            continue
          }
          await db
            .from('menus')
            .where('id', resolvedId)
            .update({ name: String(m.name ?? handle), updated_at: now })
          menusToWriteItems.add(resolvedId)
          report.updated++
          continue
        }
        const newId = regen ? newUlid() : oldId || newUlid()
        await db.table('menus').insert({
          id: newId,
          handle,
          name: String(m.name ?? handle),
          created_at: now,
          updated_at: now,
        })
        if (oldId) menuIdMap.set(oldId, newId)
        menusToWriteItems.add(newId)
        report.created++
      } catch (e) {
        report.warnings.push(`menu "${handle}": ${(e as Error).message}`)
      }
    }

    // Clear existing items of any menu we're (re)writing, so a re-import doesn't
    // duplicate them.
    for (const menuId of menusToWriteItems) {
      try {
        await db.from('menu_items').where('menu_id', menuId).delete()
      } catch {
        /* nothing to clear */
      }
    }

    // Pass 2 — items, parent before child. Iterate until no more can be placed.
    const items = (payload.menu_items ?? []).filter((it) => {
      const menuId = menuIdMap.get(String(it.menu_id ?? ''))
      return menuId && menusToWriteItems.has(menuId)
    })
    const itemIdMap = new Map<string, string>()
    const remaining = [...items]
    let progressed = true
    while (remaining.length > 0 && progressed) {
      progressed = false
      for (let i = remaining.length - 1; i >= 0; i--) {
        const it = remaining[i]
        const oldParent = it.parent_id ? String(it.parent_id) : null
        // A child can be placed once its parent has been inserted (or has none).
        if (oldParent && !itemIdMap.has(oldParent)) continue
        const oldId = String(it.id ?? '')
        const menuId = menuIdMap.get(String(it.menu_id ?? ''))!
        const newId = regen ? newUlid() : oldId || newUlid()
        const pageId = it.page_id ? String(it.page_id) : null
        const recordId = it.record_id ? String(it.record_id) : null
        try {
          await db.table('menu_items').insert({
            id: newId,
            menu_id: menuId,
            parent_id: oldParent ? itemIdMap.get(oldParent)! : null,
            position: Number(it.position ?? 0),
            label: String(it.label ?? ''),
            type: String(it.type ?? 'url'),
            // Loose refs: remap through idMap (identity in preserve mode).
            page_id: pageId ? (ctx.idMap.get(pageId) ?? pageId) : null,
            url: (it.url as string) ?? null,
            collection_key: (it.collection_key as string) ?? null,
            record_id: recordId ? (ctx.idMap.get(recordId) ?? recordId) : null,
            target: String(it.target ?? '_self'),
            open_mode: String(it.open_mode ?? 'link'),
            created_at: now,
            updated_at: now,
          })
          if (oldId) itemIdMap.set(oldId, newId)
          report.created++
          progressed = true
        } catch (e) {
          report.warnings.push(`menu item "${String(it.label ?? '')}": ${(e as Error).message}`)
        }
        remaining.splice(i, 1)
      }
    }
    if (remaining.length > 0) {
      report.warnings.push(`${remaining.length} menu item(s) skipped — unresolved parent`)
    }
    return report
  },
}
