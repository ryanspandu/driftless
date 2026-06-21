import type { MediaDto } from '~/types/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api, { ApiError } from '~/lib/api'

export interface PaginatedMedia {
  items: MediaDto[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

const qk = {
  list: (page: number) => ['media', 'list', page] as const,
}

export function useMediaList(page = 1, pageSize = 40) {
  return useQuery({
    queryKey: [...qk.list(page), pageSize] as const,
    queryFn: async () => {
      const res = await api.get<PaginatedMedia>('/api/admin/media', {
        params: { page, pageSize },
      })
      return res.data
    },
    staleTime: 30_000,
  })
}

export function useUploadMedia() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append('file', file)
      try {
        const res = await api.post<MediaDto>('/api/admin/media', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        return res.data
      } catch (err: unknown) {
        const ax = err as {
          response?: { status?: number; data?: { message?: string | string[] } }
        }
        const status = ax.response?.status ?? 500
        const raw = ax.response?.data?.message
        const msg = Array.isArray(raw) ? raw.join(', ') : raw
        throw new ApiError(status, msg ?? 'Upload failed', ax.response?.data)
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['media'] })
    },
  })
}

export function useDeleteMedia() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/admin/media/${id}`)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['media'] })
    },
  })
}

export function useTrashedMedia(enabled = true) {
  return useQuery({
    queryKey: ['media', 'trash'] as const,
    queryFn: async () => {
      const res = await api.get<MediaDto[]>('/api/admin/media/trash')
      return res.data
    },
    staleTime: 10_000,
    enabled,
  })
}

export function useRestoreMedia() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post<MediaDto>(`/api/admin/media/${id}/restore`)
      return res.data
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['media'] }),
  })
}

export function useForceDeleteMedia() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/admin/media/${id}/force`)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['media'] }),
  })
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export { formatBytes }
