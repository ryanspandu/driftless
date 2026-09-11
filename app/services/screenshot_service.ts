/// <reference lib="dom" />
/**
 * Rasterise a rendered page to a PNG with a real headless browser.
 *
 * The MCP page builder authors BLIND: `render_page` only returns script-stripped
 * HTML, so the model never sees pixels and CSR pages come back empty. This service
 * drives Chromium over the existing no-login `/preview/<token>` URL and returns the
 * actual rendered image, which the `screenshot_page` MCP tool hands back as an
 * image content block. A real browser also executes client JS, so CSR blocks
 * render here too.
 *
 * Playwright is already in the tree (a transitive of `@japa/browser-client`) and
 * is promoted to an explicit dependency for this. In production the Chromium
 * BINARY is installed onto the volume at PLAYWRIGHT_BROWSERS_PATH by the release
 * step; the shared libraries it links against are apt-installed in the image
 * (see deploy/Dockerfile). Locally, Playwright's own browser cache is used.
 */
import { chromium, type Browser } from 'playwright'
import sharp from 'sharp'

const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 },
} as const

export type ViewportName = keyof typeof VIEWPORTS

/** Coerce arbitrary input to a known viewport, defaulting to desktop. */
export function normalizeViewport(input: unknown): ViewportName {
  return typeof input === 'string' && input in VIEWPORTS ? (input as ViewportName) : 'desktop'
}

export interface ScreenshotResult {
  base64: string
  mimeType: 'image/png'
  viewport: ViewportName
  width: number
  height: number
}

// One shared browser for the whole process — launching Chromium per request is
// far too slow. Reset the promise if launch fails or the browser disconnects so
// the next call can retry instead of being stuck on a dead handle.
let browserPromise: Promise<Browser> | null = null

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
      .catch((e) => {
        browserPromise = null
        throw e
      })
  }
  const browser = await browserPromise
  if (!browser.isConnected()) {
    browserPromise = null
    return getBrowser()
  }
  return browser
}

/** Screenshot a URL at a viewport and return a width-capped PNG as base64. */
export async function screenshotUrl(
  url: string,
  viewportInput: unknown = 'desktop',
  opts: { maxWidth?: number; timeoutMs?: number } = {}
): Promise<ScreenshotResult> {
  const viewport = normalizeViewport(viewportInput)
  const maxWidth = opts.maxWidth ?? 1000
  const timeout = opts.timeoutMs ?? 30_000

  const browser = await getBrowser()
  const context = await browser.newContext({ viewport: VIEWPORTS[viewport], deviceScaleFactor: 1 })
  try {
    const page = await context.newPage()
    // `networkidle` waits for lazy images/fonts to settle; fall back to whatever
    // has painted if the page never goes fully idle rather than failing outright.
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout })
    } catch {
      await page.goto(url, { waitUntil: 'load', timeout })
    }
    const raw = await page.screenshot({ type: 'png', fullPage: true })

    // Downscale to keep the base64 payload (and the model's image-token cost) sane.
    let pipeline = sharp(raw)
    const meta = await pipeline.metadata()
    if (meta.width && meta.width > maxWidth) pipeline = pipeline.resize({ width: maxWidth })
    const out = await pipeline.png({ compressionLevel: 9 }).toBuffer()
    const outMeta = await sharp(out).metadata()

    return {
      base64: out.toString('base64'),
      mimeType: 'image/png',
      viewport,
      width: outMeta.width ?? VIEWPORTS[viewport].width,
      height: outMeta.height ?? VIEWPORTS[viewport].height,
    }
  } finally {
    await context.close()
  }
}

export interface ProbeBlock {
  id: string
  rect: { x: number; y: number; w: number; h: number }
  styles: {
    textAlign: string
    alignItems: string
    justifyContent: string
    position: string
    display: string
  }
  /** data-pb-id (or tag) of the element painted over this block's centre, else null. */
  occludedBy: string | null
}

export interface ProbeResult {
  viewport: ViewportName
  viewportW: number
  blocks: ProbeBlock[]
}

/**
 * Read the RENDERED geometry of every `[data-pb-id]` block: bounding box, the
 * computed layout styles a lint cares about (text-align, flex cross/main axis,
 * position/display), and an occlusion hit-test (each block is scrolled to centre
 * and `elementFromPoint` checks whether something else is painted on top — this is
 * how a CTA hidden behind an overlapping band is caught). Reuses the same headless
 * Chromium + no-login preview URL as `screenshotUrl`.
 */
export async function probeLayout(
  url: string,
  viewportInput: unknown = 'desktop',
  opts: { timeoutMs?: number } = {}
): Promise<ProbeResult> {
  const viewport = normalizeViewport(viewportInput)
  const timeout = opts.timeoutMs ?? 30_000
  const browser = await getBrowser()
  // A taller viewport so most blocks are on-screen for the hit-test with less
  // per-element scrolling; width stays the real breakpoint width.
  const context = await browser.newContext({
    viewport: { width: VIEWPORTS[viewport].width, height: 1400 },
    deviceScaleFactor: 1,
  })
  try {
    const page = await context.newPage()
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout })
    } catch {
      await page.goto(url, { waitUntil: 'load', timeout })
    }
    const blocks = (await page.evaluate(() => {
      const out: Array<Record<string, unknown>> = []
      const els = Array.from(document.querySelectorAll('[data-pb-id]'))
      for (const el of els) {
        el.scrollIntoView({ block: 'center', inline: 'nearest' })
        const r = el.getBoundingClientRect()
        const cs = getComputedStyle(el)
        const cx = r.x + r.width / 2
        const cy = r.y + r.height / 2
        let occludedBy: string | null = null
        if (
          r.width > 1 &&
          r.height > 1 &&
          cx >= 0 &&
          cx <= innerWidth &&
          cy >= 0 &&
          cy <= innerHeight
        ) {
          const top = document.elementFromPoint(cx, cy)
          if (top && top !== el && !el.contains(top)) {
            occludedBy = top.getAttribute('data-pb-id') || top.tagName.toLowerCase()
          }
        }
        out.push({
          id: el.getAttribute('data-pb-id'),
          rect: {
            x: Math.round(r.x),
            y: Math.round(r.y + window.scrollY),
            w: Math.round(r.width),
            h: Math.round(r.height),
          },
          styles: {
            textAlign: cs.textAlign,
            alignItems: cs.alignItems,
            justifyContent: cs.justifyContent,
            position: cs.position,
            display: cs.display,
          },
          occludedBy,
        })
      }
      return { viewportW: window.innerWidth, blocks: out }
    })) as unknown as { viewportW: number; blocks: ProbeBlock[] }
    return { viewport, viewportW: blocks.viewportW, blocks: blocks.blocks }
  } finally {
    await context.close()
  }
}

/** Close the shared browser (tests / graceful shutdown). */
export async function closeBrowser(): Promise<void> {
  const pending = browserPromise
  browserPromise = null
  if (!pending) return
  const browser = await pending.catch(() => null)
  if (browser) await browser.close()
}
