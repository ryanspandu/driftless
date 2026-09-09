import { useMemo, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import type { ColumnDef } from '@tanstack/react-table'
import { FolderTree, Loader2, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import type { ContentCategoryDto } from '~/types/api'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Textarea } from '~/components/ui/textarea'
import { AppSelect } from '~/components/ui/app-select'
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
  useContentCategories,
  useCreateContentCategory,
  useDeleteContentCategory,
  useUpdateContentCategory,
} from '~/hooks/api/use-content-categories'
import { useConfirmDelete } from '~/components/providers/delete-confirm-provider'
import { apiErrorMessage } from '~/lib/api'

type Editing = ContentCategoryDto | 'new' | null

function CategoryDialog({
  editing,
  categories,
  onClose,
}: {
  editing: Editing
  categories: ContentCategoryDto[]
  onClose: () => void
}) {
  const createMut = useCreateContentCategory()
  const updateMut = useUpdateContentCategory()
  const isEdit = editing && editing !== 'new'
  const [name, setName] = useState(isEdit ? editing.name : '')
  const [slug, setSlug] = useState(isEdit ? editing.slug : '')
  const [slugDirty, setSlugDirty] = useState(Boolean(isEdit))
  const [description, setDescription] = useState(isEdit ? (editing.description ?? '') : '')
  const [parentId, setParentId] = useState(isEdit ? (editing.parentId ?? '') : '')
  const [error, setError] = useState<string | null>(null)
  const saving = createMut.isPending || updateMut.isPending

  const parentOptions = useMemo(
    () => [
      { value: '', label: 'No parent (top level)' },
      ...categories
        .filter((c) => !isEdit || c.id !== editing.id)
        .map((c) => ({ value: c.id, label: c.name })),
    ],
    [categories, editing, isEdit]
  )

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const body = {
        name: name.trim(),
        slug: slug.trim() || undefined,
        description: description.trim() || null,
        parentId: parentId || null,
      }
      if (isEdit) await updateMut.mutateAsync({ id: editing.id, ...body })
      else await createMut.mutateAsync(body)
      toast.success(isEdit ? 'Category updated' : 'Category created')
      onClose()
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to save'))
    }
  }

  return (
    <Dialog open={editing !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit category' : 'New category'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cat-name">Name</Label>
            <Input
              id="cat-name"
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
              placeholder="e.g. Tutorials"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-slug">Slug</Label>
            <Input
              id="cat-slug"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value)
                setSlugDirty(true)
              }}
              placeholder="tutorials"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">Used in the archive URL /category/…</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-parent">Parent</Label>
            <AppSelect
              id="cat-parent"
              value={parentId}
              onChange={setParentId}
              options={parentOptions}
              isSearchable={categories.length > 8}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-desc">Description</Label>
            <Textarea
              id="cat-desc"
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

export default function ContentCategoriesPage() {
  const query = useContentCategories()
  const categories = useMemo(() => query.data ?? [], [query.data])
  const deleteMut = useDeleteContentCategory()
  const confirmDelete = useConfirmDelete()
  const [editing, setEditing] = useState<Editing>(null)
  const [search, setSearch] = useState('')

  const nameById = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories])

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return categories
    return categories.filter(
      (c) => c.name.toLowerCase().includes(needle) || c.slug.toLowerCase().includes(needle)
    )
  }, [categories, search])

  const onDelete = (c: ContentCategoryDto) => {
    void confirmDelete({
      title: `Delete ${c.name}?`,
      description:
        c.postCount > 0
          ? `${c.postCount} post${c.postCount === 1 ? '' : 's'} will lose this category. The posts themselves are untouched.`
          : 'The posts themselves are untouched.',
    }).then((ok) => {
      if (ok)
        deleteMut.mutate(c.id, {
          onError: (e) => toast.error(apiErrorMessage(e, 'Failed to delete')),
        })
    })
  }

  const columns = useMemo<ColumnDef<ContentCategoryDto>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Category" />,
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
        accessorKey: 'parentId',
        enableSorting: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Parent" />,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.parentId ? (nameById.get(row.original.parentId) ?? '—') : '—'}
          </span>
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
    [nameById]
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BackButton href="/admin/content" label="Back to content" />
        <PageHeader
          title="Categories"
          subtitle="Organize posts into categories with archive pages."
          count={query.isLoading ? undefined : categories.length}
          className="flex-1"
          actions={
            <Button className="gap-2" onClick={() => setEditing('new')}>
              <Plus className="size-4" />
              New category
            </Button>
          }
        />
      </div>

      <DataTable
        columns={columns}
        data={visible}
        getRowId={(row) => row.id}
        hideSyncColumn
        enableBulkSelect={false}
        searchPlaceholder="Search categories…"
        searchValue={search}
        onSearchChange={setSearch}
        emptyMessage={
          <div className="flex flex-col items-center gap-2 py-8">
            <FolderTree className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No categories yet. Create your first one.
            </p>
          </div>
        }
      />

      {editing !== null ? (
        <CategoryDialog
          key={editing === 'new' ? 'new' : editing.id}
          editing={editing}
          categories={categories}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  )
}
