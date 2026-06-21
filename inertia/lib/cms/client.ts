import type {
  AddCmsFieldRequest,
  CmsCollectionDto,
  CmsFieldDto,
  CmsRecordDto,
  CmsRevisionDto,
  CreateCmsCollectionRequest,
  CreateCmsRecordRequest,
  ListCmsRecordsQuery,
  PaginatedList,
  ReorderCmsFieldsRequest,
  UpdateCmsCollectionRequest,
  UpdateCmsFieldRequest,
  UpdateCmsRecordRequest,
} from '~/types/api'
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '~/lib/api'

function enc(key: string) {
  return encodeURIComponent(key)
}

export function buildRecordQuery(query: ListCmsRecordsQuery | undefined): string {
  if (!query) return ''
  const sp = new URLSearchParams()
  if (query.page) sp.set('page', String(query.page))
  if (query.pageSize) sp.set('pageSize', String(query.pageSize))
  if (query.search) sp.set('search', query.search)
  if (query.status) sp.set('status', query.status)
  if (query.sort) sp.set('sort', query.sort)
  const s = sp.toString()
  return s ? `?${s}` : ''
}

export const cmsCollections = {
  list: () => apiGet<CmsCollectionDto[]>('/api/admin/cms/collections'),
  get: (key: string) => apiGet<CmsCollectionDto>(`/api/admin/cms/collections/${enc(key)}`),
  create: (body: CreateCmsCollectionRequest) =>
    apiPost<CmsCollectionDto>('/api/admin/cms/collections', body),
  update: (key: string, body: UpdateCmsCollectionRequest) =>
    apiPut<CmsCollectionDto>(`/api/admin/cms/collections/${enc(key)}`, body),
  remove: (key: string) => apiDelete<void>(`/api/admin/cms/collections/${enc(key)}`),
  trash: () => apiGet<CmsCollectionDto[]>('/api/admin/cms/collections/trash'),
  restore: (key: string) =>
    apiPost<CmsCollectionDto>(`/api/admin/cms/collections/${enc(key)}/restore`),
  forceRemove: (key: string) =>
    apiDelete<void>(`/api/admin/cms/collections/${enc(key)}/force`),
  addField: (key: string, body: AddCmsFieldRequest) =>
    apiPost<CmsFieldDto>(`/api/admin/cms/collections/${enc(key)}/fields`, body),
  updateField: (key: string, fieldKey: string, body: UpdateCmsFieldRequest) =>
    apiPut<CmsFieldDto>(`/api/admin/cms/collections/${enc(key)}/fields/${enc(fieldKey)}`, body),
  reorderFields: (key: string, body: ReorderCmsFieldsRequest) =>
    apiPatch<CmsCollectionDto>(`/api/admin/cms/collections/${enc(key)}/fields/reorder`, body),
  removeField: (key: string, fieldKey: string) =>
    apiDelete<void>(`/api/admin/cms/collections/${enc(key)}/fields/${enc(fieldKey)}`),
}

export function cmsRecordListPath(key: string, query?: ListCmsRecordsQuery): string {
  return `/api/admin/cms/${enc(key)}/records${buildRecordQuery(query)}`
}

export const cmsRecords = {
  list: (key: string, query?: ListCmsRecordsQuery) =>
    apiGet<PaginatedList<CmsRecordDto>>(cmsRecordListPath(key, query)),
  get: (key: string, id: string) =>
    apiGet<CmsRecordDto>(`/api/admin/cms/${enc(key)}/records/${enc(id)}`),
  create: (key: string, body: CreateCmsRecordRequest) =>
    apiPost<CmsRecordDto>(`/api/admin/cms/${enc(key)}/records`, body),
  update: (key: string, id: string, body: UpdateCmsRecordRequest) =>
    apiPut<CmsRecordDto>(`/api/admin/cms/${enc(key)}/records/${enc(id)}`, body),
  remove: (key: string, id: string) =>
    apiDelete<void>(`/api/admin/cms/${enc(key)}/records/${enc(id)}`),
  trash: (key: string) =>
    apiGet<CmsRecordDto[]>(`/api/admin/cms/${enc(key)}/records/trash`),
  restore: (key: string, id: string) =>
    apiPost<CmsRecordDto>(`/api/admin/cms/${enc(key)}/records/${enc(id)}/restore`),
  forceRemove: (key: string, id: string) =>
    apiDelete<void>(`/api/admin/cms/${enc(key)}/records/${enc(id)}/force`),
  listRevisions: (key: string, id: string) =>
    apiGet<CmsRevisionDto[]>(`/api/admin/cms/${enc(key)}/records/${enc(id)}/revisions`),
  restoreRevision: (key: string, id: string, revisionId: string) =>
    apiPost<CmsRecordDto>(
      `/api/admin/cms/${enc(key)}/records/${enc(id)}/revisions/${enc(revisionId)}/restore`
    ),
}
