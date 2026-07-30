import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '~/lib/api-client'

/** Mirrors `MailSettingsDto` on the server. Never carries the password. */
export interface MailSettingsDto {
  enabled: boolean
  host: string | null
  port: number | null
  secure: boolean
  username: string | null
  passwordMasked: string | null
  hasPasswordInDb: boolean
  fromAddress: string | null
  fromName: string | null
  lastTestedAt: string | null
  lastTestOk: boolean | null
  lastTestError: string | null
  envFallbackConfigured: boolean
}

export interface UpdateMailSettingsRequest {
  enabled?: boolean
  host?: string | null
  port?: number | null
  secure?: boolean
  username?: string | null
  /** Only send when the operator typed a new one — omitting keeps the stored value. */
  password?: string | null
  fromAddress?: string | null
  fromName?: string | null
}

export const mailSettingsQueryKey = ['settings', 'mail'] as const

export function useMailSettings() {
  return useQuery({
    queryKey: mailSettingsQueryKey,
    queryFn: () => apiFetch<MailSettingsDto>('/api/admin/settings/mail'),
  })
}

export function useUpdateMailSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateMailSettingsRequest) =>
      apiFetch<MailSettingsDto>('/api/admin/settings/mail', {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: mailSettingsQueryKey })
    },
  })
}

export function useSendTestEmail() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (to: string) =>
      apiFetch<{ ok: boolean; sentTo?: string; message?: string }>(
        '/api/admin/settings/mail/test',
        { method: 'POST', body: JSON.stringify({ to }) }
      ),
    onSettled: () => {
      // The attempt stamps lastTestedAt / lastTestOk either way.
      void qc.invalidateQueries({ queryKey: mailSettingsQueryKey })
    },
  })
}
