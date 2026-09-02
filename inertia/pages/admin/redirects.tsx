import { useState } from 'react'
import { Trash, ArrowRight } from '@phosphor-icons/react'
import { Card, CardContent } from '~/components/ui/card'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Badge } from '~/components/ui/badge'
import { apiErrorMessage } from '~/lib/api'
import {
  useCreateRedirect,
  useDeleteRedirect,
  useRedirects,
  type Redirect,
} from '~/hooks/api/use-redirects'

export default function RedirectsPage() {
  const { data, isPending, isError } = useRedirects()
  const create = useCreateRedirect()
  const del = useDeleteRedirect()

  const [fromPath, setFromPath] = useState('')
  const [toPath, setToPath] = useState('')
  const [status, setStatus] = useState(301)
  const [error, setError] = useState<string | null>(null)

  const items = data?.items ?? []

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await create.mutateAsync({ fromPath, toPath, status })
      setFromPath('')
      setToPath('')
      setStatus(301)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create redirect.'))
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Redirects</h1>
        <p className="text-sm text-muted-foreground">
          Send an old URL to a new one. When you change a published page’s path, a 301 is added here
          automatically.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={onAdd} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex-1 space-y-1">
              <span className="text-xs text-muted-foreground">From (old path)</span>
              <Input
                value={fromPath}
                onChange={(e) => setFromPath(e.target.value)}
                placeholder="old-page"
                required
              />
            </label>
            <label className="flex-1 space-y-1">
              <span className="text-xs text-muted-foreground">To (destination)</span>
              <Input
                value={toPath}
                onChange={(e) => setToPath(e.target.value)}
                placeholder="/new-page or https://…"
                required
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Type</span>
              <select
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                value={status}
                onChange={(e) => setStatus(Number(e.target.value))}
              >
                <option value={301}>301 (permanent)</option>
                <option value={302}>302 (temporary)</option>
              </select>
            </label>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Adding…' : 'Add'}
            </Button>
          </form>
          {error ? (
            <p className="mt-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : isError ? (
        <p className="text-sm text-destructive">Couldn’t load redirects.</p>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No redirects yet.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((r: Redirect) => (
            <Card key={r.id}>
              <CardContent className="flex items-center justify-between gap-4 py-3">
                <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                  <code className="truncate rounded bg-muted px-1.5 py-0.5">/{r.fromPath}</code>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                  <code className="truncate rounded bg-muted px-1.5 py-0.5">{r.toPath}</code>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Badge variant={r.status === 301 ? 'secondary' : 'outline'}>{r.status}</Badge>
                  <span className="text-xs text-muted-foreground">{r.hits} hits</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => del.mutate(r.id)}
                    aria-label="Delete redirect"
                  >
                    <Trash className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
