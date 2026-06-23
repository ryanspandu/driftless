import { DateTime } from 'luxon'
import Module from '#models/module'
import Permission from '#models/permission'
import { newUlid } from '#services/ulid_service'
import { MODULES, getModule, allModulePermissions } from '#modules/registry'
import type { ModuleNav, ModuleNavItem } from '#modules/types'

export interface ModuleDto {
  name: string
  label: string
  description: string
  version: string
  enabled: boolean
}

/** Nav group as sent to the sidebar (the manifest `nav` + the module name). */
export interface ModuleMenuItem extends ModuleNav {
  name: string
  items?: ModuleNavItem[]
}

/**
 * Module-level cache of `name -> enabled`, shared across service instances so
 * the per-request `moduleEnabled` guard does not hit the DB on every request.
 * Busted whenever a module is toggled or reconciled.
 */
const enabledCache = new Map<string, boolean>()
let cacheLoaded = false

export default class ModulesService {
  private async loadCache(): Promise<void> {
    const rows = await Module.all()
    enabledCache.clear()
    for (const row of rows) enabledCache.set(row.name, Boolean(row.enabled))
    cacheLoaded = true
  }

  bustCache(): void {
    cacheLoaded = false
    enabledCache.clear()
  }

  /** Per-request guard reads this. Unknown / undetected modules are off. */
  async isEnabled(name: string): Promise<boolean> {
    if (!cacheLoaded) await this.loadCache()
    return enabledCache.get(name) ?? false
  }

  /** Snapshot of the enabled map (used by the provider to gate boot hooks). */
  async enabledMap(): Promise<Map<string, boolean>> {
    if (!cacheLoaded) await this.loadCache()
    return new Map(enabledCache)
  }

  /** Insert rows for newly-detected modules; keep version in sync. */
  async reconcile(): Promise<void> {
    const existing = await Module.all()
    const byName = new Map(existing.map((r) => [r.name, r]))

    for (const manifest of MODULES) {
      const row = byName.get(manifest.name)
      if (!row) {
        await Module.create({
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

  /** Mint every module's declared permissions into the RBAC tables. */
  async mintPermissions(): Promise<void> {
    for (const perm of allModulePermissions()) {
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

  /** Registry manifests merged with DB enabled state — drives the Settings panel. */
  async list(): Promise<ModuleDto[]> {
    const rows = await Module.all()
    const byName = new Map(rows.map((r) => [r.name, r]))
    return MODULES.map((m) => {
      const row = byName.get(m.name)
      return {
        name: m.name,
        label: m.label,
        description: m.description,
        version: m.version,
        enabled: row ? Boolean(row.enabled) : (m.autoEnable ?? true),
      }
    })
  }

  async setEnabled(name: string, enabled: boolean): Promise<ModuleDto> {
    const manifest = getModule(name)
    if (!manifest) throw new Error(`Unknown module: ${name}`)

    let row = await Module.findBy('name', name)
    if (!row) {
      row = await Module.create({
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
    }
  }

  /** Sidebar nav groups for enabled modules (ordered; permission-filtered client-side). */
  async enabledMenu(): Promise<ModuleMenuItem[]> {
    const rows = await Module.all()
    const enabledNames = new Set(rows.filter((r) => Boolean(r.enabled)).map((r) => r.name))
    return MODULES.filter((m) => enabledNames.has(m.name) && m.nav)
      .map((m) => ({ name: m.name, ...m.nav! }))
      .sort((a, b) => (a.order ?? 100) - (b.order ?? 100))
  }
}
