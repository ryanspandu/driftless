import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'
import FormSubmission from '#models/form_submission'

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()
  return cleanup
}

const admin = () => User.query().where('email', 'admin@driftless.local').firstOrFail()

test.group('Forms | public submit', (group) => {
  group.each.setup(async () => resetDatabase())

  test('stores a submission, extracts the email and drops internal fields', async ({
    client,
    assert,
  }) => {
    const res = await client.post('/api/forms/submit').json({
      form: 'Contact',
      page: '/contact',
      fields: {
        name: 'Ada',
        email: 'ada@example.com',
        message: 'Hello there',
        _hp_url: '', // honeypot empty → not spam
        _token: 'should-be-dropped',
      },
    })
    res.assertStatus(200)

    const row = await FormSubmission.query().firstOrFail()
    assert.equal(row.formName, 'Contact')
    assert.equal(row.pagePath, '/contact')
    assert.equal(row.status, 'new')
    assert.equal(row.email, 'ada@example.com')
    assert.deepEqual(row.data, { name: 'Ada', email: 'ada@example.com', message: 'Hello there' })
    // Internal / honeypot keys never persisted.
    assert.notProperty(row.data, '_hp_url')
    assert.notProperty(row.data, '_token')
  })

  test('a filled honeypot is stored as spam', async ({ client, assert }) => {
    const res = await client.post('/api/forms/submit').json({
      form: 'Contact',
      fields: { email: 'bot@spam.com', _hp_url: 'http://spam.example' },
    })
    res.assertStatus(200)
    const row = await FormSubmission.query().firstOrFail()
    assert.equal(row.status, 'spam')
  })

  test('an invalid email is discarded but the submission is kept', async ({ client, assert }) => {
    await client.post('/api/forms/submit').json({ fields: { email: 'not-an-email', q: 'hi' } })
    const row = await FormSubmission.query().firstOrFail()
    assert.isNull(row.email)
    assert.equal(row.data.q, 'hi')
  })
})

test.group('Forms | admin inbox', (group) => {
  group.each.setup(async () => resetDatabase())

  test('the inbox requires forms:read', async ({ client }) => {
    const anon = await client.get('/api/admin/forms')
    anon.assertStatus(401)

    const res = await client.get('/api/admin/forms').loginAs(await admin())
    res.assertStatus(200)
    res.assertBodyContains({ unread: 0 })
  })

  test('lists submissions with an unread count and filters by status', async ({
    client,
    assert,
  }) => {
    await client.post('/api/forms/submit').json({ form: 'A', fields: { q: '1' } })
    await client.post('/api/forms/submit').json({ form: 'B', fields: { q: '2' } })

    const list = await client.get('/api/admin/forms').loginAs(await admin())
    list.assertStatus(200)
    assert.equal(list.body().unread, 2)
    assert.lengthOf(list.body().items, 2)

    // Mark one read → unread drops to 1.
    const id = list.body().items[0].id
    const upd = await client
      .put(`/api/admin/forms/${id}/status`)
      .json({ status: 'read' })
      .loginAs(await admin())
    upd.assertStatus(200)

    const after = await client.get('/api/admin/forms?status=new').loginAs(await admin())
    assert.equal(after.body().unread, 1)
    assert.lengthOf(after.body().items, 1)
  })

  test('status mutation and delete require forms:manage; a bad status is rejected', async ({
    client,
    assert,
  }) => {
    await client.post('/api/forms/submit').json({ form: 'A', fields: { q: '1' } })
    const list = await client.get('/api/admin/forms').loginAs(await admin())
    const id = list.body().items[0].id

    const bad = await client
      .put(`/api/admin/forms/${id}/status`)
      .json({ status: 'archived' })
      .loginAs(await admin())
    bad.assertStatus(422)

    const del = await client.delete(`/api/admin/forms/${id}`).loginAs(await admin())
    del.assertStatus(200)
    assert.equal(
      await FormSubmission.query()
        .count('* as t')
        .firstOrFail()
        .then((r) => Number(r.$extras.t)),
      0
    )
  })
})
