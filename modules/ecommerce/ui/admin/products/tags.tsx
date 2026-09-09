import { useMemo, useState, type FormEvent } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { MoreHorizontal, Pencil, Plus, Tag as TagIcon, Trash2 } from 'lucide-react'
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown_menu'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Textarea } from '~/components/ui/textarea'
import { PageHeader } from '~/components/admin/page-header'
import { BackButton } from '~/components/admin/back-button'
import { DataTable, DataTableColumnHeader } from '~/components/data-table'
import { useConfirmDelete } from '~/components/providers/delete-confirm-provider'
import { Can } from '~/components/providers/ability-provider'
import { apiErrorMessage } from '~/lib/api-client'
import { useDeleteTag, useSaveTag, useTags, type TagDto } from '../_api'

function emptyForm() {
  return { id: null as string | null, name: '', slug: '', description: '' }
}

type FormState = ReturnType<typeof emptyForm>

function toForm(tag: TagDto): FormState {
  return {
    id: tag.id,
    name: tag.name,
    slug: tag.slug,
    description: tag.description ?? '',
  }
}

/** `a-b-c` from `A B & C`. Only used to prefill; the server has the final say. */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default function TagsPage() {
  const query = useTags()
  const save = useSaveTag()
  const remove = useDeleteTag()
  const confirmDelete = useConfirmDelete()

  const [form, setForm] = useState<FormState | null>(null)
  const [error, setError] = useState<string | null>(null)

  const tags = query.data ?? []

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form) return
    setError(null)

    try {
      await save.mutateAsync({
        id: form.id,
        input: {
          name: form.name.trim(),
          slug: form.slug.trim() || slugify(form.name),
          description: form.description.trim() || null,
        },
      })
      setForm(null)
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  const columns = useMemo<ColumnDef<TagDto>[]>(
    () => [
      {
        id: 'name',
        // Name + slug so the table's built-in search matches either.
        accessorFn: (r) => `${r.name} ${r.slug}`,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Tag" />,
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate font-medium">{row.original.name}</span>
            {/* A real link to the storefront archive, so the path the operator
                sees actually opens. */}
            <a
              href={`/shop/tag/${row.original.slug}`}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="truncate text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              /shop/tag/{row.original.slug}
            </a>
          </div>
        ),
      },
      {
        accessorKey: 'productCount',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Products"
            className="ml-auto w-full justify-end"
          />
        ),
        cell: ({ row }) => (
          <div className="text-right text-sm tabular-nums">{row.original.productCount}</div>
        ),
      },
      {
        id: 'actions',
        enableSorting: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const tag = row.original
          return (
            <Can permission="ecommerce:products:manage">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button variant="ghost" size="icon" className="size-8" />}
                >
                  <MoreHorizontal className="size-4" aria-hidden />
                  <span className="sr-only">Actions for {tag.name}</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      setError(null)
                      setForm(toForm(tag))
                    }}
                  >
                    <Pencil className="mr-2 size-4" aria-hidden />
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={async () => {
                      const confirmed = await confirmDelete({
                        title: `Delete ${tag.name}?`,
                        description:
                          tag.productCount > 0
                            ? `${tag.productCount} product${tag.productCount === 1 ? '' : 's'} will lose this tag. The products themselves are untouched.`
                            : 'The products themselves are untouched.',
                      })
                      if (confirmed) remove.mutate(tag.id)
                    }}
                  >
                    <Trash2 className="mr-2 size-4" aria-hidden />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </Can>
          )
        },
      },
    ],
    [confirmDelete, remove]
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BackButton href="/admin/ecommerce/products" label="Back to products" />
        <PageHeader
          className="flex-1"
          title="Tags"
          subtitle="A flat way to label products across categories."
          count={tags.length}
          actions={
            <Can permission="ecommerce:products:manage">
              <Button
                className="gap-2"
                onClick={() => {
                  setError(null)
                  setForm(emptyForm())
                }}
              >
                <Plus className="size-4" aria-hidden />
                New tag
              </Button>
            </Can>
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
            <span className="flex size-10 items-center justify-center rounded-full bg-muted">
              <TagIcon className="size-5 text-muted-foreground" aria-hidden />
            </span>
            <p className="text-sm font-medium">No tags yet</p>
            <p className="text-xs text-muted-foreground">
              Add one when you want to label products across categories.
            </p>
          </div>
        }
      />

      <Dialog open={form !== null} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form?.id ? 'Edit tag' : 'New tag'}</DialogTitle>
          </DialogHeader>

          {form ? (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => {
                    const name = e.target.value
                    // Keep the slug in step until someone edits it themselves.
                    setForm((prev) =>
                      prev
                        ? {
                            ...prev,
                            name,
                            slug:
                              prev.slug === slugify(prev.name) || prev.slug === ''
                                ? slugify(name)
                                : prev.slug,
                          }
                        : prev
                    )
                  }}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="slug">Slug</Label>
                <Input
                  id="slug"
                  value={form.slug}
                  onChange={(e) => set('slug', e.target.value)}
                  className="font-mono"
                  placeholder={slugify(form.name) || 'tag-slug'}
                />
                <p className="text-xs text-muted-foreground">
                  Appears in storefront URLs. Changing it on a live shop breaks existing links.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  rows={2}
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                />
              </div>

              {error ? <p className="text-sm text-destructive">{error}</p> : null}

              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setForm(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={save.isPending}>
                  {save.isPending ? 'Saving…' : 'Save tag'}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
