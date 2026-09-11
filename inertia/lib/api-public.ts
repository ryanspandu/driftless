import type { PublicContentDto } from '~/types/api'
import { apiGet } from '~/lib/api'

export async function fetchPublishedList(): Promise<PublicContentDto[]> {
  try {
    return await apiGet<PublicContentDto[]>('/api/public/content')
  } catch {
    return []
  }
}

export async function fetchPublishedBySlug(slug: string): Promise<PublicContentDto | null> {
  try {
    return await apiGet<PublicContentDto>(`/api/public/content/${encodeURIComponent(slug)}`)
  } catch {
    return null
  }
}
