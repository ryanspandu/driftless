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
      // The attempt stamps lastTestedAt / lastTestOk either way, and writes a
      // delivery row — so the log is stale too.
      void qc.invalidateQueries({ queryKey: mailSettingsQueryKey })
      void qc.invalidateQueries({ queryKey: mailDeliveriesQueryKey })
    },
  })
}

// ── Notifications ──────────────────────────────────────────────────────────

/** Mirrors `MailEventDto`. `owner` is 'core' or a module name. */
export interface MailEventDto {
  key: string
  owner: string
  label: string
  description: string
  trigger: 'admin' | 'webhook' | 'cron' | 'visitor'
  category: 'transactional' | 'marketing'
  canDisable: boolean
  defaultEnabled: boolean
  enabled: boolean
  customised: boolean
  /** A designed EMAIL template, or null for the built-in layout. */
  templateId: string | null
  /** The shipped copy, shown as placeholders in the editor. */
  defaults: MailEventCopy
  /** Placeholders usable in the copy, without braces. */
  variables: string[]
  /** null per field where the operator has not overridden it. */
  overrides: {
    subject: string | null
    heading: string | null
    intro: string | null
    buttonLabel: string | null
    outro: string | null
  }
}

export interface MailEventCopy {
  subject: string
  heading: string
  intro: string
  buttonLabel: string
  outro: string
}

/** Every field optional; `null` restores that field's shipped default. */
export interface UpdateMailEventRequest {
  enabled?: boolean
  subject?: string | null
  heading?: string | null
  intro?: string | null
  buttonLabel?: string | null
  outro?: string | null
  templateId?: string | null
}

export interface MailDeliveryDto {
  id: string
  eventKey: string | null
  eventLabel: string | null
  toAddress: string
  subject: string | null
  status: 'queued' | 'sent' | 'failed'
  error: string | null
  createdAt: string
  completedAt: string | null
}

export const mailEventsQueryKey = ['settings', 'mail', 'events'] as const
export const mailDeliveriesQueryKey = ['settings', 'mail', 'deliveries'] as const

export function useMailEvents() {
  return useQuery({
    queryKey: mailEventsQueryKey,
    queryFn: () => apiFetch<MailEventDto[]>('/api/admin/settings/mail/events'),
  })
}

export function useUpdateMailEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, ...body }: UpdateMailEventRequest & { key: string }) =>
      apiFetch<MailEventDto[]>(`/api/admin/settings/mail/events/${encodeURIComponent(key)}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: (list) => {
      // The response is the whole list, so seed the cache rather than refetch.
      qc.setQueryData(mailEventsQueryKey, list)
    },
  })
}

export function useMailDeliveries(limit = 50) {
  return useQuery({
    queryKey: [...mailDeliveriesQueryKey, limit],
    queryFn: () =>
      apiFetch<MailDeliveryDto[]>(`/api/admin/settings/mail/deliveries?limit=${limit}`),
  })
}
