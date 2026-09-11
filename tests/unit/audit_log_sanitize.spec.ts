import { test } from '@japa/runner'
import { __testing } from '#services/audit_log_service'

const { sanitize, isSensitiveKey } = __testing

test.group('AuditLog | sensitive key detection', () => {
  test('flags credential-shaped key names', ({ assert }) => {
    for (const key of [
      'password',
      'passwordConfirmation',
      'secret',
      'client_secret',
      'token',
      'accessToken',
      'apiKey',
      'api_key',
      'stripe_secret_key_enc',
      'authorization',
      'cookie',
      'signature',
      'cardNumber',
      'cvv',
    ]) {
      assert.isTrue(isSensitiveKey(key), `expected "${key}" to be treated as sensitive`)
    }
  })

  test('leaves ordinary keys alone', ({ assert }) => {
    for (const key of ['email', 'amount', 'currency', 'status', 'orderId', 'quantity']) {
      assert.isFalse(isSensitiveKey(key), `expected "${key}" to be allowed`)
    }
  })
})

test.group('AuditLog | sanitize', () => {
  test('redacts sensitive values at the top level', ({ assert }) => {
    assert.deepEqual(sanitize({ email: 'a@b.c', password: 'hunter2' }), {
      email: 'a@b.c',
      password: '[redacted]',
    })
  })

  test('redacts sensitive values at any depth', ({ assert }) => {
    const input = {
      gateway: { name: 'stripe', credentials: { secret_key: 'sk_live_abc', mode: 'live' } },
    }
    assert.deepEqual(sanitize(input), {
      gateway: { name: 'stripe', credentials: { secret_key: '[redacted]', mode: 'live' } },
    })
  })

  test('redacts inside arrays', ({ assert }) => {
    const input = { items: [{ name: 'a', apiKey: 'k1' }, { name: 'b' }] }
    assert.deepEqual(sanitize(input), {
      items: [{ name: 'a', apiKey: '[redacted]' }, { name: 'b' }],
    })
  })

  test('keeps primitives intact', ({ assert }) => {
    assert.deepEqual(sanitize({ amount: 1999, ok: true, note: null }), {
      amount: 1999,
      ok: true,
      note: null,
    })
  })

  test('truncates very long strings', ({ assert }) => {
    const long = 'x'.repeat(5_000)
    const out = sanitize({ note: long }) as { note: string }
    assert.isBelow(out.note.length, 5_000)
    assert.isTrue(out.note.endsWith('[truncated]'))
  })

  test('stops recursing past the depth cap', ({ assert }) => {
    // Ten levels deep — past the cap of six.
    let deep: Record<string, unknown> = { value: 'bottom' }
    for (let i = 0; i < 10; i++) deep = { nested: deep }

    const out = JSON.stringify(sanitize(deep))
    assert.include(out, '[truncated]')
    assert.notInclude(out, 'bottom')
  })

  test('caps array length', ({ assert }) => {
    const out = sanitize({ items: Array.from({ length: 500 }, (_, i) => i) }) as {
      items: number[]
    }
    assert.equal(out.items.length, 100)
  })

  test('serialises dates rather than dropping them', ({ assert }) => {
    const out = sanitize({ at: new Date('2026-01-01T00:00:00.000Z') }) as { at: string }
    assert.equal(out.at, '2026-01-01T00:00:00.000Z')
  })
})
