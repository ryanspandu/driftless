import { useMemo, useState, type FormEvent } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { FolderTree, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
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
import { AppSelect } from '~/components/ui/app-select'
import { PageHeader } from '~/components/admin/page-header'
import { DataTable, DataTableColumnHeader } from '~/components/data-table'
import { useConfirmDelete } from '~/components/providers/delete-confirm-provider'
import { Can } from '~/components/providers/ability-provider'
import { apiErrorMessage } from '~/lib/api-client'
import { useCategories, useDeleteCategory, useSaveCategory, type CategoryDto } from '../_api'

function emptyForm() {
  return { id: null as string | null, name: '', slug: '', description: '', parentId: '' }
}

type FormState = ReturnType<typeof emptyForm>

function toForm(category: CategoryDto): FormState {
  return {
    id: category.id,
    name: category.name,
    slug: category.slug,
    description: category.description ?? '',
    parentId: category.parentId ?? '',
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

export default function CategoriesPage() {
  const query = useCategories()
  const save = useSaveCategory()
  const remove = useDeleteCategory()
  const confirmDelete = useConfirmDelete()

  const [search, setSearch] = useState('')
  const [form, setForm] = useState<FormState | null>(null)
  const [error, setError] = useState<string | null>(null)

  const categories = query.data ?? []

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  const nameById = useMemo(
    () => new Map(categories.map((category) => [category.id, category.name])),
    [categories]
  )

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return categories
    return categories.filter(
      (category) =>
        category.name.toLowerCase().includes(needle) ||
        category.slug.toLowerCase().includes(needle)
    )
  }, [categories, search])

  /**
   * Parent options exclude the category being edited.
   *
   * Letting something be its own parent produces a cycle the tree walk would
   * never come back from.
   */
  const parentOptions = useMemo(
    () => [
      { value: '', label: 'No parent (top level)' },
      ...categories
        .filter((category) => category.id !== form?.id)
        .map((category) => ({ value: category.id, label: category.name })),
    ],
    [categories, form?.id]
  )

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
          parentId: form.parentId || null,
        },
      })
      setForm(null)
    } catch (err) {
      setError(apiErrorMessage(err))
    }
  }

  const columns = useMemo<ColumnDef<CategoryDto>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Category" />,
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate font-medium">{row.original.name}</span>
            <span className="truncate text-xs text-muted-foreground">/{row.original.slug}</span>
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
          const category = row.original
          return (
            <Can permission="ecommerce:products:manage">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button variant="ghost" size="icon" className="size-8" />}
                >
                  <MoreHorizontal className="size-4" aria-hidden />
                  <span className="sr-only">Actions for {category.name}</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      setError(null)
                      setForm(toForm(category))
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
                        title: `Delete ${category.name}?`,
                        description:
                          category.productCount > 0
                            ? `${category.productCount} product${category.productCount === 1 ? '' : 's'} will lose this category. The products themselves are untouched.`
                            : 'The products themselves are untouched.',
                      })
                      if (confirmed) remove.mutate(category.id)
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
    [confirmDelete, nameById, remove]
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categories"
        subtitle="How the storefront groups what you sell."
        count={categories.length}
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
              New category
            </Button>
          </Can>
        }
      />

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
            <span className="flex size-10 items-center justify-center rounded-full bg-muted">
              <FolderTree className="size-5 text-muted-foreground" aria-hidden />
            </span>
            <p className="text-sm font-medium">No categories yet</p>
            <p className="text-xs text-muted-foreground">
              Products work fine without them — add one when you want to group them.
            </p>
          </div>
        }
      />

      <Dialog open={form !== null} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form?.id ? 'Edit category' : 'New category'}</DialogTitle>
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
                  placeholder={slugify(form.name) || 'category-slug'}
                />
                <p className="text-xs text-muted-foreground">
                  Appears in storefront URLs. Changing it on a live shop breaks existing links.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="parent">Parent</Label>
                <AppSelect
                  id="parent"
                  value={form.parentId}
                  onChange={(value) => set('parentId', value)}
                  options={parentOptions}
                />
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
                  {save.isPending ? 'Saving…' : 'Save category'}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
