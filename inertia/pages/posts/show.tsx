import { Head, Link } from '@inertiajs/react'
import type { FC } from 'react'
import { buttonVariants } from '~/components/ui/button'
import { cn } from '~/lib/utils'
import type { PublicContentDto } from '~/types/api'
import { useAuthPublicConfig } from '~/hooks/api/use-auth'

interface PostShowProps {
  post: PublicContentDto
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

/** "release_date" → "Release date" for a custom-field label. */
function humanizeKey(key: string): string {
  const spaced = key.replace(/[_-]+/g, ' ').trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/** Render a resolved custom-field value (relation labels arrive as string[]). */
function renderFieldValue(value: unknown): string {
  if (value == null) return ''
  if (Array.isArray(value)) return value.map((v) => String(v)).join(', ')
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

/** URL-ish string a custom MEDIA field resolves to. */
function isImageUrl(value: unknown): value is string {
  return typeof value === 'string' && /^(https?:)?\/\/|^\//.test(value) && /\.(png|jpe?g|gif|webp|svg|avif)(\?|$)/i.test(value)
}

const PostShow: FC<PostShowProps> = ({ post }) => {
  const { data: authConfig } = useAuthPublicConfig()
  const siteTitle = authConfig?.web?.siteTitle?.trim() || 'Driftless'
  const description =
    authConfig?.web?.siteDescription?.trim() ||
    stripHtml(post.body).slice(0, 160) ||
    post.title
  const pageTitle = `${post.title} · ${siteTitle}`
  // Custom fields (Content-type collection), with relation ids already resolved
  // to labels and media ids to URLs server-side. Skip empties.
  const customFields = Object.entries(post.data ?? {}).filter(
    ([, v]) => v != null && (Array.isArray(v) ? v.length > 0 : String(v).trim() !== '')
  )

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={description} />
        <meta property="og:title" content={post.title} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="article" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={post.title} />
        <meta name="twitter:description" content={description} />
      </Head>
      <article className="cms-shell mx-auto max-w-3xl flex-1 px-8 pb-8 pt-24">
        <Link href="/" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'mb-6')}>
          ← Back
        </Link>
        {post.featuredImage ? (
          <img
            src={post.featuredImage}
            alt={post.title}
            className="mb-8 aspect-[16/9] w-full rounded-xl object-cover"
          />
        ) : null}
        <h1 className="text-3xl font-semibold tracking-tight">{post.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Updated {new Date(post.updatedAt).toLocaleString()}
        </p>
        {customFields.length > 0 ? (
          <dl className="mt-6 grid gap-3 border-y border-border py-4 sm:grid-cols-2">
            {customFields.map(([key, value]) => (
              <div key={key} className="space-y-1">
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {humanizeKey(key)}
                </dt>
                <dd className="text-sm text-foreground">
                  {isImageUrl(value) ? (
                    <img
                      src={value}
                      alt={humanizeKey(key)}
                      className="max-h-40 rounded-md object-cover"
                    />
                  ) : (
                    renderFieldValue(value)
                  )}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
        <div
          className="prose prose-neutral dark:prose-invert mt-8 max-w-none"
          dangerouslySetInnerHTML={{ __html: post.body }}
        />
      </article>
    </>
  )
}

export default PostShow
