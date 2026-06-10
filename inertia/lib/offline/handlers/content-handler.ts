import type { ContentDto, CreateContentRequest, UpdateContentRequest } from '~/types/api'
import { ApiError, apiDelete, apiPost, apiPut } from '~/lib/api'
import type { EntitySyncHandler, OutboxJob } from '~/lib/offline'

type ContentCreatePayload = CreateContentRequest & { id: string }
type ContentUpdatePayload = UpdateContentRequest

export function createContentHandler(): EntitySyncHandler<
  ContentDto,
  ContentCreatePayload | ContentUpdatePayload
> {
  return {
    entity: 'content',
    async apply(job) {
      switch (job.op) {
        case 'create': {
          const { id: _localId, ...body } = job.payload as ContentCreatePayload
          void _localId
          const row = await apiPost<ContentDto>('/api/admin/content', body)
          return { row, updatedAt: row.updatedAt }
        }
        case 'update': {
          const row = await apiPut<ContentDto>(
            `/api/admin/content/${job.refId}`,
            job.payload as ContentUpdatePayload
          )
          return { row, updatedAt: row.updatedAt }
        }
        case 'delete': {
          await apiDelete<void>(`/api/admin/content/${job.refId}`)
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

export type { ContentCreatePayload, ContentUpdatePayload }
export type ContentOutboxJob = OutboxJob<ContentCreatePayload | ContentUpdatePayload>
