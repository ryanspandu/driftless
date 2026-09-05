/**
 * Client types + hooks for the MCP admin page.
 *
 * Types are re-declared here (not imported from `app/`): module UI is a separate
 * TS project with no path into the server, following the repo's client-boundary
 * convention (see `modules/ecommerce/ui/admin/_api.ts`).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '~/lib/api-client'

export interface McpTokenDto {
  id: string
  name: string
  abilities: string[]
  lastUsedAt: string | null
  expiresAt: string | null
  createdAt: string
}

export type McpTokenCreatedDto = McpTokenDto & { token: string }

export interface CreateMcpTokenRequest {
  name: string
  abilities: string[]
  expiresIn: string | null
}

export interface McpAuditRow {
  id: string
  tokenId: string | null
  tokenName: string | null
  method: string
  path: string
  action: string
  status: number
  durationMs: number
  ip: string | null
  createdAt: string
}

export interface McpAuditPage {
  data: McpAuditRow[]
  meta: { total: number; page: number; pageSize: number }
}

/** The abilities this page offers, with human labels. Mirrors `MCP_ABILITIES`. */
export const MCP_ABILITY_OPTIONS: { id: string; label: string; hint: string }[] = [
  { id: 'builder:read', label: 'Read', hint: 'catalog, collections, pages, templates, media' },
  { id: 'builder:collections', label: 'Collections', hint: 'create/update collections + fields' },
  { id: 'builder:pages', label: 'Pages', hint: 'create/update/publish pages' },
  { id: 'builder:templates', label: 'Templates', hint: 'create/update templates' },
  { id: 'builder:settings', label: 'Settings', hint: 'appearance, breakpoints, global code' },
  { id: 'builder:media', label: 'Media', hint: 'upload media' },
  {
    id: 'builder:products',
    label: 'Products',
    hint: 'create/update products, variants, categories (needs ecommerce)',
  },
  { id: 'cms:read', label: 'Records (read)', hint: 'list/read collection records' },
  { id: 'cms:write', label: 'Records (write)', hint: 'create/update/delete records' },
  { id: '*', label: 'Full access', hint: 'every ability' },
]

const tokensKey = ['mcp', 'tokens'] as const
const auditKey = ['mcp', 'audit'] as const

export function useMcpTokens() {
  return useQuery({
    queryKey: tokensKey,
    queryFn: () => apiFetch<McpTokenDto[]>('/api/admin/mcp/tokens'),
  })
}

export function useCreateMcpToken() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateMcpTokenRequest) =>
      apiFetch<McpTokenCreatedDto>('/api/admin/mcp/tokens', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: tokensKey }),
  })
}

export function useRevokeMcpToken() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: true }>(`/api/admin/mcp/tokens/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: tokensKey }),
  })
}

export function useMcpAudit() {
  return useQuery({
    queryKey: auditKey,
    queryFn: () => apiFetch<McpAuditPage>('/api/admin/mcp/audit?pageSize=100'),
    refetchInterval: 15_000,
  })
}
