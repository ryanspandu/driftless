import { Head, Link, useForm } from '@inertiajs/react'
import type { FC } from 'react'
import { Lock, Users } from 'lucide-react'
import { Button, buttonVariants } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { cn } from '~/lib/utils'
import type { PublicContentDto } from '~/types/api'
import { useAuthPublicConfig } from '~/hooks/api/use-auth'

interface PostShowProps {
  post: PublicContentDto
  /** Set when access is gated: the body is withheld and this drives the prompt. */
  locked?: { type: 'password' | 'member' } | null
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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
  return (
    typeof value === 'string' &&
    /^(https?:)?\/\/|^\//.test(value) &&
    /\.(png|jpe?g|gif|webp|svg|avif)(\?|$)/i.test(value)
  )
}

/** Password-entry card for a Protected post (submits to /posts/:slug/unlock). */
const PasswordGate: FC<{ slug: string }> = ({ slug }) => {
  const form = useForm({ password: '' })
  return (
    <div className="mt-8 rounded-xl border border-border bg-muted/30 p-6">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Lock className="size-4" aria-hidden /> This post is password protected
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Enter the password to read it.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          form.post(`/posts/${slug}/unlock`, { preserveScroll: true })
        }}
        className="mt-4 flex flex-col gap-2 sm:flex-row"
      >
        <Input
          type="password"
          value={form.data.password}
          onChange={(e) => form.setData('password', e.target.value)}
          placeholder="Password"
          autoComplete="off"
          aria-invalid={Boolean(form.errors.password)}
          className="sm:max-w-xs"
        />
        <Button type="submit" disabled={form.processing}>
          {form.processing ? 'Checking…' : 'Unlock'}
        </Button>
      </form>
      {form.errors.password ? (
        <p className="mt-2 text-sm text-destructive">{form.errors.password}</p>
      ) : null}
    </div>
  )
}

/** Members-only notice for a post the visitor isn't signed in to read. */
const MemberGate: FC = () => (
  <div className="mt-8 rounded-xl border border-border bg-muted/30 p-6">
    <div className="flex items-center gap-2 text-sm font-medium">
      <Users className="size-4" aria-hidden /> Members only
    </div>
    <p className="mt-1 text-sm text-muted-foreground">
      Sign in to read this post.
    </p>
    <Link href="/login" className={cn(buttonVariants({ size: 'sm' }), 'mt-4')}>
      Sign in
    </Link>
  </div>
)

const PostShow: FC<PostShowProps> = ({ post, locked }) => {
  const { data: authConfig } = useAuthPublicConfig()
  const siteTitle = authConfig?.web?.siteTitle?.trim() || 'Driftless'
  const description =
    authConfig?.web?.siteDescription?.trim() || stripHtml(post.body).slice(0, 160) || post.title
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
        <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
          {post.visibility === 'PROTECTED' ? (
            <Lock className="size-6 shrink-0 text-muted-foreground" aria-label="Password protected" />
          ) : post.visibility === 'MEMBER' ? (
            <Users className="size-6 shrink-0 text-muted-foreground" aria-label="Members only" />
          ) : null}
          {post.title}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Updated {new Date(post.updatedAt).toLocaleString()}
        </p>
        {post.categories.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {post.categories.map((c) => (
              <Link
                key={c.id}
                href={`/category/${c.slug}`}
                className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
              >
                {c.name}
              </Link>
            ))}
          </div>
        ) : null}
        {post.tags.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {post.tags.map((t) => (
              <Link
                key={t.id}
                href={`/tag/${t.slug}`}
                className="text-xs text-ring underline-offset-2 hover:underline"
              >
                #{t.name}
              </Link>
            ))}
          </div>
        ) : null}
        {!locked && customFields.length > 0 ? (
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
        {locked?.type === 'password' ? (
          <PasswordGate slug={post.slug} />
        ) : locked?.type === 'member' ? (
          <MemberGate />
        ) : (
          <div
            className="prose prose-neutral dark:prose-invert mt-8 max-w-none"
            dangerouslySetInnerHTML={{ __html: post.body }}
          />
        )}
      </article>
    </>
  )
}

export default PostShow
