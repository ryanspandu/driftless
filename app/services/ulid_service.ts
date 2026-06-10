import { monotonicFactory } from 'ulid'

const ulid = monotonicFactory()

export function newUlid(): string {
  return ulid()
}
