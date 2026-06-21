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

const PostShow: FC<PostShowProps> = ({ post }) => {
  const { data: authConfig } = useAuthPublicConfig()
  const siteTitle = authConfig?.web?.siteTitle?.trim() || 'Driftless'
  const description =
    authConfig?.web?.siteDescription?.trim() ||
    stripHtml(post.body).slice(0, 160) ||
    post.title
  const pageTitle = `${post.title} · ${siteTitle}`

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
        <h1 className="text-3xl font-semibold tracking-tight">{post.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Updated {new Date(post.updatedAt).toLocaleString()}
        </p>
        <div
          className="prose prose-neutral dark:prose-invert mt-8 max-w-none"
          dangerouslySetInnerHTML={{ __html: post.body }}
        />
      </article>
    </>
  )
}

export default PostShow
