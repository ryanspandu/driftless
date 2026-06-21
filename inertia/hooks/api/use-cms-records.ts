import type {
  CmsRecordDto,
  CmsRevisionDto,
  CreateCmsRecordRequest,
  ListCmsRecordsQuery,
  PaginatedList,
  UpdateCmsRecordRequest,
} from '~/types/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cmsRecordListPath, cmsRecords } from '~/lib/cms/client'

const qk = {
  list: (key: string, path: string) => ['cms-records', key, path] as const,
  one: (key: string, id: string) => ['cms-records', key, 'one', id] as const,
  revisions: (key: string, id: string) => ['cms-records', key, 'revisions', id] as const,
}

export function useCmsRecordsList(key: string, query: ListCmsRecordsQuery = {}) {
  const path = cmsRecordListPath(key, query)
  return useQuery<PaginatedList<CmsRecordDto>>({
    queryKey: qk.list(key, path),
    enabled: !!key,
    queryFn: () => cmsRecords.list(key, query),
    staleTime: 30_000,
  })
}

export function useCmsRecord(key: string, id: string) {
  return useQuery<CmsRecordDto>({
    queryKey: qk.one(key, id),
    enabled: !!key && !!id,
    queryFn: () => cmsRecords.get(key, id),
  })
}

export function useCreateCmsRecord(key: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateCmsRecordRequest) => cmsRecords.create(key, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cms-records', key] }),
  })
}

export function useUpdateCmsRecord(key: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateCmsRecordRequest }) =>
      cmsRecords.update(key, id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cms-records', key] }),
  })
}

export function useDeleteCmsRecord(key: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => cmsRecords.remove(key, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cms-records', key] }),
  })
}

export function useTrashedCmsRecords(key: string, enabled = true) {
  return useQuery<CmsRecordDto[]>({
    queryKey: ['cms-records', key, 'trash'] as const,
    enabled: !!key && enabled,
    queryFn: () => cmsRecords.trash(key),
    staleTime: 10_000,
  })
}

export function useRestoreCmsRecord(key: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => cmsRecords.restore(key, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cms-records', key] }),
  })
}

export function useForceDeleteCmsRecord(key: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => cmsRecords.forceRemove(key, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cms-records', key] }),
  })
}

export function useCmsRevisions(key: string, id: string) {
  return useQuery<CmsRevisionDto[]>({
    queryKey: qk.revisions(key, id),
    enabled: !!key && !!id,
    queryFn: () => cmsRecords.listRevisions(key, id),
  })
}

export function useRestoreCmsRevision(key: string, id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (revisionId: string) => cmsRecords.restoreRevision(key, id, revisionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.one(key, id) })
      qc.invalidateQueries({ queryKey: qk.revisions(key, id) })
      qc.invalidateQueries({ queryKey: ['cms-records', key] })
    },
  })
}

export { useRestoreCmsRevision as useRestoreRevision }
