import type {
  CmsRecordDto,
  CreateCmsRecordRequest,
  UpdateCmsRecordRequest,
} from '~/types/api'
import { ApiError } from '~/lib/api'
import { cmsRecords } from '~/lib/cms/client'
import type { EntitySyncHandler, OutboxJob } from '~/lib/offline'

export type CmsCreatePayload = CreateCmsRecordRequest & {
  collectionKey: string
  clientId: string
}
export type CmsUpdatePayload = UpdateCmsRecordRequest & { collectionKey: string }
export type CmsDeletePayload = { collectionKey: string }
export type CmsOutboxJob = OutboxJob<CmsCreatePayload | CmsUpdatePayload | CmsDeletePayload>

export function createCmsRecordHandler(): EntitySyncHandler<
  CmsRecordDto,
  CmsCreatePayload | CmsUpdatePayload | CmsDeletePayload
> {
  return {
    entity: 'cms:*',
    async apply(job) {
      const payload = job.payload as { collectionKey: string; [k: string]: unknown }
      const { collectionKey } = payload
      switch (job.op) {
        case 'create': {
          const { clientId: _clientId, collectionKey: _key, ...body } = job.payload as CmsCreatePayload
          void _clientId
          void _key
          const row = await cmsRecords.create(collectionKey, body)
          return { row, updatedAt: row.updatedAt }
        }
        case 'update': {
          const { collectionKey: _key, ...body } = job.payload as CmsUpdatePayload
          void _key
          const row = await cmsRecords.update(collectionKey, job.refId, body)
          return { row, updatedAt: row.updatedAt }
        }
        case 'delete': {
          await cmsRecords.remove(collectionKey, job.refId)
          return null
        }
      }
    },
    classify(error: unknown) {
      if (error instanceof ApiError) {
        if (error.status === 409) return 'conflict'
        if (error.status >= 500) return 'network'
        if (error.status === 401 || error.status === 403) return 'fatal'
        if (error.status >= 400) return 'fatal'
      }
      const msg = String((error as Error)?.message ?? error).toLowerCase()
      if (msg.includes('failed to fetch') || msg.includes('network')) return 'network'
      return 'fatal'
    },
  }
}
