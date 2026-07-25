import type {
  AddCmsFieldRequest,
  CmsCollectionDto,
  CmsFieldDto,
  CreateCmsCollectionRequest,
  ReorderCmsFieldsRequest,
  UpdateCmsCollectionRequest,
  UpdateCmsFieldRequest,
} from '~/types/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cmsCollections } from '~/lib/cms/client'

const qk = {
  list: ['cms-collections', 'list'] as const,
  trash: ['cms-collections', 'trash'] as const,
  one: (key: string) => ['cms-collections', key] as const,
}

export function useCmsCollectionsList() {
  return useQuery({
    queryKey: qk.list,
    queryFn: () => cmsCollections.list(),
    staleTime: 60_000,
  })
}

export function useCmsCollection(key: string) {
  return useQuery({
    queryKey: qk.one(key),
    enabled: !!key,
    queryFn: () => cmsCollections.get(key),
  })
}

export function useCreateCmsCollection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateCmsCollectionRequest) => cmsCollections.create(body),
    onSuccess: (created: CmsCollectionDto) => {
      qc.invalidateQueries({ queryKey: qk.list })
      qc.setQueryData(qk.one(created.key), created)
    },
  })
}

export function useUpdateCmsCollection(key: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateCmsCollectionRequest) => cmsCollections.update(key, body),
    onSuccess: (updated) => {
      qc.setQueryData(qk.one(key), updated)
      qc.invalidateQueries({ queryKey: qk.list })
    },
  })
}

export function useDeleteCmsCollection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (collectionKey: string) => cmsCollections.remove(collectionKey),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.list })
      qc.invalidateQueries({ queryKey: qk.trash })
    },
  })
}

export function useTrashedCmsCollections(enabled = true) {
  return useQuery({
    queryKey: qk.trash,
    queryFn: () => cmsCollections.trash(),
    staleTime: 10_000,
    enabled,
  })
}

export function useRestoreCmsCollection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (collectionKey: string) => cmsCollections.restore(collectionKey),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.list })
      qc.invalidateQueries({ queryKey: qk.trash })
    },
  })
}

export function useForceDeleteCmsCollection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (collectionKey: string) => cmsCollections.forceRemove(collectionKey),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.trash }),
  })
}

export function useAddCmsField(key: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: AddCmsFieldRequest): Promise<CmsFieldDto> =>
      cmsCollections.addField(key, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.one(key) })
      qc.invalidateQueries({ queryKey: qk.list })
    },
  })
}

export function useUpdateCmsField(key: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      fieldKey,
      body,
    }: {
      fieldKey: string
      body: UpdateCmsFieldRequest
    }): Promise<CmsFieldDto> => cmsCollections.updateField(key, fieldKey, body),
    // Optimistically patch the cached collection so label/width edits apply
    // instantly without waiting for the refetch.
    onMutate: async ({ fieldKey, body }) => {
      await qc.cancelQueries({ queryKey: qk.one(key) })
      const previous = qc.getQueryData<CmsCollectionDto>(qk.one(key))
      if (previous) {
        qc.setQueryData<CmsCollectionDto>(qk.one(key), {
          ...previous,
          fields: previous.fields.map((f) =>
            f.key === fieldKey
              ? {
                  ...f,
                  label: body.label ?? f.label,
                  config: body.config ?? f.config,
                }
              : f
          ),
        })
      }
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(qk.one(key), context.previous)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.one(key) }),
  })
}

export function useReorderCmsFields(key: string) {
  const qc = useQueryClient()
  return useMutation({
    // The API returns the reordered field list (CmsFieldDto[]), NOT the whole
    // collection — merge it into the cached collection rather than replacing it.
    mutationFn: (body: ReorderCmsFieldsRequest): Promise<CmsFieldDto[]> =>
      cmsCollections.reorderFields(key, body),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: qk.one(key) })
      const previous = qc.getQueryData<CmsCollectionDto>(qk.one(key))
      if (previous) {
        // Optimistically reorder so the UI updates instantly and never blanks.
        const byKey = new Map(previous.fields.map((f) => [f.key, f]))
        const reordered = body.fieldKeys
          .map((k) => byKey.get(k))
          .filter((f): f is CmsFieldDto => !!f)
        // Keep any fields the request didn't mention, in their original order.
        const mentioned = new Set(body.fieldKeys)
        const rest = previous.fields.filter((f) => !mentioned.has(f.key))
        qc.setQueryData<CmsCollectionDto>(qk.one(key), {
          ...previous,
          fields: [...reordered, ...rest],
        })
      }
      return { previous }
    },
    onError: (_err, _body, context) => {
      if (context?.previous) qc.setQueryData(qk.one(key), context.previous)
    },
    onSuccess: (fields) => {
      // Reconcile with the server's authoritative field order/shape.
      qc.setQueryData<CmsCollectionDto>(qk.one(key), (prev) =>
        prev ? { ...prev, fields } : prev
      )
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.list })
    },
  })
}

export function useRemoveCmsField(key: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (fieldKey: string) => cmsCollections.removeField(key, fieldKey),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.one(key) }),
  })
}
