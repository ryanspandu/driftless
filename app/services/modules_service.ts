import { DateTime } from 'luxon'
import semver from 'semver'
import Module from '#models/module'
import Permission from '#models/permission'
import { newUlid } from '#services/ulid_service'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  DISABLED_BY_ENV,
  MODULES,
  MODULES_DIR,
  SAFE_MODE,
  getModule,
  allModulePermissions,
} from '#modules/registry'
import type { ModuleNav, ModuleNavItem } from '#modules/types'
import SchemaInstallerService from '#services/schema_installer_service'

export interface ModuleDto {
  name: string
  label: string
  description: string
  version: string
  enabled: boolean
  /**
   * Whether every table the manifest declares exists.
   *
   * `false` means the module is registered in code but its migrations have not
   * been applied. Enabling it in that state used to "work" — the sidebar entry
   * appeared, the page rendered, and then the first API call 500'd on a missing
   * relation with nothing in the UI to explain why.
   *
   * Modules that declare no tables are always ready.
   */
  schemaReady: boolean
  /** Whether uninstall is even possible (the manifest declares its tables). */
  canUninstall: boolean
  /**
   * Trust tier, from the manifest.
   *
   * Required rather than optional: the server always knows the answer (`'app'`
   * is the manifest default), and an optional field would push a `?? 'app'`
   * into every call site that reads it.
   */
  kind: 'app' | 'plugin'
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
 *
 * The cache also **expires**, because busting it only clears the copy held by
 * the process that handled the toggle. In a multi-process deployment (PM2
 * cluster, several containers) the others would otherwise keep serving the old
 * answer until they restarted — a module disabled on one worker stays reachable
 * on the rest. A short TTL bounds that window without needing cross-process
 * messaging.
 */
const CACHE_TTL_MS = 10_000

const enabledCache = new Map<string, boolean>()
let cacheLoadedAt = 0

export default class ModulesService {
  private async loadCache(): Promise<void> {
    const rows = await Module.all()
    enabledCache.clear()
    for (const row of rows) enabledCache.set(row.name, Boolean(row.enabled))
    cacheLoadedAt = Date.now()
  }

  private cacheIsFresh(): boolean {
    return cacheLoadedAt > 0 && Date.now() - cacheLoadedAt < CACHE_TTL_MS
  }

  bustCache(): void {
    cacheLoadedAt = 0
    enabledCache.clear()
  }

  /** Per-request guard reads this. Unknown / undetected modules are off. */
  async isEnabled(name: string): Promise<boolean> {
    if (!this.cacheIsFresh()) await this.loadCache()
    return enabledCache.get(name) ?? false
  }

  /** Snapshot of the enabled map (used by the provider to gate boot hooks). */
  async enabledMap(): Promise<Map<string, boolean>> {
    if (!this.cacheIsFresh()) await this.loadCache()
    return new Map(enabledCache)
  }

  /** Insert rows for newly-detected modules; keep version in sync. */
  async reconcile(): Promise<void> {
    const existing = await Module.all()
    const byName = new Map(existing.map((r) => [r.name, r]))
    const installer = new SchemaInstallerService()

    for (const manifest of MODULES) {
      const kind = manifest.kind ?? 'app'
      const row = byName.get(manifest.name)

      if (!row) {
        /**
         * A newly-detected module is only enabled if its tables are actually
         * there.
         *
         * Enabling unconditionally is how a folder dropped into `modules/`
         * turns into a spurious quarantine: reconcile switches it on, `boot()`
         * then runs against relations that do not exist, throws, and the
         * provider disables it again with a `boot_error` that describes a
         * migration that was never run rather than a broken module. The
         * operator sees "this module crashed" when the truth is "this module
         * has not been installed yet".
         *
         * `tablesReady` is one bulk catalogue query, and this runs only for
         * modules that have no row yet — not on every boot.
         */
        const ready = await installer.tablesReady(manifest.tables ?? [])

        await Module.create({
          id: newUlid(),
          name: manifest.name,
          enabled: (manifest.autoEnable ?? true) && ready,
          version: manifest.version,
          kind,
          installedAt: DateTime.now(),
        })
        continue
      }

      /**
       * `version` and `kind` are both manifest-owned, so both are synced here
       * rather than only at install time. `kind` in particular has to be: the
       * plugins-into-modules migration runs *after* this reconcile has already
       * created the row from the manifest, so a row written without it would
       * keep the column default and quietly claim to be an app forever.
       */
      if (row.version !== manifest.version || row.kind !== kind) {
        const previous = row.version

        row.version = manifest.version
        row.kind = kind
        await row.save()

        /**
         * A version that moved *forward* is an upgrade. Sideways or backward
         * moves are left alone: a downgrade has no hook to run, and running an
         * upgrade path for it would be worse than doing nothing.
         */
        if (
          manifest.onUpgrade &&
          previous &&
          semver.valid(previous) &&
          semver.valid(manifest.version) &&
          semver.gt(manifest.version, previous)
        ) {
          try {
            await manifest.onUpgrade(previous)
          } catch (error) {
            // Logged, not fatal, and the module stays enabled — see the hook's
            // docblock for why.
            console.error(`[modules] "${manifest.name}" onUpgrade(${previous}) failed:`, error)
          }
        }
      }
    }

    await this.pruneOrphans(byName)
    this.bustCache()
  }

  /**
   * Drop rows for modules whose folder is gone.
   *
   * Without this, removing a folder leaves its row behind forever — reported as
   * enabled, counted in the admin, and blocking a later install of the same
   * name on the unique index.
   *
   * **Gated on safe mode, and that gate is load-bearing.** Safe mode discovers
   * zero modules deliberately; pruning against that would read every module as
   * missing and delete the operator's entire enabled state on the one boot they
   * performed to recover. The disable list has the same shape and the same
   * gate.
   */
  private async pruneOrphans(rows: Map<string, Module>): Promise<void> {
    if (SAFE_MODE || DISABLED_BY_ENV.size > 0) return

    const present = new Set(MODULES.map((m) => m.name))

    for (const [name, row] of rows) {
      if (present.has(name)) continue

      /**
       * Only rows whose *folder* is absent. A module refused by discovery — an
       * incompatible `engines` range, an unmet requirement — is still installed
       * and must keep its row, or fixing the cause would silently lose whether
       * the operator had it enabled.
       */
      if (existsSync(join(MODULES_DIR, name))) continue

      await row.delete()
      console.warn(`[modules] pruned "${name}" — its folder is gone`)
    }
  }

  /**
   * Switch a module off because its own `boot()` threw, recording why.
   *
   * Deliberately separate from `setEnabled`: this is not an operator decision,
   * it carries a reason, and it must never fire the `onEnable` hook. Failing to
   * record it would mean the same module breaking every restart with nothing in
   * the admin explaining it.
   */
  async quarantine(name: string, reason: string): Promise<void> {
    await Module.query()
      .where('name', name)
      .update({
        enabled: false,
        boot_error: reason.slice(0, 1000),
      })

    this.bustCache()
  }

  /**
   * Take back the permissions a module minted, on uninstall.
   *
   * Only the ones **no other installed module also declares**. Two packages can
   * legitimately name the same permission, and revoking a shared one because
   * one of them left would quietly strip a capability from a module that is
   * still running.
   *
   * Deleting the permission row cascades to `permission_role`, so the grants go
   * with it. Leaving them behind would let a reinstall silently restore access
   * an operator had deliberately removed in between.
   */
  async revokePermissions(name: string): Promise<string[]> {
    const manifest = getModule(name)
    if (!manifest) return []

    const mine = manifest.permissions.map((p) => p.name)
    if (mine.length === 0) return []

    const claimedElsewhere = new Set(
      MODULES.filter((m) => m.name !== name).flatMap((m) => m.permissions.map((p) => p.name))
    )

    const removable = mine.filter((permission) => !claimedElsewhere.has(permission))
    if (removable.length === 0) return []

    await Permission.query().whereIn('name', removable).delete()

    return removable
  }

  /** Mint every module's declared permissions into the RBAC tables. */
  async mintPermissions(): Promise<void> {
    /**
     * Deduplicated by name, because two modules may legitimately declare the
     * same permission — an e-commerce app and a reporting plugin both wanting
     * `reports:read`, say. `allModulePermissions()` flat-maps the manifests, so
     * without this the batched insert below hits the unique index on `name` and
     * **every module's permissions fail to mint at all**. First declaration
     * wins; the description is cosmetic and either is honest.
     */
    const wanted = [...new Map(allModulePermissions().map((p) => [p.name, p])).values()]
    if (wanted.length === 0) return

    /**
     * One SELECT and one batched INSERT, rather than a query per permission.
     *
     * This runs on every boot and before every test that touches a module, so
     * the naive shape — SELECT then INSERT per row — is paid constantly. The
     * update is also conditional: rewriting a description that has not changed
     * is a write for nothing.
     */
    const existing = await Permission.query().whereIn(
      'name',
      wanted.map((p) => p.name)
    )
    const byName = new Map(existing.map((row) => [row.name, row]))

    const missing: { id: string; name: string; description: string; isSystem: boolean }[] = []

    for (const perm of wanted) {
      const row = byName.get(perm.name)
      if (!row) {
        missing.push({
          id: newUlid(),
          name: perm.name,
          description: perm.description,
          isSystem: true,
        })
        continue
      }

      if (row.description !== perm.description || !row.isSystem) {
        row.description = perm.description
        row.isSystem = true
        await row.save()
      }
    }

    if (missing.length > 0) await Permission.createMany(missing)
  }

  /** Registry manifests merged with DB enabled state — drives the Settings panel. */
  async list(): Promise<ModuleDto[]> {
    const rows = await Module.all()
    const byName = new Map(rows.map((r) => [r.name, r]))
    const installer = new SchemaInstallerService()

    return Promise.all(
      MODULES.map(async (m) => {
        const row = byName.get(m.name)
        return {
          name: m.name,
          label: m.label,
          description: m.description,
          version: m.version,
          enabled: row ? Boolean(row.enabled) : (m.autoEnable ?? true),
          schemaReady: await installer.tablesReady(m.tables ?? []),
          canUninstall: Boolean(m.tables?.length),
          /**
           * From the manifest, not `row.kind` — same rule as `label` and
           * `version` above. The manifest is what the code actually is; the row
           * is a cache of it that `reconcile()` keeps in step.
           */
          kind: m.kind ?? 'app',
        }
      })
    )
  }

  /** The manifest's declared tables, for the installer. */
  tablesFor(name: string): string[] {
    return getModule(name)?.tables ?? []
  }

  /**
   * Ask the module whether it is willing to be uninstalled.
   *
   * A module with data an operator cannot recreate — paid orders, issued
   * invoices — is expected to refuse here rather than rely on the confirmation
   * dialog being read carefully.
   */
  async canUninstall(name: string): Promise<{ ok: boolean; reason?: string }> {
    const manifest = getModule(name)
    if (!manifest) return { ok: false, reason: `Unknown module: ${name}` }
    if (!manifest.tables?.length) {
      return { ok: false, reason: 'This module does not declare the tables it owns.' }
    }
    if (!manifest.canUninstall) return { ok: true }
    return manifest.canUninstall()
  }

  async setEnabled(name: string, enabled: boolean): Promise<ModuleDto> {
    const manifest = getModule(name)
    if (!manifest) throw new Error(`Unknown module: ${name}`)

    let row = await Module.findBy('name', name)
    const wasEnabled = Boolean(row?.enabled)

    if (!row) {
      row = await Module.create({
        id: newUlid(),
        name,
        enabled,
        version: manifest.version,
        /**
         * Without this the column default (`'app'`) wins, so a plugin toggled
         * before `reconcile()` ever saw it is persisted as an app — and stays
         * that way until the manifest's version happens to change, because
         * reconcile only re-syncs `kind` when it notices drift.
         */
        kind: manifest.kind ?? 'app',
        installedAt: DateTime.now(),
      })
    } else {
      row.enabled = enabled
      await row.save()
    }
    this.bustCache()

    /**
     * First-run content, on the off→on edge only.
     *
     * After the row is saved and the cache is busted, so the hook sees the
     * module as enabled — its own routes and services check that. Failures are
     * logged and swallowed: seeding convenience content is not a reason to
     * leave a module half enabled, and the operator can always create the
     * content by hand.
     */
    if (enabled && !wasEnabled && typeof manifest.onEnable === 'function') {
      try {
        await manifest.onEnable()
      } catch (error) {
        console.error('[modules] onEnable failed', {
          module: name,
          error: (error as Error).message,
        })
      }
    }

    return {
      name: manifest.name,
      label: manifest.label,
      description: manifest.description,
      version: manifest.version,
      enabled: Boolean(row.enabled),
      schemaReady: await new SchemaInstallerService().tablesReady(manifest.tables ?? []),
      canUninstall: Boolean(manifest.tables?.length),
      kind: manifest.kind ?? 'app',
    }
  }

  /**
   * Sidebar nav groups for enabled modules (ordered; permission-filtered client-side).
   *
   * A manifest may declare several groups (`nav` as an array), so one module can
   * own more than one top-level section — e.g. "Shop" and "Marketing".
   */
  async enabledMenu(): Promise<ModuleMenuItem[]> {
    const rows = await Module.all()
    const enabledNames = new Set(rows.filter((r) => Boolean(r.enabled)).map((r) => r.name))
    return MODULES.filter((m) => enabledNames.has(m.name) && m.nav)
      .flatMap((m) => {
        const groups = Array.isArray(m.nav) ? m.nav : [m.nav!]
        return groups.map((nav) => ({ name: m.name, ...nav }))
      })
      .sort((a, b) => (a.order ?? 100) - (b.order ?? 100))
  }
}
