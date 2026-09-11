import { useMemo, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import type { ColumnDef } from '@tanstack/react-table'
import { Loader2, MoreHorizontal, Pencil, Plus, Tags, Trash2 } from 'lucide-react'
import type { ContentTagDto } from '~/types/api'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Textarea } from '~/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown_menu'
import { PageHeader } from '~/components/admin/page-header'
import { BackButton } from '~/components/admin/back-button'
import { DataTable, DataTableColumnHeader } from '~/components/data-table'
import {
  useContentTags,
  useCreateContentTag,
  useDeleteContentTag,
  useUpdateContentTag,
} from '~/hooks/api/use-content-tags'
import { useConfirmDelete } from '~/components/providers/delete-confirm-provider'
import { apiErrorMessage } from '~/lib/api'

type Editing = ContentTagDto | 'new' | null

function TagDialog({ editing, onClose }: { editing: Editing; onClose: () => void }) {
  const createMut = useCreateContentTag()
  const updateMut = useUpdateContentTag()
  const isEdit = editing && editing !== 'new'
  const [name, setName] = useState(isEdit ? editing.name : '')
  const [slug, setSlug] = useState(isEdit ? editing.slug : '')
  const [slugDirty, setSlugDirty] = useState(Boolean(isEdit))
  const [description, setDescription] = useState(isEdit ? (editing.description ?? '') : '')
  const [error, setError] = useState<string | null>(null)
  const saving = createMut.isPending || updateMut.isPending

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const body = {
        name: name.trim(),
        slug: slug.trim() || undefined,
        description: description.trim() || null,
      }
      if (isEdit) await updateMut.mutateAsync({ id: editing.id, ...body })
      else await createMut.mutateAsync(body)
      toast.success(isEdit ? 'Tag updated' : 'Tag created')
      onClose()
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to save'))
    }
  }

  return (
    <Dialog open={editing !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit tag' : 'New tag'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tag-name">Name</Label>
            <Input
              id="tag-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (!slugDirty)
                  setSlug(
                    e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, '-')
                      .replace(/^-+|-+$/g, '')
                  )
              }}
              placeholder="e.g. Featured"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tag-slug">Slug</Label>
            <Input
              id="tag-slug"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value)
                setSlugDirty(true)
              }}
              placeholder="featured"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">Used in the archive URL /tag/…</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tag-desc">Description</Label>
            <Textarea
              id="tag-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
              rows={3}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !name.trim()} className="gap-1.5">
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {isEdit ? 'Save' : 'Create'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function ContentTagsPage() {
  const query = useContentTags()
  const tags = useMemo(() => query.data ?? [], [query.data])
  const deleteMut = useDeleteContentTag()
  const confirmDelete = useConfirmDelete()
  const [editing, setEditing] = useState<Editing>(null)

  const onDelete = (t: ContentTagDto) => {
    void confirmDelete({
      title: `Delete ${t.name}?`,
      description:
        t.postCount > 0
          ? `${t.postCount} post${t.postCount === 1 ? '' : 's'} will lose this tag. The posts themselves are untouched.`
          : 'The posts themselves are untouched.',
    }).then((ok) => {
      if (ok)
        deleteMut.mutate(t.id, {
          onError: (e) => toast.error(apiErrorMessage(e, 'Failed to delete')),
        })
    })
  }

  const columns = useMemo<ColumnDef<ContentTagDto>[]>(
    () => [
      {
        id: 'name',
        // Name + slug so the table's built-in search matches either.
        accessorFn: (r) => `${r.name} ${r.slug}`,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Tag" />,
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate font-medium">{row.original.name}</span>
            <span className="truncate font-mono text-xs text-muted-foreground">
              /{row.original.slug}
            </span>
          </div>
        ),
      },
      {
        accessorKey: 'postCount',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Posts"
            className="ml-auto w-full justify-end"
          />
        ),
        cell: ({ row }) => (
          <div className="text-right text-sm tabular-nums">{row.original.postCount}</div>
        ),
      },
      {
        id: 'actions',
        enableSorting: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-8" />}>
              <MoreHorizontal className="size-4" aria-hidden />
              <span className="sr-only">Actions for {row.original.name}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditing(row.original)}>
                <Pencil className="mr-2 size-4" aria-hidden />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => onDelete(row.original)}>
                <Trash2 className="mr-2 size-4" aria-hidden />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BackButton href="/admin/content" label="Back to content" />
        <PageHeader
          title="Tags"
          subtitle="Flat tags for posts, with archive pages."
          count={query.isLoading ? undefined : tags.length}
          className="flex-1"
          actions={
            <Button className="gap-2" onClick={() => setEditing('new')}>
              <Plus className="size-4" />
              New tag
            </Button>
          }
        />
      </div>

      <DataTable
        columns={columns}
        data={tags}
        getRowId={(row) => row.id}
        hideSyncColumn
        enableBulkSelect={false}
        searchPlaceholder="Search tags…"
        urlSync={{}}
        emptyMessage={
          <div className="flex flex-col items-center gap-2 py-8">
            <Tags className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No tags yet. Create your first one.</p>
          </div>
        }
      />

      {editing !== null ? (
        <TagDialog
          key={editing === 'new' ? 'new' : editing.id}
          editing={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  )
}
