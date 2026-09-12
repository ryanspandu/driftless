import { Head, Link } from '@inertiajs/react'
import type { FC } from 'react'
import { buttonVariants } from '~/components/ui/button'
import { cn } from '~/lib/utils'
import type { ContentTagRef, ContentVisibility } from '~/types/api'
import { PostVisibilityIcon } from '~/pages/posts/category'
import { useAuthPublicConfig } from '~/hooks/api/use-auth'
import { PostSearchForm } from '~/components/post-search-form'

interface TagPost {
  id: string
  title: string
  slug: string
  visibility: ContentVisibility
  featuredImage: string | null
  updatedAt: string | null
}

interface TagShowProps {
  tag: ContentTagRef
  posts: TagPost[]
  /** The `?q=` search term this listing was filtered by, if any. */
  query?: string
}

const TagShow: FC<TagShowProps> = ({ tag, posts, query = '' }) => {
  const { data: authConfig } = useAuthPublicConfig()
  const siteTitle = authConfig?.web?.siteTitle?.trim() || 'Driftless'
  const pageTitle = `#${tag.name} · ${siteTitle}`

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={`Posts tagged ${tag.name}`} />
      </Head>
      <div className="cms-shell mx-auto max-w-3xl flex-1 px-8 pb-8 pt-24">
        <Link href="/" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'mb-6')}>
          ← Back
        </Link>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tag</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">#{tag.name}</h1>
        <PostSearchForm query={query} placeholder={`Search #${tag.name}…`} />

        {posts.length === 0 ? (
          <p className="mt-8 text-sm text-muted-foreground">
            {query
              ? `No posts matching “${query}” tagged #${tag.name}.`
              : 'No posts with this tag yet.'}
          </p>
        ) : (
          <ul className="mt-8 space-y-4">
            {posts.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/posts/${p.slug}`}
                  className="flex items-center gap-4 rounded-xl border border-border p-3 transition-colors hover:border-foreground/40"
                >
                  {p.featuredImage ? (
                    <img
                      src={p.featuredImage}
                      alt={p.title}
                      className="size-16 shrink-0 rounded-lg object-cover"
                    />
                  ) : null}
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate font-medium">
                      <PostVisibilityIcon visibility={p.visibility} />
                      {p.title}
                    </p>
                    {p.updatedAt ? (
                      <p className="text-xs text-muted-foreground">
                        {new Date(p.updatedAt).toLocaleDateString()}
                      </p>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}

export default TagShow
