import type {
  CreateCmsComponentRequest,
  UpdateCmsComponentRequest,
} from '~/types/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cmsComponents } from '~/lib/cms/client'

const qk = {
  list: ['cms-components', 'list'] as const,
}

export function useCmsComponentsList() {
  return useQuery({
    queryKey: qk.list,
    queryFn: () => cmsComponents.list(),
    staleTime: 60_000,
  })
}

export function useCreateCmsComponent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateCmsComponentRequest) => cmsComponents.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.list }),
  })
}

export function useUpdateCmsComponent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ key, body }: { key: string; body: UpdateCmsComponentRequest }) =>
      cmsComponents.update(key, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.list }),
  })
}

export function useDeleteCmsComponent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (key: string) => cmsComponents.remove(key),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.list }),
  })
}
