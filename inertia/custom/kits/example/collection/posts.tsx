import type { CustomCollectionRecord } from '~/custom/registry'

/**
 * A code collection template: one CMS record rendered as code.
 *
 * The filename is the collection key — this file (`collection/posts.tsx`) binds
 * to the built-in **Posts** collection. Drop a Collection List on a page, bind
 * it to that collection, set *Item design* to **Code template**, and pick this
 * one; the list renders every record through this component.
 *
 * The component is handed the whole record. `record.data` holds the collection's
 * fields (for Posts: `title`, `excerpt`, `body`, `slug`, `url`, `author`,
 * `publishedAt`); `record.id`, `record.status`, `record.createdAt` and
 * `record.updatedAt` sit alongside it. Read only what you need — an unknown
 * field is just `undefined`.
 *
 * Adding or renaming a kit collection template needs a front-end rebuild, because
 * the lookup is a build-time glob (same rule as the rest of a kit).
 */

/** Narrow an unknown JSONB value to a trimmed string, or undefined. */
function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

/** A short, human date from an ISO string — or nothing if it isn't one. */
function formatDate(iso: unknown): string | undefined {
  const raw = str(iso)
  if (!raw) return undefined
  const date = new Date(raw)
  return Number.isNaN(date.getTime())
    ? undefined
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function PostCard({ record }: { record: CustomCollectionRecord }) {
  const { data } = record
  const title = str(data.title) ?? 'Untitled'
  const excerpt = str(data.excerpt)
  const author = str(data.author)
  const published = formatDate(data.publishedAt)
  const url = str(data.url)

  const card = (
    <article className="flex h-full flex-col rounded-xl border border-border bg-card p-5 text-card-foreground transition-colors hover:border-foreground/30">
      <h3 className="text-lg font-semibold leading-snug tracking-tight">{title}</h3>
      {excerpt ? (
        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{excerpt}</p>
      ) : null}
      {author || published ? (
        <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          {author ? <span className="font-medium text-foreground">{author}</span> : null}
          {author && published ? <span aria-hidden>·</span> : null}
          {published ? <time>{published}</time> : null}
        </p>
      ) : null}
    </article>
  )

  return url ? (
    <a href={url} className="block h-full no-underline">
      {card}
    </a>
  ) : (
    card
  )
}
