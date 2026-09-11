/**
 * The single boundary deciding what never leaves an export.
 *
 * An export archive ends up on laptops, in email and in backups — it must carry
 * the minimum that is useful and nothing that would matter if it leaked. Two
 * rules, enforced by a test:
 *
 * - Whole tables that are secrets or non-portable operational/replay data are
 *   never serialized.
 * - Individual secret-bearing columns are stripped from any row that IS
 *   serialized. All `*_enc` values are AES-256-GCM ciphertext bound to this
 *   install's APP_KEY — undecryptable elsewhere, so they are useless as well as
 *   sensitive.
 *
 * `password`/`password_hash` are deliberately NOT stripped here: a bcrypt hash
 * is one-way, and whether it travels is the `users` section's decision, not a
 * blanket rule.
 */

/** Excluded wholesale — secrets, or per-install operational/replay/audit data. */
const EXCLUDED_TABLES = new Set<string>([
  'ecommerce_gateway_credentials',
  'ecommerce_webhook_events',
  'ecommerce_idempotency_keys',
  'ecommerce_account_sessions',
  'analytics_events',
  'mcp_audit_logs',
])

/** Exact secret column names that don't match a suffix rule below. */
const SECRET_COLUMN_EXACT = new Set<string>(['preview_token', 'remember_me_token'])

export function isExcludedTable(table: string): boolean {
  return EXCLUDED_TABLES.has(table)
}

/** True for any column whose value must never be exported. */
export function isSecretColumn(column: string): boolean {
  return (
    column.endsWith('_enc') ||
    column.endsWith('_secret') ||
    column.endsWith('_token') ||
    SECRET_COLUMN_EXACT.has(column)
  )
}

/** Drop every secret-bearing column from a row about to be serialized. */
export function stripSecrets<T extends Record<string, unknown>>(row: T): Partial<T> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (!isSecretColumn(k)) out[k] = v
  }
  return out as Partial<T>
}

/**
 * A `web_settings` / integration-settings key whose value is a secret.
 *
 * Encrypted secrets live in `*_enc` keys; anything with "secret" in the key is
 * also refused defensively.
 */
export function isSecretSettingKey(key: string): boolean {
  return key.endsWith('_enc') || key.toLowerCase().includes('secret')
}

/** Assert a serialized payload carries no denylisted key (used by the export test). */
export function assertNoSecrets(value: unknown, at = 'root'): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoSecrets(v, `${at}[${i}]`))
    return
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSecretColumn(k) || isSecretSettingKey(k)) {
        throw new Error(`Export leaked a secret key "${k}" at ${at}`)
      }
      assertNoSecrets(v, `${at}.${k}`)
    }
  }
}
