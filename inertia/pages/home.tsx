import { Link } from '@inertiajs/react'
import type { FC } from 'react'
import type { PublicContentDto } from '~/types/api'

interface HomeProps {
  posts: PublicContentDto[]
}

const Home: FC<HomeProps> = ({ posts }) => {
  return (
    <div className="cms-shell flex flex-1 flex-col gap-8 p-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Driftless</h1>
          <p className="text-sm text-muted-foreground">Published posts from the CMS.</p>
        </div>
      </header>

      {posts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No published posts yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {posts.map((p) => (
            <li key={p.id}>
              <Link
                href={`/posts/${p.slug}`}
                className="text-lg font-medium underline-offset-4 hover:underline"
              >
                {p.title}
              </Link>
              <p className="text-xs text-muted-foreground">
                Updated {new Date(p.updatedAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default Home
