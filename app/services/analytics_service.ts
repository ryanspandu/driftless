import crypto from 'node:crypto'
import { DateTime } from 'luxon'
import { UAParser } from 'ua-parser-js'
import db from '@adonisjs/lucid/services/db'
import app from '@adonisjs/core/services/app'
import type { HttpContext } from '@adonisjs/core/http'
import env from '#start/env'
import { newUlid } from '#services/ulid_service'
import AnalyticsEvent from '#models/analytics_event'

/** Persistent first-party visitor id (no cross-site tracking). */
export const VISITOR_COOKIE = 'dl_vid'
/** Per-visit session id, refreshed on every pageview (30-minute sliding window). */
export const SESSION_COOKIE = 'dl_vses'

const VISITOR_DAYS = 400
const SESSION_MINUTES = 30

const SEARCH_HOSTS = /(^|\.)(google|bing|yahoo|duckduckgo|baidu|yandex|ecosia|ask|aol)\./i
const SOCIAL_HOSTS =
  /(^|\.)(facebook|fb|instagram|twitter|x|t|linkedin|youtube|tiktok|pinterest|reddit|whatsapp|telegram|t\.me|threads)\.(com|co|me|net|org)/i
const BOT_UA =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|headless|monitor|pingdom|lighthouse|preview/i

function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null
  return crypto.createHmac('sha256', env.get('APP_KEY').release()).update(ip).digest('hex')
}

/** Pathname only, no query/hash, capped — so nothing sensitive in a query string is kept. */
function normalisePath(input: string): string {
  let path = (input || '/').trim()
  const q = path.search(/[?#]/)
  if (q >= 0) path = path.slice(0, q)
  if (!path.startsWith('/')) path = '/' + path
  return path.slice(0, 512)
}

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).host.toLowerCase().slice(0, 255)
  } catch {
    return null
  }
}

/** Classify where a visit came from, comparing the referrer host to our own. */
function classifySource(
  referrer: string | null,
  ownHost: string
): { source: AnalyticsEvent['source']; referrerHost: string | null } {
  const host = hostOf(referrer)
  if (!host) return { source: 'direct', referrerHost: null }
  if (host === ownHost.toLowerCase()) return { source: 'internal', referrerHost: host }
  if (SEARCH_HOSTS.test(host)) return { source: 'search', referrerHost: host }
  if (SOCIAL_HOSTS.test(host)) return { source: 'social', referrerHost: host }
  return { source: 'referral', referrerHost: host }
}

function parseUa(ua: string): {
  isBot: boolean
  deviceType: AnalyticsEvent['deviceType']
  browser: string | null
  os: string | null
} {
  if (!ua || BOT_UA.test(ua)) return { isBot: true, deviceType: 'desktop', browser: null, os: null }
  const r = new UAParser(ua).getResult()
  const t = r.device.type
  const deviceType = t === 'mobile' ? 'mobile' : t === 'tablet' ? 'tablet' : 'desktop'
  return {
    isBot: false,
    deviceType,
    browser: r.browser.name?.slice(0, 64) ?? null,
    os: r.os.name?.slice(0, 64) ?? null,
  }
}

export interface AnalyticsSummary {
  pageviews: number
  visitors: number
  sessions: number
  /** 0–1: share of sessions with a single pageview. */
  bounceRate: number
  /** Mean session length in seconds. */
  avgSessionSeconds: number
}

export interface TimeseriesPoint {
  date: string
  pageviews: number
  visitors: number
}

export interface Breakdown {
  label: string
  count: number
}

export interface TopPage {
  path: string
  pageviews: number
  visitors: number
}

export interface AnalyticsReport {
  from: string
  to: string
  granularity: 'day' | 'week' | 'month'
  summary: AnalyticsSummary
  timeseries: TimeseriesPoint[]
  topPages: TopPage[]
  sources: Breakdown[]
  devices: Breakdown[]
  browsers: Breakdown[]
  os: Breakdown[]
}

function isPg(): boolean {
  return db.connection().dialect.name === 'postgres'
}

/** SQL expression that buckets `created_at` to the requested granularity. */
function bucketExpr(granularity: 'day' | 'week' | 'month'): string {
  if (isPg()) {
    if (granularity === 'week') return `to_char(date_trunc('week', created_at), 'YYYY-MM-DD')`
    if (granularity === 'month') return `to_char(date_trunc('month', created_at), 'YYYY-MM-DD')`
    return `to_char(created_at, 'YYYY-MM-DD')`
  }
  if (granularity === 'week') return `strftime('%Y-W%W', created_at)`
  if (granularity === 'month') return `strftime('%Y-%m-01', created_at)`
  return `strftime('%Y-%m-%d', created_at)`
}

function toNumber(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : (value as number)
  return Number.isFinite(n) ? n : 0
}

// ── Write buffering ───────────────────────────────────────────────────────────
//
// A pageview is a cheap insert, but under real traffic there are a lot of them.
// Rather than one INSERT per request, events are buffered in memory and written
// in bulk on a short interval (or when the buffer fills). That turns thousands
// of tiny writes a minute into a handful of multi-row inserts, and keeps the DB
// connection pool free for requests that actually block a user.
//
// The trade-off is explicit: a hard crash loses at most a few seconds of
// buffered pageviews. For analytics that is fine — it is not money or an order.
// The buffer is per-process, so multiple workers/instances need no coordination.

type BufferedEvent = Record<string, unknown>

const FLUSH_INTERVAL_MS = 5_000
const MAX_BUFFER = 2_000
const INSERT_CHUNK = 1_000

const BUFFER: BufferedEvent[] = []
let flushTimer: ReturnType<typeof setInterval> | null = null

/** Write everything buffered so far, in chunked bulk inserts. Never throws. */
export async function flushAnalytics(): Promise<number> {
  if (BUFFER.length === 0) return 0
  const rows = BUFFER.splice(0, BUFFER.length)
  let written = 0
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK)
    try {
      await db.table('analytics_events').multiInsert(chunk)
      written += chunk.length
    } catch {
      // Analytics must never take the app down. A failed chunk is dropped.
    }
  }
  return written
}

/** Start the periodic flush loop (idempotent). The timer is unref'd so it never
 *  keeps the process alive on its own — shutdown does a final explicit flush. */
export function startAnalyticsFlushing(): void {
  if (flushTimer) return
  flushTimer = setInterval(() => void flushAnalytics(), FLUSH_INTERVAL_MS)
  if (typeof flushTimer.unref === 'function') flushTimer.unref()
}

export function stopAnalyticsFlushing(): void {
  if (flushTimer) {
    clearInterval(flushTimer)
    flushTimer = null
  }
}

export default class AnalyticsService {
  // ── Collection ─────────────────────────────────────────────────────────────

  /**
   * Record a pageview. Sets/rotates the visitor + session cookies, drops bots,
   * and never stores a raw IP. Safe to call from a public, unauthenticated
   * endpoint — it writes exactly one small row.
   */
  async record(
    ctx: HttpContext,
    input: { path: string; referrer?: string | null; title?: string | null }
  ) {
    const ua = ctx.request.header('user-agent') ?? ''
    const parsed = parseUa(ua)
    if (parsed.isBot) return

    const cookieOpts = {
      httpOnly: true,
      secure: app.inProduction,
      sameSite: 'lax' as const,
      path: '/',
    }

    let visitorId = ctx.request.cookie(VISITOR_COOKIE) as string | undefined
    if (!visitorId || typeof visitorId !== 'string') visitorId = newUlid()
    ctx.response.cookie(VISITOR_COOKIE, visitorId, {
      ...cookieOpts,
      maxAge: VISITOR_DAYS * 24 * 60 * 60,
    })

    let sessionId = ctx.request.cookie(SESSION_COOKIE) as string | undefined
    if (!sessionId || typeof sessionId !== 'string') sessionId = newUlid()
    // Refresh the session cookie every pageview → a 30-min sliding window.
    ctx.response.cookie(SESSION_COOKIE, sessionId, { ...cookieOpts, maxAge: SESSION_MINUTES * 60 })

    const referrer = input.referrer?.slice(0, 512) || null
    const { source, referrerHost } = classifySource(referrer, ctx.request.host() ?? '')

    // Buffered, not written inline — the event time is stamped now, at the
    // pageview, not at flush time. Columns are snake_case for the raw bulk insert.
    BUFFER.push({
      id: newUlid(),
      visitor_id: visitorId.slice(0, 40),
      session_id: sessionId.slice(0, 40),
      path: normalisePath(input.path),
      title: input.title?.slice(0, 300) || null,
      referrer,
      referrer_host: referrerHost,
      source,
      device_type: parsed.deviceType,
      browser: parsed.browser,
      os: parsed.os,
      ip_hash: hashIp(ctx.request.ip()),
      created_at: DateTime.now().toSQL(),
    })

    // Belt-and-suspenders: guarantee the loop runs even if the provider didn't
    // start it, and flush eagerly if a traffic spike fills the buffer.
    startAnalyticsFlushing()
    if (BUFFER.length >= MAX_BUFFER) void flushAnalytics()
  }

  /** Force-write buffered events now (used on shutdown and in tests). */
  async flush(): Promise<number> {
    return flushAnalytics()
  }

  /** Delete events older than `olderThanDays` (retention prune). */
  async prune(olderThanDays = 400): Promise<number> {
    const cutoff = DateTime.now().minus({ days: olderThanDays })
    const deleted = await db
      .from('analytics_events')
      .where('created_at', '<', cutoff.toSQL()!)
      .delete()
    return Number(deleted ?? 0)
  }

  // ── Reporting ──────────────────────────────────────────────────────────────

  async report(params: {
    from: string
    to: string
    granularity: 'day' | 'week' | 'month'
  }): Promise<AnalyticsReport> {
    const from = DateTime.fromISO(params.from).startOf('day')
    const to = DateTime.fromISO(params.to).endOf('day')
    const fromSql = from.toSQL()!
    const toSql = to.toSQL()!
    const scoped = () =>
      db
        .from('analytics_events')
        .where('created_at', '>=', fromSql)
        .where('created_at', '<=', toSql)

    const [summary, timeseries, topPages, sources, devices, browsers, os] = await Promise.all([
      this.summary(fromSql, toSql),
      this.timeseries(fromSql, toSql, params.granularity, from, to),
      scoped()
        .select('path')
        .count('* as pv')
        .countDistinct('visitor_id as uv')
        .groupBy('path')
        .orderBy('pv', 'desc')
        .limit(15),
      scoped().select('source').count('* as c').groupBy('source').orderBy('c', 'desc'),
      scoped().select('device_type').count('* as c').groupBy('device_type').orderBy('c', 'desc'),
      scoped()
        .select('browser')
        .count('* as c')
        .whereNotNull('browser')
        .groupBy('browser')
        .orderBy('c', 'desc')
        .limit(8),
      scoped()
        .select('os')
        .count('* as c')
        .whereNotNull('os')
        .groupBy('os')
        .orderBy('c', 'desc')
        .limit(8),
    ])

    return {
      from: params.from,
      to: params.to,
      granularity: params.granularity,
      summary,
      timeseries,
      topPages: (topPages as Array<Record<string, unknown>>).map((r) => ({
        path: String(r.path),
        pageviews: toNumber(r.pv),
        visitors: toNumber(r.uv),
      })),
      sources: (sources as Array<Record<string, unknown>>).map((r) => ({
        label: String(r.source),
        count: toNumber(r.c),
      })),
      devices: (devices as Array<Record<string, unknown>>).map((r) => ({
        label: String(r.device_type),
        count: toNumber(r.c),
      })),
      browsers: (browsers as Array<Record<string, unknown>>).map((r) => ({
        label: String(r.browser),
        count: toNumber(r.c),
      })),
      os: (os as Array<Record<string, unknown>>).map((r) => ({
        label: String(r.os),
        count: toNumber(r.c),
      })),
    }
  }

  private async summary(fromSql: string, toSql: string): Promise<AnalyticsSummary> {
    const totals = await db
      .from('analytics_events')
      .where('created_at', '>=', fromSql)
      .where('created_at', '<=', toSql)
      .count('* as pv')
      .countDistinct('visitor_id as uv')
      .countDistinct('session_id as ses')
      .first()

    // Per-session pageview counts + span, for bounce rate and average duration.
    const durExpr = isPg()
      ? `extract(epoch from (max(created_at) - min(created_at)))`
      : `(strftime('%s', max(created_at)) - strftime('%s', min(created_at)))`
    const perSession = await db
      .from('analytics_events')
      .where('created_at', '>=', fromSql)
      .where('created_at', '<=', toSql)
      .select('session_id')
      .count('* as views')
      .select(db.raw(`${durExpr} as dur`))
      .groupBy('session_id')

    const sessions = perSession.length
    let single = 0
    let durSum = 0
    for (const row of perSession as Array<Record<string, unknown>>) {
      if (toNumber(row.views) <= 1) single++
      durSum += toNumber(row.dur)
    }

    return {
      pageviews: toNumber(totals?.pv),
      visitors: toNumber(totals?.uv),
      sessions: toNumber(totals?.ses),
      bounceRate: sessions ? single / sessions : 0,
      avgSessionSeconds: sessions ? Math.round(durSum / sessions) : 0,
    }
  }

  private async timeseries(
    fromSql: string,
    toSql: string,
    granularity: 'day' | 'week' | 'month',
    from: DateTime,
    to: DateTime
  ): Promise<TimeseriesPoint[]> {
    const expr = bucketExpr(granularity)
    const rows = await db
      .from('analytics_events')
      .where('created_at', '>=', fromSql)
      .where('created_at', '<=', toSql)
      .select(db.raw(`${expr} as bucket`))
      .count('* as pv')
      .countDistinct('visitor_id as uv')
      .groupByRaw(expr)

    const map = new Map<string, { pv: number; uv: number }>()
    for (const r of rows as Array<Record<string, unknown>>) {
      map.set(String(r.bucket), { pv: toNumber(r.pv), uv: toNumber(r.uv) })
    }

    // Back-fill every bucket in the range so the chart has no gaps. Labels match
    // the Postgres bucket format (YYYY-MM-DD); production always runs Postgres.
    const step =
      granularity === 'week' ? { weeks: 1 } : granularity === 'month' ? { months: 1 } : { days: 1 }
    const startOf = granularity === 'week' ? 'week' : granularity === 'month' ? 'month' : 'day'
    const out: TimeseriesPoint[] = []
    let cursor = from.startOf(startOf as 'day' | 'week' | 'month')
    const end = to.endOf('day')
    let guard = 0
    while (cursor <= end && guard++ < 1000) {
      const key = cursor.toFormat('yyyy-MM-dd')
      const hit = map.get(key)
      out.push({ date: key, pageviews: hit?.pv ?? 0, visitors: hit?.uv ?? 0 })
      cursor = cursor.plus(step)
    }
    return out
  }
}
