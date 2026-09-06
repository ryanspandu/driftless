/**
 * Minimal ambient types for `tar-stream` (ships no types of its own).
 * Covers only the pack/extract surface the data-transfer bundle uses.
 */
declare module 'tar-stream' {
  import type { Readable, Writable } from 'node:stream'

  interface Headers {
    name: string
    size?: number
    type?: string
    mode?: number
    mtime?: Date
  }

  interface Pack extends Readable {
    entry(
      headers: Headers,
      buffer?: Buffer | string,
      callback?: (err?: Error | null) => void
    ): Writable
    finalize(): void
  }

  interface Extract extends Writable {
    on(
      event: 'entry',
      listener: (headers: Headers, stream: Readable, next: (err?: Error | null) => void) => void
    ): this
    on(event: 'finish', listener: () => void): this
    on(event: 'error', listener: (err: Error) => void): this
    on(event: string, listener: (...args: any[]) => void): this
  }

  export function pack(): Pack
  export function extract(): Extract
}
