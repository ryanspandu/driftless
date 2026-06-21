/**
 * Shared API contracts between Adonis API and Inertia admin.
 */

export type ContentStatus = 'DRAFT' | 'PUBLISHED'
export type UserStatus = 'ACTIVE' | 'INACTIVE'
export type RoleName = string

export const BUILTIN_ROLE_NAMES = ['SUPERADMIN', 'ADMIN', 'USER', 'GUEST'] as const
export type BuiltinRoleName = (typeof BUILTIN_ROLE_NAMES)[number]

export interface RoleDto {
  id: string
  name: string
  description: string | null
  isSystem: boolean
  permissions: string[]
  userCount?: number
  createdAt: string
  updatedAt: string
}

export interface CreateRoleRequest {
  name: string
  description?: string | null
  permissions?: string[]
}

export interface UpdateRoleRequest {
  name?: string
  description?: string | null
  permissions?: string[]
}

export interface PermissionDto {
  id: string
  name: string
  description: string | null
  isSystem: boolean
  roleCount?: number
  createdAt: string
  updatedAt: string
}

export interface CreatePermissionRequest {
  name: string
  description?: string | null
}

export interface UpdatePermissionRequest {
  name?: string
  description?: string | null
}

export interface UserPublic {
  id: string
  email: string
  username: string
  firstName: string
  lastName: string | null
  status: UserStatus
  roles: string[]
  createdAt: string
  updatedAt: string
}

export interface PaginatedList<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface ListUsersQuery {
  page?: number
  pageSize?: number
  search?: string
  role?: string | string[]
  status?: UserStatus
}

export interface CreateUserRequest {
  email: string
  username: string
  firstName: string
  lastName?: string | null
  password: string
  roles: string[]
  status?: UserStatus
}

export interface UpdateUserRequest {
  email?: string
  username?: string
  firstName?: string
  lastName?: string | null
  password?: string
  roles?: string[]
  status?: UserStatus
}

export interface GeneratePasswordResponse {
  password: string
}

export interface MeResponse {
  id: string
  email: string
  username: string
  firstName: string
  lastName: string | null
  fullName?: string | null
  roles: string[]
  permissions: string[]
}

export interface LoginRequest {
  email: string
  password: string
  captchaToken?: string
}

export interface RegisterRequest {
  email: string
  password: string
  username: string
  firstName: string
  lastName?: string
  captchaToken?: string
}

export type CaptchaProviderId = 'turnstile' | 'hcaptcha' | 'recaptcha'

export const CAPTCHA_PROVIDER_OPTIONS: { id: CaptchaProviderId; label: string }[] = [
  { id: 'turnstile', label: 'Cloudflare Turnstile' },
  { id: 'hcaptcha', label: 'hCaptcha' },
  { id: 'recaptcha', label: 'Google reCAPTCHA' },
]

export interface PublicWebAppearance {
  authBackgroundUrl: string
  authLogoUrl: string
  siteTitle: string
  siteDescription: string
  faviconUrl: string
}

export interface AuthPublicConfig {
  google: { enabled: boolean; configured: boolean }
  captcha: {
    enabled: boolean
    provider: CaptchaProviderId | null
    siteKey: string | null
    onLogin: boolean
    onRegister: boolean
  }
  analytics: {
    googleAnalytics: { enabled: boolean; measurementId: string | null }
    microsoftClarity: { enabled: boolean; projectId: string | null }
  }
  web: PublicWebAppearance
}

export interface IntegrationSettingsAdmin {
  googleAuthEnabled: boolean
  googleClientId: string | null
  googleClientSecretMasked: string | null
  hasGoogleClientSecretInDb: boolean
  googleRedirectUriHint: string
  envGoogleOAuthFallback: boolean
  captchaEnabled: boolean
  captchaProvider: CaptchaProviderId | null
  captchaSiteKey: string | null
  captchaSecretMasked: string | null
  hasCaptchaSecretInDb: boolean
  captchaOnLogin: boolean
  captchaOnRegister: boolean
  envCaptchaFallback: boolean
  ga4Enabled: boolean
  ga4MeasurementId: string | null
  envGa4Fallback: boolean
  clarityEnabled: boolean
  clarityProjectId: string | null
  envClarityFallback: boolean
  updatedAt: string
}

export interface UpdateIntegrationSettingsRequest {
  googleAuthEnabled?: boolean
  googleClientId?: string | null
  googleClientSecret?: string | null
  captchaEnabled?: boolean
  captchaProvider?: CaptchaProviderId | null
  captchaSiteKey?: string | null
  captchaSecret?: string | null
  captchaOnLogin?: boolean
  captchaOnRegister?: boolean
  ga4Enabled?: boolean
  ga4MeasurementId?: string | null
  clarityEnabled?: boolean
  clarityProjectId?: string | null
}

export const WEBSITE_SETTING_SECTIONS = {
  ADMIN_BRANDING: 'admin_branding',
  AUTH_PAGES: 'auth_pages',
  SITE_META: 'site_meta',
} as const

export interface WebsiteSettingsDto {
  sections: Record<string, Record<string, string>>
  updatedAt: string
}

export interface WebSettingPatch {
  section: string
  key: string
  value: string
}

export interface UpdateWebsiteSettingsRequest {
  patches: WebSettingPatch[]
}

export interface ContentDto {
  id: string
  title: string
  slug: string
  body: string
  status: ContentStatus
  // Mirrors the server DTO (`app/services/content_service.ts`); null until an
  // author is assigned (e.g. records created offline before sync).
  authorId: number | null
  createdAt: string
  updatedAt: string
}

export interface PublicContentDto {
  id: string
  title: string
  slug: string
  body: string
  createdAt: string
  updatedAt: string
}

export interface CreateContentRequest {
  title: string
  slug: string
  body: string
  status: ContentStatus
}

export interface UpdateContentRequest {
  title?: string
  slug?: string
  body?: string
  status?: ContentStatus
}

export type PageRenderMode = 'SSR' | 'SSG' | 'CSR'

/** List row — omits the (potentially large) Puck block tree. */
export interface PageSummaryDto {
  id: string
  title: string
  path: string
  status: ContentStatus
  renderMode: PageRenderMode
  layoutId: string | null
  headerTemplateId: string | null
  footerTemplateId: string | null
  authorId: number | null
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface PageDto extends PageSummaryDto {
  content: Record<string, unknown>
  seo: Record<string, unknown>
}

export interface CreatePageRequest {
  title: string
  path: string
  status?: ContentStatus
  renderMode?: PageRenderMode
  layoutId?: string | null
  headerTemplateId?: string | null
  footerTemplateId?: string | null
  content?: Record<string, unknown>
  seo?: Record<string, unknown>
}

export interface UpdatePageRequest {
  title?: string
  path?: string
  status?: ContentStatus
  renderMode?: PageRenderMode
  layoutId?: string | null
  headerTemplateId?: string | null
  footerTemplateId?: string | null
  content?: Record<string, unknown>
  seo?: Record<string, unknown>
}

export type TemplateType = 'HEADER' | 'FOOTER' | 'COMPONENT' | 'LAYOUT'

export interface TemplateSummaryDto {
  id: string
  name: string
  type: TemplateType
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

export interface TemplateDto extends TemplateSummaryDto {
  content: Record<string, unknown>
}

export interface CreateTemplateRequest {
  name: string
  type: TemplateType
  content?: Record<string, unknown>
  isDefault?: boolean
}

export interface UpdateTemplateRequest {
  name?: string
  content?: Record<string, unknown>
  isDefault?: boolean
}

export interface PluginMenuItem {
  title: string
  href: string
  /** lucide-react icon name, resolved on the client. */
  icon: string
}

export interface PluginDto {
  name: string
  label: string
  description: string
  version: string
  enabled: boolean
  adminMenu: PluginMenuItem | null
}

export type CmsCollectionSource = 'PRISMA' | 'DYNAMIC'
export type CmsFieldType =
  | 'TEXT'
  | 'TEXTAREA'
  | 'NUMBER'
  | 'BOOL'
  | 'DATE'
  | 'DATETIME'
  | 'SELECT'
  | 'RICHTEXT'
  | 'MEDIA'
  | 'SLUG'
  | 'JSON'
  | 'REPEATABLE'

export interface CmsFieldDto {
  id: string
  key: string
  label: string
  type: CmsFieldType
  required: boolean
  unique: boolean
  order: number
  config: Record<string, unknown>
}

export interface CmsCollectionDto {
  id: string
  key: string
  label: string
  icon: string | null
  group: string | null
  source: CmsCollectionSource
  modelName: string | null
  tableName: string | null
  listConfig: Record<string, unknown>
  revisionsOn: boolean
  draftsOn: boolean
  fields: CmsFieldDto[]
  createdAt: string
  updatedAt: string
}

export interface CreateCmsCollectionFieldRequest {
  key: string
  label: string
  type: CmsFieldType
  required?: boolean
  unique?: boolean
  config?: Record<string, unknown>
}

export interface CreateCmsCollectionRequest {
  key: string
  label: string
  icon?: string
  group?: string
  revisionsOn?: boolean
  draftsOn?: boolean
  fields: CreateCmsCollectionFieldRequest[]
}

export interface UpdateCmsCollectionRequest {
  label?: string
  icon?: string | null
  group?: string | null
  revisionsOn?: boolean
  draftsOn?: boolean
}

export interface AddCmsFieldRequest {
  key: string
  label: string
  type: CmsFieldType
  required?: boolean
  unique?: boolean
  config?: Record<string, unknown>
}

export interface UpdateCmsFieldRequest {
  label?: string
  required?: boolean
  config?: Record<string, unknown>
}

export interface ReorderCmsFieldsRequest {
  fieldKeys: string[]
}

export interface CmsRecordDto {
  id: string
  status: ContentStatus
  authorId: string | null
  data: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface CreateCmsRecordRequest {
  id?: string
  status?: ContentStatus
  data: Record<string, unknown>
}

export interface UpdateCmsRecordRequest {
  status?: ContentStatus
  data?: Record<string, unknown>
}

export interface ListCmsRecordsQuery {
  page?: number
  pageSize?: number
  search?: string
  status?: ContentStatus
  sort?: string
}

export interface CmsRevisionDto {
  id: string
  collectionKey: string
  recordId: string
  data: Record<string, unknown>
  status: ContentStatus
  authorId: string | null
  createdAt: string
}

export interface MediaDto {
  id: string
  filename: string
  mimeType: string
  size: number
  url: string
  createdAt: string
  updatedAt: string
}
