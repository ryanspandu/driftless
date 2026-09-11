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

export type MediaListParams = {
  page?: number
  pageSize?: number
  search?: string
  dateFrom?: string
  dateTo?: string
}

const qk = {
  list: (params: Required<MediaListParams>) => ['media', 'list', params] as const,
}

export function useMediaList(params: MediaListParams = {}) {
  const { page = 1, pageSize = 40, search = '', dateFrom = '', dateTo = '' } = params
  return useQuery({
    queryKey: qk.list({ page, pageSize, search, dateFrom, dateTo }),
    queryFn: async () => {
      const res = await api.get<PaginatedMedia>('/api/admin/media', {
        params: {
          page,
          pageSize,
          ...(search ? { search } : {}),
          ...(dateFrom ? { dateFrom } : {}),
          ...(dateTo ? { dateTo } : {}),
        },
      })
      return res.data
    },
    staleTime: 30_000,
  })
}

export function useUpdateMediaMeta() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      title?: string | null
      description?: string | null
      alt?: string | null
    }) => {
      const { id, ...patch } = input
      const res = await api.patch<MediaDto>(`/api/admin/media/${id}`, patch)
      return res.data
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['media'] }),
  })
}

export function useReplaceMediaFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      blob: Blob
      filename: string
      width?: number
      height?: number
    }) => {
      const form = new FormData()
      form.append('file', input.blob, input.filename)
      if (input.width !== undefined) form.append('width', String(Math.round(input.width)))
      if (input.height !== undefined) form.append('height', String(Math.round(input.height)))
      try {
        const res = await api.post<MediaDto>(`/api/admin/media/${input.id}/file`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        return res.data
      } catch (err: unknown) {
        const ax = err as { response?: { status?: number; data?: { message?: string | string[] } } }
        const status = ax.response?.status ?? 500
        const raw = ax.response?.data?.message
        const msg = Array.isArray(raw) ? raw.join(', ') : raw
        throw new ApiError(status, msg ?? 'Replace failed', ax.response?.data)
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['media'] }),
  })
}

/**
 * Read an image's intrinsic pixel size before it is sent.
 *
 * The server has no decoder, so the dimensions have to come from here — the
 * browser is about to decode the file anyway to preview it. Anything it refuses
 * to decode (an SVG with no intrinsic size, a corrupt file) simply uploads
 * without dimensions rather than failing the upload over metadata.
 */
async function readImageSize(file: File): Promise<{ width: number; height: number } | null> {
  if (!file.type.startsWith('image/')) return null
  try {
    const bitmap = await createImageBitmap(file)
    const size = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return size
  } catch {
    return null
  }
}

export function useUploadMedia() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append('file', file)
      const size = await readImageSize(file)
      if (size) {
        form.append('width', String(size.width))
        form.append('height', String(size.height))
      }
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

/**
 * Append a cache-busting `?v=` derived from `updatedAt` so an image edited in
 * place (same URL) is re-fetched by the browser instead of served stale.
 */
export function mediaSrc(url: string, updatedAt?: string | null): string {
  if (!updatedAt) return url
  const v = Date.parse(updatedAt)
  if (Number.isNaN(v)) return url
  return `${url}${url.includes('?') ? '&' : '?'}v=${v}`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export { formatBytes }
