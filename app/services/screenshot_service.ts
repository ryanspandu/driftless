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

/** Close the shared browser (tests / graceful shutdown). */
export async function closeBrowser(): Promise<void> {
  const pending = browserPromise
  browserPromise = null
  if (!pending) return
  const browser = await pending.catch(() => null)
  if (browser) await browser.close()
}
