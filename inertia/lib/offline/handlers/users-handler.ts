import type { CreateUserRequest, UpdateUserRequest, UserPublic } from '~/types/api'
import { ApiError, apiDelete, apiPost, apiPut } from '~/lib/api'
import type { EntitySyncHandler } from '~/lib/offline'

type UsersCreatePayload = CreateUserRequest & { id: string }
type UsersUpdatePayload = UpdateUserRequest

export function createUsersHandler(): EntitySyncHandler<
  UserPublic,
  UsersCreatePayload | UsersUpdatePayload
> {
  return {
    entity: 'users',
    async apply(job) {
      switch (job.op) {
        case 'create': {
          const { id: _id, ...body } = job.payload as UsersCreatePayload
          void _id
          const row = await apiPost<UserPublic>('/api/admin/users', body)
          return { row, updatedAt: row.updatedAt }
        }
        case 'update': {
          const row = await apiPut<UserPublic>(
            `/api/admin/users/${job.refId}`,
            job.payload as UsersUpdatePayload
          )
          return { row, updatedAt: row.updatedAt }
        }
        case 'delete': {
          await apiDelete<void>(`/api/admin/users/${job.refId}`)
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

export type { UsersCreatePayload, UsersUpdatePayload }
