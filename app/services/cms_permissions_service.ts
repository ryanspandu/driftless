import Permission from '#models/permission'
import { newUlid } from '#services/ulid_service'

export const CMS_RECORD_VERBS = ['read', 'create', 'update', 'delete'] as const

export default class CmsPermissionsService {
  async mintForCollection(key: string): Promise<void> {
    for (const verb of CMS_RECORD_VERBS) {
      const name = `cms:${key}:${verb}`
      const description = `CMS ${verb} on "${key}" collection records.`
      const existing = await Permission.query().where('name', name).first()
      if (existing) {
        existing.description = description
        existing.isSystem = true
        await existing.save()
      } else {
        await Permission.create({
          id: newUlid(),
          name,
          description,
          isSystem: true,
        })
      }
    }
  }

  async removeForCollection(key: string): Promise<void> {
    await Permission.query().where('name', 'like', `cms:${key}:%`).delete()
  }
}
