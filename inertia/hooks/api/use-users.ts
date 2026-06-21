import type {
  CreateUserRequest,
  GeneratePasswordResponse,
  ListUsersQuery,
  PaginatedList,
  UpdateUserRequest,
  UserPublic,
} from '~/types/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '~/lib/api-client'

type UserListQuery = Omit<ListUsersQuery, 'role'> & { role?: ListUsersQuery['role'] }

export const userQueryKeys = {
  all: ['users'] as const,
  list: (q: UserListQuery) => ['users', 'list', normalizeQuery(q)] as const,
  detail: (id: string) => ['users', 'detail', id] as const,
  trash: ['users', 'trash'] as const,
}

function normalizeQuery(q: UserListQuery): UserListQuery {
  const out: UserListQuery = { ...q }
  if (Array.isArray(out.role)) {
    out.role = [...out.role].sort() as ListUsersQuery['role']
  }
  return out
}

function buildUserListPath(q: UserListQuery): string {
  const params = new URLSearchParams()
  if (q.page != null) params.set('page', String(q.page))
  if (q.pageSize != null) params.set('pageSize', String(q.pageSize))
  if (q.search?.trim()) params.set('search', q.search.trim())
  if (q.status) params.set('status', q.status)
  const roles = Array.isArray(q.role) ? q.role : q.role ? [q.role] : []
  for (const r of roles) params.append('role', r)
  const qs = params.toString()
  return qs ? `/api/admin/users?${qs}` : '/api/admin/users'
}

export function useUsersList(query: UserListQuery) {
  const normalized = normalizeQuery(query)
  const path = buildUserListPath(normalized)
  return useQuery({
    queryKey: ['users', 'list', path] as const,
    queryFn: () => apiFetch<PaginatedList<UserPublic>>(path),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  })
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateUserRequest) =>
      apiFetch<UserPublic>('/api/admin/users', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: userQueryKeys.all }),
  })
}

export function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateUserRequest }) =>
      apiFetch<UserPublic>(`/api/admin/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: (_row, { id }) => {
      void qc.invalidateQueries({ queryKey: userQueryKeys.all })
      void qc.invalidateQueries({ queryKey: userQueryKeys.detail(id) })
    },
  })
}

export function useDeleteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/admin/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: userQueryKeys.all }),
  })
}

/** Soft-deleted users (the Trash). */
export function useTrashedUsers(enabled = true) {
  return useQuery({
    queryKey: userQueryKeys.trash,
    queryFn: () => apiFetch<UserPublic[]>('/api/admin/users/trash'),
    staleTime: 10_000,
    enabled,
  })
}

export function useRestoreUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<UserPublic>(`/api/admin/users/${id}/restore`, { method: 'POST' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: userQueryKeys.trash })
      void qc.invalidateQueries({ queryKey: userQueryKeys.all })
    },
  })
}

export function useForceDeleteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<void>(`/api/admin/users/${id}/force`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: userQueryKeys.trash }),
  })
}

export function useGeneratePassword() {
  return useMutation({
    mutationFn: () =>
      apiFetch<GeneratePasswordResponse>('/api/admin/users/generate-password', {
        method: 'POST',
      }),
  })
}
