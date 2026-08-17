import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'
import MailDelivery from '#models/mail_delivery'
import Template from '#models/template'
import TemplatesService from '#services/templates_service'
import { newUlid } from '#services/ulid_service'
import MailEventsService from '#services/mail_events_service'
import { getMailEvent, registerMailEvent, registeredMailEvents } from '#services/mail_events'

const service = new MailEventsService()

/**
 * A disableable event to exercise the toggle against.
 *
 * Registered by the test rather than borrowed from a module: only core's
 * events exist here, because `ecommerce` ships `autoEnable: false` and so
 * never boots in the test environment. Relying on a module being enabled would
 * make these tests pass or fail on unrelated configuration.
 */
const FIXTURE_KEY = 'testfixture.toggleable'

function ensureFixtureEvent() {
  if (getMailEvent(FIXTURE_KEY)) return
  registerMailEvent({
    key: FIXTURE_KEY,
    owner: 'core',
    label: 'Toggleable fixture',
    description: 'Exists only in the test suite.',
    trigger: 'admin',
    category: 'transactional',
    canDisable: true,
    defaultEnabled: true,
    defaults: {
      subject: 'Fixture for {{siteName}}',
      heading: 'Fixture heading',
      intro: 'Hello {{name}}.',
      buttonLabel: 'Do the thing',
      outro: 'Goodbye.',
    },
    variables: ['siteName', 'name'],
  })
}

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()
  return cleanup
}

async function adminUser() {
  return User.query().where('email', 'admin@driftless.local').firstOrFail()
}

test.group('Mail events', (group) => {
  // Once per process — the registry is global and refuses duplicate keys.
  group.setup(async () => ensureFixtureEvent())
  group.each.setup(async () => resetDatabase())

  test('core declares the password reset email', async ({ assert }) => {
    const event = getMailEvent('auth.password_reset')
    assert.isDefined(event)
    assert.equal(event!.owner, 'core')
    // Not disableable: switching it off would leave the forgot-password form
    // reporting success while locking every account out.
    assert.isFalse(event!.canDisable)
  })

  test('every declared event has a unique, namespaced key', async ({ assert }) => {
    const keys = registeredMailEvents().map((e) => e.key)
    assert.lengthOf(new Set(keys), keys.length)
    for (const key of keys) assert.match(key, /^[a-z0-9_]+\.[a-z0-9_]+$/)
  })

  test('an event with no stored row falls back to its declared default', async ({ assert }) => {
    for (const event of registeredMailEvents()) {
      const expected = event.canDisable ? event.defaultEnabled : true
      assert.equal(await service.isEnabled(event.key), expected, event.key)
    }
  })

  test('an undeclared key is never suppressed', async ({ assert }) => {
    // Silently dropping an email nobody has described yet would be far worse
    // than sending one.
    assert.isTrue(await service.isEnabled('nothing.declares.this'))
  })

  test('toggling an event off is honoured', async ({ assert }) => {
    await service.setEnabled(FIXTURE_KEY, false)
    assert.isFalse(await service.isEnabled(FIXTURE_KEY))

    await service.setEnabled(FIXTURE_KEY, true)
    assert.isTrue(await service.isEnabled(FIXTURE_KEY))
  })

  test('an event that may not be disabled refuses to be', async ({ assert }) => {
    await assert.rejects(() => service.setEnabled('auth.password_reset', false))
    assert.isTrue(await service.isEnabled('auth.password_reset'))
  })

  test('a stale row cannot keep a non-disableable email switched off', async ({ assert }) => {
    /**
     * Simulates a row written while the event still allowed disabling. The
     * guard lives in the service, not just the UI, so the email still sends.
     */
    const { default: MailEventSetting } = await import('#models/mail_event_setting')
    await MailEventSetting.create({ key: 'auth.password_reset', enabled: false })

    assert.isTrue(await service.isEnabled('auth.password_reset'))
    const listed = (await service.list()).find((e) => e.key === 'auth.password_reset')
    assert.isTrue(listed!.enabled)
  })

  test('the delivery log records an attempt and its outcome', async ({ assert }) => {
    const id = await service.recordAttempt({
      eventKey: 'auth.password_reset',
      toAddress: 'someone@example.com',
      subject: 'Reset your password',
    })

    // Opened before the send, so a process that dies leaves evidence.
    let row = await MailDelivery.findOrFail(id)
    assert.equal(row.status, 'queued')
    assert.isNull(row.completedAt)

    await service.completeAttempt(id, 'failed', 'connection refused')
    row = await MailDelivery.findOrFail(id)
    assert.equal(row.status, 'failed')
    assert.equal(row.error, 'connection refused')
    assert.isNotNull(row.completedAt)
  })

  test('completing an unknown attempt never throws', async ({ assert }) => {
    // Logging must not be able to break sending.
    await service.completeAttempt(null, 'sent')
    await service.completeAttempt('no-such-row', 'sent')
    assert.isTrue(true)
  })

  test('copy falls back to the shipped wording field by field', async ({ assert }) => {
    await service.setCopy(FIXTURE_KEY, { heading: 'Only the heading changed' })

    const copy = await service.copy(FIXTURE_KEY, { siteName: 'Acme', name: 'Sam' })
    assert.equal(copy.heading, 'Only the heading changed')
    // Everything else keeps the default — and still gets its placeholders
    // substituted, so an operator editing one field does not freeze the rest.
    assert.equal(copy.subject, 'Fixture for Acme')
    assert.equal(copy.intro, 'Hello Sam.')
    assert.equal(copy.outro, 'Goodbye.')
  })

  test('an empty string is a real value, not a reset', async ({ assert }) => {
    // "Leave this part out" has to be expressible; only null restores.
    await service.setCopy(FIXTURE_KEY, { outro: '' })
    assert.equal((await service.copy(FIXTURE_KEY)).outro, '')

    await service.setCopy(FIXTURE_KEY, { outro: null })
    assert.equal((await service.copy(FIXTURE_KEY)).outro, 'Goodbye.')
  })

  test('an unknown placeholder is left visible rather than blanked', async ({ assert }) => {
    await service.setCopy(FIXTURE_KEY, { heading: 'Hi {{sitename}} and {{siteName}}' })
    const copy = await service.copy(FIXTURE_KEY, { siteName: 'Acme' })
    // The typo survives so the operator can see and fix it; blanking it would
    // leave a sentence with an unexplainable hole.
    assert.equal(copy.heading, 'Hi {{sitename}} and Acme')
  })

  test('editing copy does not switch the email off', async ({ assert }) => {
    await service.setCopy(FIXTURE_KEY, { subject: 'Changed' })
    assert.isTrue(await service.isEnabled(FIXTURE_KEY))
  })

  test('branding falls back to shipped defaults', async ({ assert }) => {
    const branding = await service.branding()
    // A hex literal, never a CSS variable or oklch() — email clients resolve
    // neither.
    assert.match(branding.accentColor, /^#[0-9a-fA-F]{6}$/)
  })

  test('the admin API saves copy and reports it as customised', async ({ client, assert }) => {
    const admin = await adminUser()

    const res = await client
      .put(`/api/admin/settings/mail/events/${FIXTURE_KEY}`)
      .loginAs(admin)
      .json({ heading: 'From the API' })
    res.assertStatus(200)

    const row = (res.body() as { key: string; customised: boolean }[]).find(
      (e) => e.key === FIXTURE_KEY
    )
    assert.isTrue(row!.customised)
    assert.equal((await service.copy(FIXTURE_KEY)).heading, 'From the API')
  })

  test('a designed template replaces the built-in layout', async ({ assert }) => {
    const template = await Template.create({
      id: newUlid(),
      name: 'Receipt design',
      type: 'EMAIL',
      content: {},
      renderedHtml:
        '<h1>Hi {{name}}</h1><div data-email-body-slot="">placeholder</div><p>bye</p>',
      isDefault: false,
    })

    await service.setTemplate(FIXTURE_KEY, template.id)

    const html = await service.renderedTemplate(
      FIXTURE_KEY,
      { name: 'Sam' },
      '<table><tr><td>ORDER TABLE</td></tr></table>'
    )

    assert.include(html!, 'Hi Sam')
    // The service-composed part replaces the marker element entirely, so an
    // operator can place it but cannot author what lands inside it.
    assert.include(html!, 'ORDER TABLE')
    assert.notInclude(html!, 'placeholder')
    assert.notInclude(html!, 'data-email-body-slot')
  })

  test('only EMAIL templates may be wired to an email', async ({ assert }) => {
    const header = await Template.create({
      id: newUlid(),
      name: 'Site header',
      type: 'HEADER',
      content: {},
      isDefault: false,
    })
    // A page header renders flex layout and Tailwind classes; in an inbox that
    // is a broken email, so this is refused rather than silently ignored.
    await assert.rejects(() => service.setTemplate(FIXTURE_KEY, header.id))
  })

  test('a missing design degrades to the built-in email', async ({ assert }) => {
    const template = await Template.create({
      id: newUlid(),
      name: 'Never published',
      type: 'EMAIL',
      content: {},
      // Published templates get HTML; this one was created and never saved.
      renderedHtml: null,
      isDefault: false,
    })
    await service.setTemplate(FIXTURE_KEY, template.id)

    // Null means "use the built-in layout", not "send nothing".
    assert.isNull(await service.renderedTemplate(FIXTURE_KEY))
  })

  test('an email template is never served publicly', async ({ client }) => {
    const template = await Template.create({
      id: newUlid(),
      name: 'Default email',
      type: 'EMAIL',
      content: { content: [], root: {} },
      renderedHtml: '<p>secret copy</p>',
      // `isDefault` short-circuits the public reachability check for other
      // types; an EMAIL template must not ride that path.
      isDefault: true,
    })

    const res = await client.get(`/api/public/templates/${template.id}`)
    res.assertStatus(404)
  })

  test('a template wired to an email cannot be deleted out from under it', async ({ assert }) => {
    const template = await Template.create({
      id: newUlid(),
      name: 'In use',
      type: 'EMAIL',
      content: {},
      renderedHtml: '<p>hi</p>',
      isDefault: false,
    })
    await service.setTemplate(FIXTURE_KEY, template.id)

    const templates = new TemplatesService()
    const usage = await templates.usages(template.id)
    assert.isAbove(usage.total, 0)
    await assert.rejects(() => templates.remove(template.id))
  })

  test('the admin API lists events and toggles one', async ({ client, assert }) => {
    const admin = await adminUser()

    const listed = await client.get('/api/admin/settings/mail/events').loginAs(admin)
    listed.assertStatus(200)
    assert.isAbove(listed.body().length, 0)

    const toggled = await client
      .put(`/api/admin/settings/mail/events/${FIXTURE_KEY}`)
      .loginAs(admin)
      .json({ enabled: false })
    toggled.assertStatus(200)
    assert.isFalse(await service.isEnabled(FIXTURE_KEY))

    const refused = await client
      .put('/api/admin/settings/mail/events/auth.password_reset')
      .loginAs(admin)
      .json({ enabled: false })
    refused.assertStatus(422)
  })
})
