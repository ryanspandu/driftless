import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'
import MailSetting from '#models/mail_setting'
import MailSettingsService from '#services/mail_settings_service'

const SECRET = 'super-secret-smtp-password'

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()
  return cleanup
}

async function adminUser() {
  return User.query().where('email', 'admin@driftless.local').firstOrFail()
}

test.group('Mail settings', (group) => {
  group.each.setup(async () => resetDatabase())

  test('the SMTP password never leaves the server', async ({ client, assert }) => {
    const admin = await adminUser()

    const saved = await client
      .put('/api/admin/settings/mail')
      .loginAs(admin)
      .json({ enabled: true, host: 'smtp.example.com', port: 587, password: SECRET })

    saved.assertStatus(200)

    /**
     * The important assertion: walk the whole response body as text and prove
     * the plaintext is not in it anywhere, at any depth. A masked form and a
     * `hasPasswordInDb` flag are the only things a client may learn.
     */
    assert.notInclude(JSON.stringify(saved.body()), SECRET)
    assert.isTrue(saved.body().hasPasswordInDb)
    assert.isNotNull(saved.body().passwordMasked)

    const fetched = await client.get('/api/admin/settings/mail').loginAs(admin)
    fetched.assertStatus(200)
    assert.notInclude(JSON.stringify(fetched.body()), SECRET)
  })

  test('the password is encrypted at rest, not stored in the clear', async ({ client, assert }) => {
    const admin = await adminUser()
    await client
      .put('/api/admin/settings/mail')
      .loginAs(admin)
      .json({ enabled: true, host: 'smtp.example.com', password: SECRET })

    const row = await MailSetting.findOrFail('default')
    assert.isNotNull(row.passwordEnc)
    assert.notInclude(row.passwordEnc!, SECRET)

    // …and is still readable through the service, so the round trip works.
    const resolved = await new MailSettingsService().resolve()
    assert.equal(resolved?.password, SECRET)
  })

  test('editing another field keeps the stored password', async ({ client, assert }) => {
    const admin = await adminUser()
    await client
      .put('/api/admin/settings/mail')
      .loginAs(admin)
      .json({ enabled: true, host: 'smtp.example.com', password: SECRET })

    // No `password` key at all — the common case of editing the host.
    await client.put('/api/admin/settings/mail').loginAs(admin).json({ host: 'smtp2.example.com' })

    const resolved = await new MailSettingsService().resolve()
    assert.equal(resolved?.host, 'smtp2.example.com')
    assert.equal(resolved?.password, SECRET, 'editing the host must not wipe the password')
  })

  test('an empty password clears it deliberately', async ({ client, assert }) => {
    const admin = await adminUser()
    await client
      .put('/api/admin/settings/mail')
      .loginAs(admin)
      .json({ enabled: true, host: 'smtp.example.com', password: SECRET })

    await client.put('/api/admin/settings/mail').loginAs(admin).json({ password: '' })

    const row = await MailSetting.findOrFail('default')
    assert.isNull(row.passwordEnc)
  })

  test('requires settings:manage', async ({ client }) => {
    // Unauthenticated.
    const anon = await client.get('/api/admin/settings/mail')
    anon.assertStatus(401)

    const anonWrite = await client
      .put('/api/admin/settings/mail')
      .json({ host: 'evil.example.com' })
    anonWrite.assertStatus(401)

    const anonTest = await client
      .post('/api/admin/settings/mail/test')
      .json({ to: 'a@example.com' })
    anonTest.assertStatus(401)
  })

  test('reports "not configured" rather than pretending to send', async ({ client }) => {
    const admin = await adminUser()

    // No DB settings, and .env.test sets no SMTP_HOST.
    const res = await client
      .post('/api/admin/settings/mail/test')
      .loginAs(admin)
      .json({ to: 'someone@example.com' })

    res.assertStatus(422)
    res.assertBodyContains({ reason: 'mail_not_configured' })
  })

  test('records the outcome of a failed test send', async ({ client, assert }) => {
    const admin = await adminUser()

    // A host that cannot resolve — the send genuinely fails.
    await client
      .put('/api/admin/settings/mail')
      .loginAs(admin)
      .json({ enabled: true, host: '127.0.0.1', port: 1, secure: false })

    const res = await client
      .post('/api/admin/settings/mail/test')
      .loginAs(admin)
      .json({ to: 'someone@example.com' })

    res.assertStatus(422)

    const row = await MailSetting.findOrFail('default')
    assert.isFalse(row.lastTestOk)
    assert.isNotNull(row.lastTestedAt)
    assert.isNotNull(row.lastTestError)
  }).timeout(30_000)
})
