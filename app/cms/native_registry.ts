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

export const NATIVE_COLLECTIONS: readonly NativeCollectionDescriptor[] = [
  {
    key: 'content',
    label: 'Content',
    icon: 'FileText',
    group: 'General',
    modelName: 'Content',
    fields: [
      { key: 'title', label: 'Title', type: 'TEXT', required: true },
      {
        key: 'slug',
        label: 'Slug',
        type: 'SLUG',
        required: true,
        unique: true,
        config: { source: 'title' },
      },
      { key: 'body', label: 'Body', type: 'RICHTEXT', required: true },
    ],
    draftsOn: true,
    revisionsOn: true,
    listConfig: {
      searchable: ['title', 'slug'],
      sortBy: 'updatedAt',
      columns: ['title', 'slug', 'status', 'updatedAt'],
    },
  },
  {
    key: 'user',
    label: 'Users',
    icon: 'Users',
    group: 'Management',
    modelName: 'User',
    fields: [
      { key: 'email', label: 'Email', type: 'TEXT', required: true, unique: true },
      { key: 'username', label: 'Username', type: 'TEXT', required: true, unique: true },
      { key: 'firstName', label: 'First name', type: 'TEXT', required: true },
      { key: 'lastName', label: 'Last name', type: 'TEXT' },
      {
        key: 'status',
        label: 'Status',
        type: 'SELECT',
        required: true,
        config: { options: ['ACTIVE', 'INACTIVE'] },
      },
    ],
    listConfig: {
      searchable: ['email', 'username', 'firstName', 'lastName'],
      sortBy: 'createdAt',
      columns: ['email', 'username', 'firstName', 'status', 'createdAt'],
    },
    revisionsOn: false,
    draftsOn: false,
  },
  {
    key: 'media',
    label: 'Media',
    icon: 'Image',
    group: 'General',
    modelName: 'Media',
    fields: [
      { key: 'filename', label: 'Filename', type: 'TEXT', required: true },
      { key: 'mimeType', label: 'MIME type', type: 'TEXT', required: true },
      { key: 'size', label: 'Size (bytes)', type: 'NUMBER', required: true },
      { key: 'url', label: 'URL', type: 'TEXT', required: true },
    ],
    listConfig: {
      searchable: ['filename', 'mimeType'],
      sortBy: 'createdAt',
      columns: ['filename', 'mimeType', 'size', 'createdAt'],
    },
    revisionsOn: false,
    draftsOn: false,
  },
]

/** Physical PostgreSQL table for each native collection key */
export const NATIVE_TABLE_NAMES: Record<string, string> = {
  content: 'contents',
  user: 'users',
  media: 'media',
}

/** CMS field key → database column name (when they differ) */
export const NATIVE_FIELD_COLUMNS: Record<string, Record<string, string>> = {
  user: {
    firstName: 'first_name',
    lastName: 'last_name',
  },
  media: {
    mimeType: 'mime_type',
  },
}

export function nativeTableName(key: string): string | undefined {
  return NATIVE_TABLE_NAMES[key]
}

export function nativeFieldColumn(collectionKey: string, fieldKey: string): string {
  return NATIVE_FIELD_COLUMNS[collectionKey]?.[fieldKey] ?? fieldKey
}

export function findNative(key: string): NativeCollectionDescriptor | undefined {
  return NATIVE_COLLECTIONS.find((c) => c.key === key)
}
