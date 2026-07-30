export const BUILTIN_PERMISSIONS: { name: string; description: string }[] = [
  { name: '*', description: 'Wildcard: full access to every resource.' },
  { name: 'content:create', description: 'Create content records.' },
  { name: 'content:read', description: 'Read content records.' },
  { name: 'content:update', description: 'Update content records.' },
  { name: 'content:delete', description: 'Delete content records.' },
  { name: 'user:read', description: 'Read user profiles.' },
  { name: 'user:manage', description: 'Create / update / delete users.' },
  { name: 'media:read', description: 'Read media library files.' },
  { name: 'media:manage', description: 'Upload / delete media files.' },
  { name: 'cms:manage', description: 'Create / edit / delete CMS collection schemas.' },
  { name: 'page:create', description: 'Create builder pages.' },
  { name: 'page:read', description: 'Read builder pages.' },
  { name: 'page:update', description: 'Update builder pages.' },
  { name: 'page:delete', description: 'Delete builder pages.' },
  {
    name: 'template:create',
    description: 'Create templates (headers/footers/components/layouts).',
  },
  { name: 'template:read', description: 'Read templates.' },
  { name: 'template:update', description: 'Update templates.' },
  { name: 'template:delete', description: 'Delete templates.' },
  { name: 'role:manage', description: 'Create / edit / delete roles and assign permissions.' },
  { name: 'permission:manage', description: 'Create / edit / delete permission codes.' },
  {
    name: 'settings:manage',
    description: 'Manage site integrations (Google OAuth, CAPTCHA, etc.).',
  },
  { name: 'module:manage', description: 'Enable or disable installed modules and plugins.' },
  {
    name: 'module:install',
    description: 'Apply pending database migrations to install a module.',
  },
  {
    name: 'module:uninstall',
    description: "Drop a module's tables and delete its data. Irreversible.",
  },
]

/**
 * Role attached to accounts created through public self-service signup.
 *
 * Deliberately holds no permissions: registration is an untrusted entry point,
 * so it must not confer any capability. Anything a signed-up account should be
 * able to do has to be granted explicitly afterwards.
 */
export const SELF_REGISTERED_ROLE = 'MEMBER'

export const BUILTIN_ROLES: { name: string; description: string }[] = [
  { name: 'SUPERADMIN', description: 'Full access. Automatically granted the * wildcard.' },
  { name: 'ADMIN', description: 'Operational admin — manages content and users.' },
  { name: 'USER', description: 'Signed-in user with content authoring rights.' },
  {
    name: SELF_REGISTERED_ROLE,
    description: 'Self-registered account. No permissions by default.',
  },
  { name: 'GUEST', description: 'Unauthenticated / public viewer.' },
]

export const ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  SUPERADMIN: ['*'],
  ADMIN: [
    'content:create',
    'content:read',
    'content:update',
    'content:delete',
    'user:read',
    'user:manage',
    'media:read',
    'media:manage',
    'cms:manage',
    'page:create',
    'page:read',
    'page:update',
    'page:delete',
    'template:create',
    'template:read',
    'template:update',
    'template:delete',
    'settings:manage',
    'module:manage',
    /**
     * Installing a module runs migrations, runs a front-end build on the server
     * and restarts the process. That makes a compromised ADMIN account
     * considerably more valuable than one holding only `settings:manage`.
     *
     * Granted here as a deliberate product decision, with the compensating
     * controls that decision requires: a 3-per-hour per-user throttle
     * (`moduleInstallThrottle`), an audit row recording the operator's intent
     * before any work starts, and a requested name that is resolved through the
     * on-disk allow-list before it can reach a subprocess.
     */
    'module:install',
  ],
  USER: ['content:create', 'content:read', 'content:update', 'content:delete'],
  // Intentionally empty — see SELF_REGISTERED_ROLE. `module:uninstall` stays
  // out of ADMIN: it drops tables and there is no undo.
  [SELF_REGISTERED_ROLE]: [],
  GUEST: ['content:read'],
}
