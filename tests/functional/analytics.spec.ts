import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import { newUlid } from '#services/ulid_service'
import User from '#models/user'
import AnalyticsEvent from '#models/analytics_event'
import AnalyticsService from '#services/analytics_service'

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

async function resetDatabase() {
  const cleanup = await testUtils.db().truncate()
  await testUtils.db().seed()
  return cleanup
}
const admin = () => User.query().where('email', 'admin@driftless.local').firstOrFail()

/** Seed a pageview directly with a controlled time/visitor/session. */
function seedEvent(input: Partial<AnalyticsEvent> & { createdAt: DateTime }) {
  return AnalyticsEvent.create({
    id: newUlid(),
    visitorId: input.visitorId ?? newUlid(),
    sessionId: input.sessionId ?? newUlid(),
    path: input.path ?? '/',
    title: input.title ?? null,
    referrer: input.referrer ?? null,
    referrerHost: input.referrerHost ?? null,
    source: input.source ?? 'direct',
    deviceType: input.deviceType ?? 'desktop',
    browser: input.browser ?? 'Chrome',
    os: input.os ?? 'macOS',
    ipHash: null,
    createdAt: input.createdAt,
  })
}

test.group('Analytics | collect beacon', (group) => {
  // Drain any buffered events from a prior test, then reset — so the in-memory
  // write buffer never leaks pageviews across tests.
  group.each.setup(async () => {
    await new AnalyticsService().flush()
    return resetDatabase()
  })

  test('records a pageview with parsed device + source', async ({ client, assert }) => {
    const res = await client
      .post('/api/analytics/collect')
      .header('user-agent', IPHONE_UA)
      .json({ path: '/products/widget?secret=1', referrer: 'https://www.google.com/search?q=x' })
    res.assertStatus(204)
    await new AnalyticsService().flush()

    const row = await AnalyticsEvent.query().firstOrFail()
    assert.equal(row.path, '/products/widget') // query string stripped
    assert.equal(row.deviceType, 'mobile')
    assert.equal(row.os, 'iOS')
    assert.equal(row.source, 'search')
    assert.equal(row.referrerHost, 'www.google.com')
  })

  test('classifies a social referrer and a direct visit', async ({ client, assert }) => {
    await client
      .post('/api/analytics/collect')
      .header('user-agent', CHROME_UA)
      .json({ path: '/a', referrer: 'https://facebook.com/' })
    await client.post('/api/analytics/collect').header('user-agent', CHROME_UA).json({ path: '/b' })
    await new AnalyticsService().flush()
    const rows = await AnalyticsEvent.query().orderBy('path')
    assert.equal(rows[0]!.source, 'social')
    assert.equal(rows[1]!.source, 'direct')
  })

  test('drops obvious bots', async ({ client, assert }) => {
    const res = await client
      .post('/api/analytics/collect')
      .header('user-agent', 'Googlebot/2.1 (+http://www.google.com/bot.html)')
      .json({ path: '/x' })
    res.assertStatus(204)
    await new AnalyticsService().flush()
    assert.equal(
      await AnalyticsEvent.query()
        .count('* as t')
        .firstOrFail()
        .then((r) => Number(r.$extras.t)),
      0
    )
  })
})

test.group('Analytics | report', (group) => {
  group.each.setup(async () => resetDatabase())

  test('summary, sessions and bounce rate are computed from the ledger', async ({ assert }) => {
    const day = DateTime.now().set({ hour: 12 })
    const v1 = newUlid()
    const v2 = newUlid()
    const s1 = newUlid()
    const s2 = newUlid()
    // Session 1: two pageviews (not a bounce), visitor v1.
    await seedEvent({ visitorId: v1, sessionId: s1, path: '/', createdAt: day })
    await seedEvent({
      visitorId: v1,
      sessionId: s1,
      path: '/about',
      createdAt: day.plus({ minutes: 2 }),
    })
    // Session 2: single pageview (a bounce), visitor v2, mobile + social.
    await seedEvent({
      visitorId: v2,
      sessionId: s2,
      path: '/',
      createdAt: day,
      deviceType: 'mobile',
      source: 'social',
    })

    const report = await new AnalyticsService().report({
      from: DateTime.now().minus({ days: 1 }).toISODate()!,
      to: DateTime.now().toISODate()!,
      granularity: 'day',
    })

    assert.equal(report.summary.pageviews, 3)
    assert.equal(report.summary.visitors, 2)
    assert.equal(report.summary.sessions, 2)
    assert.equal(report.summary.bounceRate, 0.5) // 1 of 2 sessions bounced

    // Top pages: "/" has 2 views (2 visitors), "/about" has 1.
    const home = report.topPages.find((p) => p.path === '/')!
    assert.equal(home.pageviews, 2)
    assert.equal(home.visitors, 2)

    // Devices + sources breakdowns.
    assert.equal(report.devices.find((d) => d.label === 'mobile')?.count, 1)
    assert.equal(report.sources.find((s) => s.label === 'social')?.count, 1)

    // Daily timeseries has a bucket for today with the 3 pageviews.
    const todayKey = DateTime.now().toFormat('yyyy-MM-dd')
    assert.equal(report.timeseries.find((p) => p.date === todayKey)?.pageviews, 3)
  })

  test('the report endpoint requires analytics:read', async ({ client }) => {
    const anon = await client.get('/api/admin/analytics/report')
    anon.assertStatus(401)

    const res = await client
      .get('/api/admin/analytics/report?granularity=day')
      .loginAs(await admin())
    res.assertStatus(200)
    res.assertBodyContains({ granularity: 'day' })
  })
})
