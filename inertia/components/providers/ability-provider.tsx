import { createContext, useContext, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { MeResponse } from '~/types/api'
import { apiGet } from '~/lib/api'
import { Permissions } from '~/lib/permissions'

interface AbilityContextValue {
  permissions: Permissions
  me: MeResponse | null
  isLoading: boolean
}

const AbilityContext = createContext<AbilityContextValue>({
  permissions: Permissions.from([]),
  me: null,
  isLoading: false,
})

export function AbilityProvider({ children }: { children: React.ReactNode }) {
  const query = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiGet<MeResponse>('/api/me'),
    staleTime: 5 * 60_000,
  })

  const value = useMemo<AbilityContextValue>(
    () => ({
      permissions: Permissions.from(query.data?.permissions ?? []),
      me: query.data ?? null,
      isLoading: query.isLoading,
    }),
    [query.data, query.isLoading]
  )

  return <AbilityContext.Provider value={value}>{children}</AbilityContext.Provider>
}

export function useAbility(): AbilityContextValue {
  return useContext(AbilityContext)
}

export function Can({
  permission,
  all,
  any,
  cms,
  fallback = null,
  children,
}: {
  permission?: string
  all?: string[]
  any?: string[]
  cms?: { verb: 'read' | 'create' | 'update' | 'delete'; key: string }
  fallback?: React.ReactNode
  children: React.ReactNode
}) {
  const { permissions } = useAbility()
  let allowed = true
  if (permission && !permissions.has(permission)) allowed = false
  if (all && !all.every((p) => permissions.has(p))) allowed = false
  if (any && !any.some((p) => permissions.has(p))) allowed = false
  if (cms && !permissions.canCms(cms.verb, cms.key)) allowed = false
  return <>{allowed ? children : fallback}</>
}
