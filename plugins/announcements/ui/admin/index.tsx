import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Megaphone, Trash2 } from 'lucide-react'
import { apiFetch } from '~/lib/api-client'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Switch } from '~/components/ui/switch'
import { Textarea } from '~/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { DataTable, DataTableColumnHeader } from '~/components/data-table'
import { formatAdminTableDateTime } from '~/lib/utils'

interface AnnouncementDto {
  id: string
  title: string
  body: string
  published: boolean
  createdAt: string
  updatedAt: string
}

const qk = ['plugin', 'announcements', 'list'] as const

export default function AnnouncementsAdminPage() {
  const qc = useQueryClient()
  const list = useQuery({
    queryKey: qk,
    queryFn: () => apiFetch<AnnouncementDto[]>('/api/admin/announcements'),
    staleTime: 15_000,
  })
  const items = useMemo(() => list.data ?? [], [list.data])

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  const create = useMutation({
    mutationFn: () =>
      apiFetch<AnnouncementDto>('/api/admin/announcements', {
        method: 'POST',
        body: JSON.stringify({ title, body, published: true }),
      }),
    onSuccess: () => {
      setTitle('')
      setBody('')
      qc.invalidateQueries({ queryKey: qk })
    },
  })

  const toggle = useMutation({
    mutationFn: ({ id, published }: { id: string; published: boolean }) =>
      apiFetch<AnnouncementDto>(`/api/admin/announcements/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ published }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  })

  const remove = useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/admin/announcements/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  })

  const columns = useMemo<ColumnDef<AnnouncementDto, unknown>[]>(
    () => [
      {
        id: 'title',
        accessorFn: (r) => r.title,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium">{row.original.title}</span>
            <span className="line-clamp-1 text-xs text-muted-foreground">{row.original.body}</span>
          </div>
        ),
      },
      {
        id: 'published',
        accessorFn: (r) => (r.published ? 'published' : 'draft'),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Published" />,
        cell: ({ row }) => {
          const r = row.original
          const pending = toggle.isPending && toggle.variables?.id === r.id
          return (
            <div className="flex items-center gap-2">
              <Switch
                checked={r.published}
                disabled={pending}
                onCheckedChange={(published) => toggle.mutate({ id: r.id, published })}
              />
              <Badge variant={r.published ? 'default' : 'secondary'}>
                {r.published ? 'Live' : 'Hidden'}
              </Badge>
            </div>
          )
        },
      },
      {
        id: 'createdAt',
        accessorFn: (r) => r.createdAt,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Created" />,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatAdminTableDateTime(row.original.createdAt)}
          </span>
        ),
      },
      {
        id: 'actions',
        enableSorting: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-destructive"
            disabled={remove.isPending}
            onClick={() => remove.mutate(row.original.id)}
          >
            <Trash2 className="size-4" />
            Delete
          </Button>
        ),
      },
    ],
    [toggle, remove]
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg border bg-primary/5 text-muted-foreground">
          <Megaphone className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Announcements</h1>
          <p className="text-sm text-muted-foreground">
            Manage announcements shown on the public{' '}
            <a className="underline" href="/announcements" target="_blank" rel="noreferrer">
              /announcements
            </a>{' '}
            page.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New announcement</CardTitle>
          <CardDescription>Published immediately and visible to visitors.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (title.trim()) create.mutate()
            }}
          >
            <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Textarea
              placeholder="Write something…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
            />
            <div className="flex justify-end">
              <Button type="submit" disabled={!title.trim() || create.isPending}>
                {create.isPending ? 'Publishing…' : 'Publish'}
              </Button>
            </div>
            {create.error ? (
              <p className="text-sm text-destructive">{(create.error as Error).message}</p>
            ) : null}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All announcements</CardTitle>
          <CardDescription>
            {list.isLoading
              ? 'Loading…'
              : `${items.length} announcement${items.length === 1 ? '' : 's'}.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={items}
            getRowId={(r) => r.id}
            searchPlaceholder="Search announcements…"
            hideSyncColumn
            enableBulkSelect={false}
            emptyMessage={list.isLoading ? 'Loading…' : 'No announcements yet.'}
          />
        </CardContent>
      </Card>
    </div>
  )
}
