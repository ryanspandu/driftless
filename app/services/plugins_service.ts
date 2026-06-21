import { DateTime } from 'luxon'
import Plugin from '#models/plugin'
import Permission from '#models/permission'
import { newUlid } from '#services/ulid_service'
import { PLUGINS, getPlugin, allPluginPermissions } from '#plugins/registry'
import type { PluginAdminMenu } from '#plugins/types'

export interface PluginDto {
  name: string
  label: string
  description: string
  version: string
  enabled: boolean
  adminMenu: PluginAdminMenu | null
}

/**
 * Module-level cache of `name -> enabled`, shared across service instances so
 * the per-request `pluginEnabled` guard does not hit the DB on every request.
 * Busted whenever a plugin is toggled or reconciled.
 */
const enabledCache = new Map<string, boolean>()
let cacheLoaded = false

export default class PluginsService {
  private async loadCache(): Promise<void> {
    const rows = await Plugin.all()
    enabledCache.clear()
    for (const row of rows) enabledCache.set(row.name, Boolean(row.enabled))
    cacheLoaded = true
  }

  bustCache(): void {
    cacheLoaded = false
    enabledCache.clear()
  }

  /** Per-request guard reads this. Unknown / undetected plugins are off. */
  async isEnabled(name: string): Promise<boolean> {
    if (!cacheLoaded) await this.loadCache()
    return enabledCache.get(name) ?? false
  }

  /** Insert rows for newly-detected plugins; keep version in sync. */
  async reconcile(): Promise<void> {
    const existing = await Plugin.all()
    const byName = new Map(existing.map((r) => [r.name, r]))

    for (const manifest of PLUGINS) {
      const row = byName.get(manifest.name)
      if (!row) {
        await Plugin.create({
          id: newUlid(),
          name: manifest.name,
          enabled: manifest.autoEnable ?? true,
          version: manifest.version,
          installedAt: DateTime.now(),
        })
      } else if (row.version !== manifest.version) {
        row.version = manifest.version
        await row.save()
      }
    }
    this.bustCache()
  }

  /** Mint every plugin's declared permissions into the RBAC tables. */
  async mintPermissions(): Promise<void> {
    for (const perm of allPluginPermissions()) {
      const existing = await Permission.query().where('name', perm.name).first()
      if (existing) {
        existing.description = perm.description
        existing.isSystem = true
        await existing.save()
      } else {
        await Permission.create({
          id: newUlid(),
          name: perm.name,
          description: perm.description,
          isSystem: true,
        })
      }
    }
  }

  /** Registry manifests merged with DB enabled state — drives `/admin/plugins`. */
  async list(): Promise<PluginDto[]> {
    const rows = await Plugin.all()
    const byName = new Map(rows.map((r) => [r.name, r]))
    return PLUGINS.map((m) => {
      const row = byName.get(m.name)
      return {
        name: m.name,
        label: m.label,
        description: m.description,
        version: m.version,
        enabled: row ? Boolean(row.enabled) : (m.autoEnable ?? true),
        adminMenu: m.adminMenu ?? null,
      }
    })
  }

  async setEnabled(name: string, enabled: boolean): Promise<PluginDto> {
    const manifest = getPlugin(name)
    if (!manifest) throw new Error(`Unknown plugin: ${name}`)

    let row = await Plugin.findBy('name', name)
    if (!row) {
      row = await Plugin.create({
        id: newUlid(),
        name,
        enabled,
        version: manifest.version,
        installedAt: DateTime.now(),
      })
    } else {
      row.enabled = enabled
      await row.save()
    }
    this.bustCache()

    return {
      name: manifest.name,
      label: manifest.label,
      description: manifest.description,
      version: manifest.version,
      enabled: Boolean(row.enabled),
      adminMenu: manifest.adminMenu ?? null,
    }
  }

  /** Admin-menu entries for enabled plugins (sidebar). */
  async enabledMenu(): Promise<PluginAdminMenu[]> {
    const rows = await Plugin.all()
    const enabledNames = new Set(rows.filter((r) => Boolean(r.enabled)).map((r) => r.name))
    return PLUGINS.filter((m) => enabledNames.has(m.name) && m.adminMenu).map((m) => m.adminMenu!)
  }
}
