import { Head, Link } from '@inertiajs/react'
import type { FC } from 'react'
import { Lock, Users } from 'lucide-react'
import { buttonVariants } from '~/components/ui/button'
import { cn } from '~/lib/utils'
import type { ContentCategoryRef, ContentVisibility } from '~/types/api'
import { useAuthPublicConfig } from '~/hooks/api/use-auth'
import { PostSearchForm } from '~/components/post-search-form'

interface CategoryPost {
  id: string
  title: string
  slug: string
  visibility: ContentVisibility
  featuredImage: string | null
  updatedAt: string | null
}

/** A small lock/member marker for a gated post in a listing. */
export function PostVisibilityIcon({ visibility }: { visibility: ContentVisibility }) {
  if (visibility === 'PROTECTED') {
    return (
      <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-label="Password protected" />
    )
  }
  if (visibility === 'MEMBER') {
    return <Users className="size-3.5 shrink-0 text-muted-foreground" aria-label="Members only" />
  }
  return null
}

interface CategoryShowProps {
  category: ContentCategoryRef
  posts: CategoryPost[]
  /** The `?q=` search term this listing was filtered by, if any. */
  query?: string
  /** Absolute canonical URL for this listing, computed server-side from the request. */
  canonicalUrl: string
}

const CategoryShow: FC<CategoryShowProps> = ({ category, posts, query = '', canonicalUrl }) => {
  const { data: authConfig } = useAuthPublicConfig()
  const siteTitle = authConfig?.web?.siteTitle?.trim() || 'Driftless'
  const pageTitle = `${category.name} · ${siteTitle}`

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={`Posts in ${category.name}`} />
        <link rel="canonical" href={canonicalUrl} />
      </Head>
      <div className="cms-shell mx-auto max-w-3xl flex-1 px-8 pb-8 pt-24">
        <Link href="/" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'mb-6')}>
          ← Back
        </Link>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Category
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{category.name}</h1>
        <PostSearchForm query={query} placeholder={`Search in ${category.name}…`} />

        {posts.length === 0 ? (
          <p className="mt-8 text-sm text-muted-foreground">
            {query
              ? `No posts matching “${query}” in ${category.name}.`
              : 'No posts in this category yet.'}
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

export default CategoryShow
