import type { CmsFieldType } from '#services/cms_service'

export interface NativeFieldDescriptor {
  key: string
  label: string
  type: CmsFieldType
  required?: boolean
  unique?: boolean
  config?: Record<string, unknown>
}

export interface NativeCollectionDescriptor {
  key: string
  label: string
  icon?: string
  group?: string
  modelName: string
  fields: NativeFieldDescriptor[]
  listConfig?: {
    searchable?: string[]
    sortBy?: string
    columns?: string[]
  }
  revisionsOn?: boolean
  draftsOn?: boolean
}

/**
 * Native (PRISMA-backed) collections have been removed: Content, Media and Users
 * are managed exclusively through their dedicated admin pages (`/admin/content`,
 * `/admin/media`, `/admin/users`), not via the generic CMS UI. The CMS now only
 * hosts dynamic collections.
 */
export const NATIVE_COLLECTIONS: readonly NativeCollectionDescriptor[] = []

/** Physical PostgreSQL table for each native collection key */
export const NATIVE_TABLE_NAMES: Record<string, string> = {}

/** CMS field key → database column name (when they differ) */
export const NATIVE_FIELD_COLUMNS: Record<string, Record<string, string>> = {}

export function nativeTableName(key: string): string | undefined {
  return NATIVE_TABLE_NAMES[key]
}

export function nativeFieldColumn(collectionKey: string, fieldKey: string): string {
  return NATIVE_FIELD_COLUMNS[collectionKey]?.[fieldKey] ?? fieldKey
}

export function findNative(key: string): NativeCollectionDescriptor | undefined {
  return NATIVE_COLLECTIONS.find((c) => c.key === key)
}
