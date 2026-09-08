import type { CodePageProps } from '~/custom/types'
import { useCollectionRecords } from '~/hooks/cms/use-collection-records'
import { PageShell } from '../components/page_shell'

/**
 * A file-page that READS a CMS collection at runtime with `useCollectionRecords`
 * — the first-class way for kit-owned markup to list records itself (as opposed
 * to a collection *template*, which renders one record inside a builder list).
 *
 * It fetches on the client, so the first paint shows the loading state and the
 * grid fills in after hydration. For SEO-critical, server-rendered lists, use the
 * builder's Collection List block instead.
 */
export const path = 'kit-example/collection-demo'
export const title = 'Reading a collection'

/** A JSONB field value narrowed to a non-empty string, or undefined. */
function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

export default function CollectionDemo({ header, footer }: CodePageProps) {
  // Any collection key works — `posts` is built-in, so every install has it.
  const { data, isLoading, isError } = useCollectionRecords('posts', { limit: 6 })
  const records = data?.items ?? []

  return (
    <PageShell
      header={header}
      footer={footer}
      eyebrow="Reading collection data"
      title="Latest posts, fetched by the kit"
      intro="This grid is drawn by kit code calling useCollectionRecords('posts') — no page builder involved. It hydrates on the client, so it's blank for a beat on first load."
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : isError ? (
        <p className="text-sm text-muted-foreground">Could not load posts.</p>
      ) : records.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No published posts yet — create one under Content.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {records.map((record) => {
            const postTitle = str(record.data.title) ?? 'Untitled'
            const excerpt = str(record.data.excerpt)
            const url = str(record.data.url)
            const card = (
              <article className="flex h-full flex-col rounded-xl border border-border bg-card p-5 text-card-foreground transition-colors hover:border-foreground/30">
                <h3 className="text-base font-semibold leading-snug tracking-tight">{postTitle}</h3>
                {excerpt ? (
                  <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
                    {excerpt}
                  </p>
                ) : null}
              </article>
            )
            return url ? (
              <a key={record.id} href={url} className="block h-full no-underline">
                {card}
              </a>
            ) : (
              <div key={record.id}>{card}</div>
            )
          })}
        </div>
      )}
    </PageShell>
  )
}
