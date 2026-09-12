import { Head, Link } from '@inertiajs/react'
import type { FC } from 'react'
import { buttonVariants } from '~/components/ui/button'
import { cn } from '~/lib/utils'
import type { ContentVisibility } from '~/types/api'
import { PostVisibilityIcon } from '~/pages/posts/category'
import { useAuthPublicConfig } from '~/hooks/api/use-auth'
import { PostSearchForm } from '~/components/post-search-form'

interface BlogPost {
  id: string
  title: string
  slug: string
  visibility: ContentVisibility
  featuredImage: string | null
  updatedAt: string | null
}

interface BlogIndexProps {
  posts: BlogPost[]
  /** Total PUBLISHED posts matching the query (posts.length is capped at one page). */
  total: number
  /** The `?q=` search term this listing was filtered by, if any. */
  query?: string
}

/**
 * `/blog` — every published post, with a server-resolved `?q=` search.
 *
 * The built-in fallback for the `postsArchive` page role (see
 * PublicController#blog); an operator can replace this with a builder or
 * CODE/kit page from Pages → "Use as page → Blog index".
 */
const BlogIndex: FC<BlogIndexProps> = ({ posts, total, query = '' }) => {
  const { data: authConfig } = useAuthPublicConfig()
  const siteTitle = authConfig?.web?.siteTitle?.trim() || 'Driftless'
  const pageTitle = query ? `“${query}” · Blog · ${siteTitle}` : `Blog · ${siteTitle}`

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content="Latest posts" />
      </Head>
      <div className="cms-shell mx-auto max-w-3xl flex-1 px-8 pb-8 pt-24">
        <Link href="/" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'mb-6')}>
          ← Back
        </Link>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Blog</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          {query ? `Results for “${query}”` : 'Latest posts'}
        </h1>
        <PostSearchForm query={query} />
        {query ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {total} post{total === 1 ? '' : 's'} match{total === 1 ? 'es' : ''} “{query}”.
          </p>
        ) : null}

        {posts.length === 0 ? (
          <p className="mt-8 text-sm text-muted-foreground">
            {query ? `No posts matching “${query}”.` : 'No posts published yet.'}
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

export default BlogIndex
