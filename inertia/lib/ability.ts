export function abilityAllowsCode(permissionNames: string[], code: string): boolean {
  if (permissionNames.includes('*')) return true
  const parts = code.split(':')
  if (parts.length < 2) return false
  if (parts[0] === 'cms' && parts.length === 3) {
    return permissionNames.includes(`cms:${parts[1]}:${parts[2]}`) || permissionNames.includes('cms:manage')
  }
  if (parts[0] === 'cms' && parts.length === 2) {
    return permissionNames.includes(`cms:${parts[1]}`) || permissionNames.includes('cms:manage')
  }
  return permissionNames.includes(code)
}
