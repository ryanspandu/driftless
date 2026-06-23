import type { ApiTokenCreatedDto, ApiTokenDto, CreateApiTokenRequest } from '~/types/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '~/lib/api-client'

export const apiTokensQueryKey = ['api-tokens'] as const

/** List the current user's Personal Access Tokens (never includes the plaintext). */
export function useApiTokens() {
  return useQuery({
    queryKey: apiTokensQueryKey,
    queryFn: () => apiFetch<ApiTokenDto[]>('/api/admin/api-tokens'),
  })
}

/**
 * Create a PAT. The response includes the one-time plaintext `token`, which the
 * server never returns again — surface it to the user immediately.
 */
export function useCreateApiToken() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateApiTokenRequest) =>
      apiFetch<ApiTokenCreatedDto>('/api/admin/api-tokens', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: apiTokensQueryKey })
    },
  })
}

/** Revoke (delete) a PAT by id. */
export function useRevokeApiToken() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: true }>(`/api/admin/api-tokens/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: apiTokensQueryKey })
    },
  })
}
