/**
 * Shared API contracts between Adonis API and Inertia admin.
 */

export type ContentStatus = 'DRAFT' | 'PUBLISHED'
/** Who may read a post: anyone, password-gated, or any logged-in member. */
export type ContentVisibility = 'PUBLIC' | 'PROTECTED' | 'MEMBER'
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
  /** Site-wide custom <meta> tags, applied on every public page. */
  metaTags: { name?: string; property?: string; content?: string }[]
}

/**
 * Public (no-secret) CAPTCHA config a browser needs to render a widget and know
 * which flows require one. Shared by the admin auth pages and the storefront
 * (`GET /api/shop/config`). Mirror of the server's `PublicCaptchaConfig`.
 */
export interface PublicCaptchaConfig {
  enabled: boolean
  provider: CaptchaProviderId | null
  siteKey: string | null
  onLogin: boolean
  onRegister: boolean
  /** True only when checkout CAPTCHA is on AND the provider is invisible (Turnstile). */
  onCheckout: boolean
}

export interface AuthPublicConfig {
  /** Whether public self-service signup is open. When false, `/register` 404s,
   *  so the login page must not offer a link to it. */
  registrationEnabled: boolean
  google: { enabled: boolean; configured: boolean }
  captcha: PublicCaptchaConfig
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
  googleClientSecretUnreadable: boolean
  googleRedirectUriHint: string
  envGoogleOAuthFallback: boolean
  captchaEnabled: boolean
  captchaProvider: CaptchaProviderId | null
  captchaSiteKey: string | null
  captchaSecretMasked: string | null
  hasCaptchaSecretInDb: boolean
  captchaSecretUnreadable: boolean
  captchaOnLogin: boolean
  captchaOnRegister: boolean
  captchaOnCheckout: boolean
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
  captchaOnCheckout?: boolean
  ga4Enabled?: boolean
  ga4MeasurementId?: string | null
  clarityEnabled?: boolean
  clarityProjectId?: string | null
}

export const WEBSITE_SETTING_SECTIONS = {
  ADMIN_BRANDING: 'admin_branding',
  AUTH_PAGES: 'auth_pages',
  CONTENT_PAGES: 'content_pages',
  ERROR_PAGES: 'error_pages',
  FORMS: 'forms',
  HOME_PAGE: 'home_page',
  SITE_META: 'site_meta',
  THEME: 'theme',
} as const

/**
 * The built-in screens a published builder page can stand in for, with their
 * `web_settings` (section, key) pointer and UI labels. Client presentation
 * mirror of the server list in `app/services/page_role_slots.ts`; the pair is
 * kept in lockstep by `tests/unit/page_role_slots.spec.ts`. Reused by the
 * Settings → Appearance pickers and the Pages dashboard "Use as page" menu, so
 * both surfaces write the same rows and stay consistent.
 */
export interface PageRoleSlot {
  section: string
  key: string
  label: string
  hint: string
}

export const PAGE_ROLE_SLOTS: readonly PageRoleSlot[] = [
  {
    section: WEBSITE_SETTING_SECTIONS.HOME_PAGE,
    key: 'front_page_id',
    label: 'Front page',
    hint: 'The public home page at /',
  },
  {
    section: WEBSITE_SETTING_SECTIONS.AUTH_PAGES,
    key: 'login_page_id',
    label: 'Sign in',
    hint: '/login',
  },
  {
    section: WEBSITE_SETTING_SECTIONS.AUTH_PAGES,
    key: 'register_page_id',
    label: 'Sign up',
    hint: '/register',
  },
  {
    section: WEBSITE_SETTING_SECTIONS.AUTH_PAGES,
    key: 'forgot_password_page_id',
    label: 'Forgot password',
    hint: '/forgot-password',
  },
  {
    section: WEBSITE_SETTING_SECTIONS.AUTH_PAGES,
    key: 'reset_password_page_id',
    label: 'Reset password',
    hint: '/reset-password/…',
  },
  {
    section: WEBSITE_SETTING_SECTIONS.ERROR_PAGES,
    key: 'not_found_page_id',
    label: 'Not found (404)',
    hint: 'Public 404 only — the admin 404 keeps its sidebar',
  },
  {
    section: WEBSITE_SETTING_SECTIONS.ERROR_PAGES,
    key: 'server_error_page_id',
    label: 'Server error (500)',
    hint: 'Falls back to the built-in page if this one cannot render',
  },
  {
    section: WEBSITE_SETTING_SECTIONS.CONTENT_PAGES,
    key: 'category_archive_page_id',
    label: 'Category archive',
    hint: 'Replaces the built-in /category/:slug archive',
  },
  {
    section: WEBSITE_SETTING_SECTIONS.CONTENT_PAGES,
    key: 'tag_archive_page_id',
    label: 'Tag archive',
    hint: 'Replaces the built-in /tag/:slug archive',
  },
  {
    section: WEBSITE_SETTING_SECTIONS.CONTENT_PAGES,
    key: 'posts_archive_page_id',
    label: 'Blog index',
    hint: 'Replaces the built-in /blog listing (supports ?q= search)',
  },
] as const

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

/** A content category assigned to a post (compact ref). */
export interface ContentCategoryRef {
  id: string
  name: string
  slug: string
}

/** Full content category record (manager page). */
export interface ContentCategoryDto {
  id: string
  name: string
  slug: string
  description: string | null
  parentId: string | null
  position: number
  postCount: number
}

/** A content tag assigned to a post (compact ref). */
export interface ContentTagRef {
  id: string
  name: string
  slug: string
}

/** Full content tag record (manager page). */
export interface ContentTagDto {
  id: string
  name: string
  slug: string
  description: string | null
  position: number
  postCount: number
}

export interface CreateContentTagRequest {
  name: string
  slug?: string
  description?: string | null
}

export type UpdateContentTagRequest = Partial<CreateContentTagRequest>

export interface ContentDto {
  id: string
  title: string
  slug: string
  body: string
  status: ContentStatus
  /** Who may read the post publicly. */
  visibility: ContentVisibility
  /** Whether a Protected password is set (never the password itself). */
  hasPassword: boolean
  /** Native featured image / thumbnail — a media URL (`/uploads/…`). */
  featuredImage: string | null
  /** Custom fields from the Content-type collection (raw values, for editing). */
  data: Record<string, unknown> | null
  /** Assigned content categories. */
  categories: ContentCategoryRef[]
  /** Assigned content tags. */
  tags: ContentTagRef[]
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
  visibility: ContentVisibility
  featuredImage: string | null
  /** Custom fields with relation ids resolved to labels and media ids to URLs. */
  data: Record<string, unknown> | null
  categories: ContentCategoryRef[]
  tags: ContentTagRef[]
  createdAt: string
  updatedAt: string
}

export interface CreateContentRequest {
  title: string
  slug: string
  body: string
  status: ContentStatus
  visibility?: ContentVisibility
  /** Plaintext; encrypted server-side. Required when visibility is PROTECTED. */
  password?: string | null
  featuredImage?: string | null
  data?: Record<string, unknown> | null
  categoryIds?: string[]
  tagIds?: string[]
}

export interface UpdateContentRequest {
  title?: string
  slug?: string
  body?: string
  status?: ContentStatus
  visibility?: ContentVisibility
  password?: string | null
  featuredImage?: string | null
  data?: Record<string, unknown> | null
  categoryIds?: string[]
  tagIds?: string[]
}

export interface CreateContentCategoryRequest {
  name: string
  slug?: string
  description?: string | null
  parentId?: string | null
}

export type UpdateContentCategoryRequest = Partial<CreateContentCategoryRequest>

export type PageRenderMode = 'SSR' | 'SSG' | 'CSR'

/** List row — omits the (potentially large) Puck block tree. */
/** Builder document, or a hand-written React component under `inertia/custom/pages/`. */
export type PageKind = 'BUILDER' | 'CODE'

export interface PageSummaryDto {
  id: string
  title: string
  path: string
  status: ContentStatus
  renderMode: PageRenderMode
  kind: PageKind
  /** Custom page slug; only set when `kind` is `CODE`. */
  component: string | null
  layoutId: string | null
  headerTemplateId: string | null
  footerTemplateId: string | null
  /** Per-page code chrome pointers (`codetpl:<kit>/<type>`), an alternative to the ids above. */
  codeHeader: string | null
  codeFooter: string | null
  codeLayout: string | null
  /** Render no header / no footer at all — distinct from "use the site default". */
  hideHeader: boolean
  hideFooter: boolean
  authorId: number | null
  publishedAt: string | null
  scheduledPublishAt: string | null
  scheduledUnpublishAt: string | null
  /** True when unpublished (staged) edits exist. */
  hasDraft: boolean
  draftUpdatedAt: string | null
  createdAt: string
  updatedAt: string
  /**
   * Where the row comes from: a database page (default/undefined), or a
   * file-page that lives in a kit folder as code — read-only in the admin.
   */
  source?: 'db' | 'file'
}

export interface PageDto extends PageSummaryDto {
  content: Record<string, unknown>
  seo: Record<string, unknown>
  draftContent: Record<string, unknown> | null
  draftSeo: Record<string, unknown> | null
}

export interface CreatePageRequest {
  title: string
  path: string
  status?: ContentStatus
  renderMode?: PageRenderMode
  kind?: PageKind
  component?: string | null
  layoutId?: string | null
  headerTemplateId?: string | null
  footerTemplateId?: string | null
  codeHeader?: string | null
  codeFooter?: string | null
  codeLayout?: string | null
  hideHeader?: boolean
  hideFooter?: boolean
  content?: Record<string, unknown>
  seo?: Record<string, unknown>
}

export interface UpdatePageRequest {
  title?: string
  path?: string
  status?: ContentStatus
  renderMode?: PageRenderMode
  kind?: PageKind
  component?: string | null
  layoutId?: string | null
  headerTemplateId?: string | null
  footerTemplateId?: string | null
  codeHeader?: string | null
  codeFooter?: string | null
  codeLayout?: string | null
  hideHeader?: boolean
  hideFooter?: boolean
  content?: Record<string, unknown>
  seo?: Record<string, unknown>
  scheduledPublishAt?: string | null
  scheduledUnpublishAt?: string | null
}

export type TemplateType = 'HEADER' | 'FOOTER' | 'COMPONENT' | 'LAYOUT' | 'EMAIL' | 'COLLECTION'

export interface TemplateSummaryDto {
  id: string
  name: string
  type: TemplateType
  isDefault: boolean
  /** The CMS collection a COLLECTION template is the item card for; null otherwise. */
  collectionKey: string | null
  createdAt: string
  updatedAt: string
  /** `'db'` = an editable row; `'code'` = a kit code template, listed read-only. */
  source: 'db' | 'code'
}

export interface TemplateDto extends TemplateSummaryDto {
  content: Record<string, unknown>
  /** Email HTML; only EMAIL templates have one, and only once published. */
  renderedHtml: string | null
}

export interface CreateTemplateRequest {
  name: string
  type: TemplateType
  content?: Record<string, unknown>
  isDefault?: boolean
  collectionKey?: string | null
}

export interface UpdateTemplateRequest {
  name?: string
  content?: Record<string, unknown>
  isDefault?: boolean
  collectionKey?: string | null
  /** Rendered in the builder on publish; ignored for non-EMAIL templates. */
  renderedHtml?: string | null
}

// ── Menus (WordPress-style navigation menu manager) ─────────────────────────

export type MenuItemType = 'page' | 'url' | 'collection'
export type MenuItemOpenMode = 'link' | 'mega'

export interface MenuSummaryDto {
  id: string
  handle: string
  name: string
  itemCount: number
  createdAt: string
  updatedAt: string
}

/** A menu item as edited in the admin (the raw stored reference, not resolved). */
export interface MenuItemDto {
  id: string
  label: string
  type: MenuItemType
  pageId: string | null
  url: string | null
  collectionKey: string | null
  recordId: string | null
  target: '_self' | '_blank'
  openMode: MenuItemOpenMode
  children: MenuItemDto[]
}

export interface MenuDto extends MenuSummaryDto {
  items: MenuItemDto[]
}

export interface CreateMenuRequest {
  name: string
  handle?: string
}

export interface UpdateMenuRequest {
  name?: string
  handle?: string
}

/** One node submitted when saving a menu's whole tree. */
export interface MenuItemInputDto {
  id?: string
  label: string
  type?: MenuItemType
  pageId?: string | null
  url?: string | null
  collectionKey?: string | null
  recordId?: string | null
  target?: '_self' | '_blank'
  openMode?: MenuItemOpenMode
  children?: MenuItemInputDto[]
}

/** A menu item ready to render — reference resolved to a concrete `href`. */
export interface ResolvedMenuItemDto {
  id: string
  label: string
  href: string
  target: '_self' | '_blank'
  openMode: MenuItemOpenMode
  children: ResolvedMenuItemDto[]
}

export interface ResolvedMenuDto {
  handle: string
  name: string
  items: ResolvedMenuItemDto[]
}

export interface ModuleNavSubItem {
  label: string
  href: string
  /** phosphor icon name, resolved on the client. */
  icon?: string
  permission?: string
}

/** A module's sidebar nav group (manifest `nav` + module name). */
export interface ModuleMenuItem {
  name: string
  label: string
  /** phosphor icon name, resolved on the client. */
  icon: string
  order?: number
  href?: string
  permission?: string
  items?: ModuleNavSubItem[]
}

export interface ModuleDto {
  name: string
  label: string
  description: string
  version: string
  enabled: boolean
  /** False when the module's declared tables do not all exist yet. */
  schemaReady: boolean
  /** False when the manifest declares no tables, so uninstall is not possible. */
  canUninstall: boolean
  /**
   * Trust tier — what separates the Apps tab from the Plugins tab.
   *
   * Mirrors `ModuleDto` in `app/services/modules_service.ts`; the two are
   * hand-duplicated and must change together.
   */
  kind: 'app' | 'plugin'
}

export type CmsCollectionSource = 'PRISMA' | 'DYNAMIC'
/**
 * COLLECTION = a stand-alone dynamic table; CONTENT / PRODUCT = metadata-only,
 * their fields extend a built-in editor (Content / ecommerce Product). PRODUCT is
 * only offered while the ecommerce module is enabled.
 */
export type CmsCollectionType = 'COLLECTION' | 'CONTENT' | 'PRODUCT'
export type CmsFieldType =
  | 'TEXT'
  | 'TEXTAREA'
  | 'NUMBER'
  | 'INTEGER'
  | 'DECIMAL'
  | 'BOOL'
  | 'DATE'
  | 'DATETIME'
  | 'SELECT'
  | 'MULTISELECT'
  | 'EMAIL'
  | 'PASSWORD'
  | 'RICHTEXT'
  | 'MEDIA'
  | 'SLUG'
  | 'JSON'
  | 'REPEATABLE'
  | 'RELATION'
  | 'COMPONENT'

export type CmsRelationType = 'manyToOne' | 'oneToOne' | 'manyToMany' | 'oneToMany'

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
  type: CmsCollectionType
  modelName: string | null
  tableName: string | null
  listConfig: Record<string, unknown>
  revisionsOn: boolean
  draftsOn: boolean
  kind: 'collection' | 'single'
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
  type?: CmsCollectionType
  revisionsOn?: boolean
  draftsOn?: boolean
  kind?: 'collection' | 'single'
  fields: CreateCmsCollectionFieldRequest[]
}

export interface UpdateCmsCollectionRequest {
  label?: string
  icon?: string | null
  group?: string | null
  revisionsOn?: boolean
  draftsOn?: boolean
  kind?: 'collection' | 'single'
  /** Rename the collection key (renames its physical storage live). */
  key?: string
  /** Switch COLLECTION ↔ CONTENT (allowed only while empty). */
  type?: CmsCollectionType
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

export interface CmsComponentField {
  key: string
  label: string
  type: CmsFieldType
}

export interface CmsComponentDto {
  id: string
  key: string
  label: string
  icon: string | null
  fields: CmsComponentField[]
  createdAt: string
  updatedAt: string
}

export interface CreateCmsComponentRequest {
  key: string
  label: string
  icon?: string | null
  fields: CmsComponentField[]
}

export interface UpdateCmsComponentRequest {
  label?: string
  icon?: string | null
  fields?: CmsComponentField[]
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

export interface MediaVariantDto {
  width: number
  height: number | null
  format: string
  url: string
}

export interface MediaDto {
  id: string
  filename: string
  mimeType: string
  size: number
  url: string
  title: string | null
  description: string | null
  alt: string | null
  width: number | null
  height: number | null
  authorId: number | null
  /** Responsive webp derivatives, ascending by width. */
  variants: MediaVariantDto[]
  createdAt: string
  updatedAt: string | null
}

// ── Personal Access Tokens (external API /api/v1) ──────────────────────────────

export interface ApiTokenDto {
  id: string
  name: string | null
  abilities: string[]
  lastUsedAt: string | null
  expiresAt: string | null
  createdAt: string
}

/** Returned ONCE on creation — includes the plaintext token value (never re-shown). */
export interface ApiTokenCreatedDto extends ApiTokenDto {
  token: string
}

export interface CreateApiTokenRequest {
  name: string
  abilities?: string[]
  /** Human duration like '30 days' / '1 year', or null/omitted for no expiry. */
  expiresIn?: string | null
}

/**
 * Abilities a PAT can be scoped to. Effective access at request time is the
 * intersection of these with the token owner's RBAC permissions.
 */
export const API_TOKEN_ABILITIES = [
  { id: '*', label: 'Full access (all abilities)' },
  { id: 'content:read', label: 'Content — read' },
  { id: 'content:write', label: 'Content — write (create / update / delete)' },
  { id: 'cms:read', label: 'CMS records — read' },
  { id: 'cms:write', label: 'CMS records — write (create / update / delete)' },
] as const

export type ApiTokenAbility = (typeof API_TOKEN_ABILITIES)[number]['id']

// ── Custom forms (named form definitions) ────────────────────────────────────

/** Field types a custom form may use. Mirrors `FORM_FIELD_TYPES` on the server. */
export type FormFieldType =
  | 'text'
  | 'textarea'
  | 'email'
  | 'tel'
  | 'number'
  | 'date'
  | 'url'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'checkbox_group'
  | 'file'

/** Column span in a 12-col row: full=1, half=2, third=3, quarter=4, sixth=6 per row. */
export type FormFieldWidth = 'full' | 'half' | 'third' | 'quarter' | 'sixth'

export interface FormFieldDef {
  key: string
  label: string
  type: FormFieldType
  required?: boolean
  placeholder?: string
  help?: string
  /** select | radio | checkbox_group */
  options?: string[]
  width?: FormFieldWidth
  min?: number | null
  max?: number | null
  /** file — accepted types hint (the server also enforces its own allow-list) */
  accept?: string
}

export type FormDefinitionStatus = 'active' | 'inactive' | 'draft'

export interface FormSummaryDto {
  id: string
  slug: string
  title: string
  status: FormDefinitionStatus
  fieldCount: number
  submissionCount: number
  createdAt: string
  updatedAt: string
}

export interface FormDefinitionDto {
  id: string
  slug: string
  title: string
  fields: FormFieldDef[]
  successMessage: string | null
  status: FormDefinitionStatus
  submissionCount: number
  createdAt: string
  updatedAt: string
}

/** The public shape of a form — what a page renders. No internal fields. */
export interface PublicFormDto {
  slug: string
  title: string
  fields: FormFieldDef[]
  successMessage: string | null
}

export interface CreateFormRequest {
  title: string
  slug?: string
}

export interface UpdateFormRequest {
  title?: string
  slug?: string
  successMessage?: string | null
  status?: FormDefinitionStatus
  fields?: FormFieldDef[]
}
