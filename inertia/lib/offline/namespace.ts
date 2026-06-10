/**
 * Namespace helpers so two accounts on the same browser don't share Dexie DBs.
 */

export function namespaceFromUserId(userId: string | null | undefined): string {
  if (!userId) return 'anon'
  return `u-${hash10(userId)}`
}

function hash10(input: string): string {
  let h = 2166136261 >>> 0
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 16777619)
  }
  return (h >>> 0).toString(16).padStart(10, '0').slice(0, 10)
}
