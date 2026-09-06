import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGzip, createGunzip } from 'node:zlib'
import { pack as tarPack, extract as tarExtract } from 'tar-stream'

/**
 * Gzipped-tar read/write for the `.driftless` archive. `tar-stream` streams but
 * does NOT protect against path traversal — `readArchive` sanitizes every entry
 * name and drops anything outside the allowed layout (`manifest.json`,
 * `sections/*.json`, `media/*`).
 */

export interface ArchiveFile {
  name: string
  content: Buffer
}

/** Only these entry shapes are allowed out of an archive. */
function safeEntryName(raw: string): string | null {
  // Normalize separators, strip a leading `./`.
  const name = raw.replace(/\\/g, '/').replace(/^\.\//, '')
  if (
    name.startsWith('/') || // absolute
    name.includes('..') || // traversal
    name.includes('\0') // null byte
  ) {
    return null
  }
  if (name === 'manifest.json') return name
  if (/^sections\/[A-Za-z0-9_.-]+\.json$/.test(name)) return name
  if (/^media\/[A-Za-z0-9_.-]+$/.test(name)) return name
  return null
}

export async function packArchive(files: ArchiveFile[]): Promise<Buffer> {
  const packer = tarPack()
  const gzip = createGzip()
  packer.pipe(gzip)

  const chunks: Buffer[] = []
  const collected = new Promise<void>((resolve, reject) => {
    gzip.on('data', (c: Buffer) => chunks.push(c))
    gzip.on('end', resolve)
    gzip.on('error', reject)
    packer.on('error', reject)
  })

  for (const f of files) {
    await new Promise<void>((resolve, reject) => {
      packer.entry({ name: f.name, size: f.content.length }, f.content, (err) =>
        err ? reject(err) : resolve()
      )
    })
  }
  packer.finalize()
  await collected
  return Buffer.concat(chunks)
}

/** Read a `.driftless` archive into a map of safe entry name → bytes. */
export async function readArchive(buf: Buffer): Promise<Map<string, Buffer>> {
  const out = new Map<string, Buffer>()
  const extractor = tarExtract()

  extractor.on('entry', (headers, stream, next) => {
    const name = safeEntryName(headers.name)
    if (!name) {
      stream.resume() // discard a disallowed entry
      stream.on('end', () => next())
      stream.on('error', (e) => next(e))
      return
    }
    const parts: Buffer[] = []
    stream.on('data', (d: Buffer) => parts.push(d))
    stream.on('end', () => {
      out.set(name, Buffer.concat(parts))
      next()
    })
    stream.on('error', (e) => next(e))
  })

  await pipeline(Readable.from(buf), createGunzip(), extractor)
  return out
}
