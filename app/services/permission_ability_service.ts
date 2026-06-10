/**
 * Permission grammar (CASL-style ability factory).
 *
 *   - `*`                       → manage all
 *   - `cms:manage`              → schema/collection CRUD + per-collection record access
 *   - `cms:<key>:<verb>`        → dynamic collection record access
 *   - `<resource>:<action>`     → static subjects (content, user, settings, etc.)
 */
export function abilityAllowsCode(permissionNames: string[], code: string): boolean {
  if (permissionNames.includes('*')) return true
  if (code === '*') return permissionNames.includes('*')

  const parts = code.split(':')
  if (parts.length < 2) return false

  if (parts[0] === 'cms' && parts.length === 3) {
    const perm = `cms:${parts[1]}:${parts[2]}`
    return permissionNames.includes(perm) || permissionNames.includes('cms:manage')
  }

  if (parts[0] === 'cms' && parts.length === 2) {
    return permissionNames.includes(code) || permissionNames.includes('cms:manage')
  }

  return permissionNames.includes(code)
}

export function collectUserPermissions(user: {
  roles?: Array<{ permissions?: Array<{ name: string }> }>
}): string[] {
  const set = new Set<string>()
  for (const role of user.roles ?? []) {
    for (const perm of role.permissions ?? []) {
      set.add(perm.name)
    }
  }
  return Array.from(set)
}
