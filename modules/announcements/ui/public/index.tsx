import { Head } from '@inertiajs/react'
import { Megaphone } from 'lucide-react'

interface AnnouncementDto {
  id: string
  title: string
  body: string
  published: boolean
  createdAt: string
  updatedAt: string
}

export default function AnnouncementsPublicPage({
  announcements = [],
}: {
  announcements?: AnnouncementDto[]
}) {
  return (
    <>
      <Head title="Announcements" />
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="mb-8 flex items-center gap-3">
          <Megaphone className="size-6 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">Announcements</h1>
        </div>

        {announcements.length === 0 ? (
          <p className="text-muted-foreground">No announcements yet. Check back soon.</p>
        ) : (
          <ul className="space-y-6">
            {announcements.map((a) => (
              <li key={a.id} className="rounded-xl border bg-card p-5 shadow-sm">
                <h2 className="text-lg font-semibold">{a.title}</h2>
                <time className="text-xs text-muted-foreground">
                  {new Date(a.createdAt).toLocaleDateString()}
                </time>
                {a.body ? (
                  <p className="mt-2 whitespace-pre-line text-sm text-foreground/80">{a.body}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
