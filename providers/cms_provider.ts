import type { ApplicationService } from '@adonisjs/core/types'
import { DateTime } from 'luxon'
import CmsCollection from '#models/cms_collection'
import CmsField from '#models/cms_field'
import { newUlid } from '#services/ulid_service'
import CmsPermissionsService from '#services/cms_permissions_service'
import { NATIVE_COLLECTIONS, nativeTableName } from '#cms/native_registry'
import { LOCK_KEYS, withAdvisoryLock } from '#services/advisory_lock'

export default class CmsProvider {
  constructor(protected app: ApplicationService) {}

  register() {}

  async boot() {
    const environment = this.app.getEnvironment()
    if (environment !== 'web' && environment !== 'console' && environment !== 'test') {
      return
    }

    const db = await this.app.container.make('lucid.db')
    const hasCmsTables = await db.connection().schema.hasTable('cms_collections')
    if (!hasCmsTables) {
      return
    }

    try {
      /**
       * Same key as the modules reconcile, not a second one.
       *
       * Both are find-or-create against unique indexes, both run in the same
       * first-boot window, and both would deadlock-by-ordering if they took
       * separate locks in different orders. Serialising the whole boot-time
       * reconcile behind one key is simpler than reasoning about two, and the
       * work is short.
       */
      await withAdvisoryLock(LOCK_KEYS.bootReconcile, () => this.reconcileNatives(), {
        onBusy: 'wait',
      })
    } catch (error) {
      // Test DB is migrated per-suite; tables may not exist at app boot yet.
      if (environment === 'test') return

      // See the note in `providers/modules_provider.ts`: a lost race wrote the
      // row we wanted, and crashing over it costs a supervisor restart loop.
      if ((error as { code?: string }).code === '23505') {
        console.warn('[cms] native reconcile lost a race; another process already wrote the row')
        return
      }

      throw error
    }
  }

  private async reconcileNatives() {
    const permissions = new CmsPermissionsService()

    for (const native of NATIVE_COLLECTIONS) {
      let row = await CmsCollection.query()
        .where('key', native.key)
        .preload('fields', (q) => q.whereNull('deleted_at'))
        .first()

      if (row?.deletedAt) {
        row.deletedAt = null
        await row.save()
      }

      if (!row) {
        row = await CmsCollection.create({
          id: newUlid(),
          key: native.key,
          label: native.label,
          icon: native.icon ?? null,
          group: native.group ?? null,
          source: 'PRISMA',
          modelName: native.modelName,
          tableName: nativeTableName(native.key) ?? null,
          listConfig: native.listConfig ?? {},
          revisionsOn: native.revisionsOn ?? true,
          draftsOn: native.draftsOn ?? true,
        })

        for (let i = 0; i < native.fields.length; i++) {
          const f = native.fields[i]!
          await CmsField.create({
            id: newUlid(),
            collectionId: row.id,
            key: f.key,
            label: f.label,
            type: f.type,
            required: f.required ?? false,
            unique: f.unique ?? false,
            order: i,
            config: f.config ?? {},
          })
        }
      } else {
        row.source = 'PRISMA'
        row.modelName = native.modelName
        row.tableName = nativeTableName(native.key) ?? null
        await row.save()

        const nativeFieldKeys = new Set(native.fields.map((f) => f.key))
        const existingByKey = new Map(row.fields.map((f) => [f.key, f]))

        for (const existing of row.fields) {
          if (!nativeFieldKeys.has(existing.key)) {
            existing.deletedAt = DateTime.now()
            await existing.save()
          }
        }

        for (let i = 0; i < native.fields.length; i++) {
          const f = native.fields[i]!
          const match = existingByKey.get(f.key)
          if (!match) {
            await CmsField.create({
              id: newUlid(),
              collectionId: row.id,
              key: f.key,
              label: f.label,
              type: f.type,
              required: f.required ?? false,
              unique: f.unique ?? false,
              order: i,
              config: f.config ?? {},
            })
          } else {
            let dirty = false
            if (match.deletedAt) {
              match.deletedAt = null
              dirty = true
            }
            if (match.type !== f.type) {
              match.type = f.type
              dirty = true
            }
            if (match.order !== i) {
              match.order = i
              dirty = true
            }
            if (match.label !== f.label) {
              match.label = f.label
              dirty = true
            }
            if (match.required !== (f.required ?? false)) {
              match.required = f.required ?? false
              dirty = true
            }
            if (match.unique !== (f.unique ?? false)) {
              match.unique = f.unique ?? false
              dirty = true
            }
            const nextConfig = f.config ?? {}
            if (JSON.stringify(match.config) !== JSON.stringify(nextConfig)) {
              match.config = nextConfig
              dirty = true
            }
            if (dirty) await match.save()
          }
        }

        if (native.draftsOn !== undefined && row.draftsOn !== native.draftsOn) {
          row.draftsOn = native.draftsOn
          await row.save()
        }
        if (native.revisionsOn !== undefined && row.revisionsOn !== native.revisionsOn) {
          row.revisionsOn = native.revisionsOn
          await row.save()
        }
      }

      await permissions.mintForCollection(native.key)
    }
  }
}
