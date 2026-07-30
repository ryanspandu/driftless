import { useMemo } from 'react'
import { Link, router } from '@inertiajs/react'
import type { ColumnDef } from '@tanstack/react-table'
import {
  Download,
  FolderTree,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown_menu'
import { PageHeader } from '~/components/admin/page-header'
import { DataTable, DataTableColumnHeader } from '~/components/data-table'
import { useConfirmDelete } from '~/components/providers/delete-confirm-provider'
import { useUrlState } from '~/hooks/use-url-state'
import { cn } from '~/lib/utils'
import { useDeleteProduct, useProducts, type ProductDto, type ProductStatus } from '../_api'

const STATUS_FILTERS: { value: ProductStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
  { value: 'archived', label: 'Archived' },
]

/** The values `?status=` accepts; anything else falls back to `all`. */
const STATUS_VALUES = STATUS_FILTERS.map((f) => f.value)

const DEFAULT_PAGE_SIZE = 20

/** The sizes the footer offers; `?pageSize=` outside this set falls back. */
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

function StatusBadge({ status }: { status: ProductStatus }) {
  if (status === 'active') return <Badge variant="success">Active</Badge>
  if (status === 'draft') return <Badge variant="secondary">Draft</Badge>
  return <Badge variant="outline">Archived</Badge>
}

/** Sellable units across tracked variants; null means nothing is tracked. */
function StockCell({ product }: { product: ProductDto }) {
  if (product.totalStock === null) {
    return <span className="text-xs text-muted-foreground">Not tracked</span>
  }
  const low = product.totalStock <= 5
  return (
    <span className={cn('text-sm tabular-nums', low && 'font-medium text-amber-600')}>
      {product.totalStock}
      {low ? <span className="ml-1 text-xs">low</span> : null}
    </span>
  )
}

export default function ProductsPage() {
  // The URL is the only source of truth for what this page is showing, so a
  // filtered view can be linked, reloaded and reached with the back button.
  // Nothing is mirrored into `useState`: a copy would only be a second answer
  // to the same question, briefly showing the wrong one on load.
  const url = useUrlState()
  const status = url.one('status', STATUS_VALUES, 'all')
  const search = url.get('q')
  const page = url.int('page', 1)
  // Clamped to the offered sizes: `?pageSize=100000` is a hand-edited URL, and
  // the API paginates with whatever it is given.
  const requestedPageSize = url.int('pageSize', DEFAULT_PAGE_SIZE)
  const pageSize = PAGE_SIZE_OPTIONS.includes(requestedPageSize)
    ? requestedPageSize
    : DEFAULT_PAGE_SIZE

  const query = useProducts({ page, pageSize, search, status })
  const deleteProduct = useDeleteProduct()
  const confirmDelete = useConfirmDelete()

  const products = query.data?.items ?? []
  const total = query.data?.total ?? 0

  const columns = useMemo<ColumnDef<ProductDto>[]>(
    () => [
      {
        accessorKey: 'title',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Product" />,
        cell: ({ row }) => {
          const product = row.original
          const image = product.images[0]?.mediaUrl ?? product.variants[0]?.imageUrl
          return (
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                {image ? (
                  <img src={image} alt="" className="size-full object-cover" />
                ) : (
                  <Package className="size-4 text-muted-foreground" aria-hidden />
                )}
              </span>
              <div className="flex min-w-0 flex-col leading-tight">
                <Link
                  href={`/admin/ecommerce/products/${product.id}`}
                  className="truncate font-medium hover:underline"
                >
                  {product.title}
                </Link>
                <span className="truncate text-xs text-muted-foreground">
                  {product.variants.length} {product.variants.length === 1 ? 'variant' : 'variants'}{' '}
                  · /{product.slug}
                </span>
              </div>
            </div>
          )
        },
      },
      {
        accessorKey: 'status',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'type',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
        cell: ({ row }) => (
          <span className="text-sm capitalize text-muted-foreground">{row.original.type}</span>
        ),
      },
      {
        id: 'price',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Price"
            className="ml-auto w-full justify-end"
          />
        ),
        cell: ({ row }) => (
          <div className="text-right text-sm tabular-nums">
            {row.original.priceFrom ? (
              row.original.priceFrom.formatted
            ) : (
              <span className="text-xs text-muted-foreground">No variants</span>
            )}
          </div>
        ),
      },
      {
        id: 'stock',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title="Stock"
            className="ml-auto w-full justify-end"
          />
        ),
        cell: ({ row }) => (
          <div className="text-right">
            <StockCell product={row.original} />
          </div>
        ),
      },
      {
        id: 'actions',
        enableSorting: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const product = row.original
          return (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="icon" className="size-8" />}
              >
                <MoreHorizontal className="size-4" aria-hidden />
                <span className="sr-only">Actions for {product.title}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => router.visit(`/admin/ecommerce/products/${product.id}`)}
                >
                  <Pencil className="mr-2 size-4" aria-hidden />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={async () => {
                    const confirmed = await confirmDelete({
                      title: `Delete ${product.title}?`,
                      description:
                        'The product is archived and hidden from the storefront. Existing orders keep their record of what was sold.',
                    })
                    if (confirmed) deleteProduct.mutate(product.id)
                  }}
                >
                  <Trash2 className="mr-2 size-4" aria-hidden />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ],
    [confirmDelete, deleteProduct]
  )

  const statusFilter = (
    <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-1">
      {STATUS_FILTERS.map((f) => {
        const active = status === f.value
        return (
          <button
            key={f.value}
            type="button"
            aria-pressed={active}
            onClick={() =>
              // Back to page 1: page 5 of the old filter is usually past the
              // end of the new one, which reads as an empty table.
              url.set({ status: f.value === 'all' ? undefined : f.value, page: undefined })
            }
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-colors',
              active
                ? 'bg-background font-medium text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {f.label}
          </button>
        )
      })}
    </div>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        subtitle="Everything you sell, with variants, pricing and stock."
        count={total}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="gap-2"
              // A plain link, not fetch: the browser handles Content-Disposition
              // better than we would. This is the one export with cost price in
              // it, so it sits behind `products:read` like the page itself.
              render={<a href="/api/admin/ecommerce/exports/products" />}
            >
              <Download className="size-4" aria-hidden />
              Export CSV
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              render={<Link href="/admin/ecommerce/products/categories" />}
            >
              <FolderTree className="size-4" aria-hidden />
              Categories
            </Button>
            <Button className="gap-2" render={<Link href="/admin/ecommerce/products/new" />}>
              <Plus className="size-4" aria-hidden />
              New product
            </Button>
          </div>
        }
      />

      <DataTable
        columns={columns}
        data={products}
        getRowId={(row) => row.id}
        // Products do not take part in offline sync, so the injected Sync
        // column would be permanently empty.
        hideSyncColumn
        enableBulkSelect={false}
        searchPlaceholder="Search products…"
        searchValue={search}
        onSearchChange={(value) => url.set({ q: value, page: undefined })}
        filters={statusFilter}
        serverPagination={{
          pageIndex: page - 1,
          pageSize,
          totalRows: total,
          pageCount: Math.max(Math.ceil(total / pageSize), 1),
          pageSizeOptions: PAGE_SIZE_OPTIONS,
          disabled: query.isFetching,
          onPageIndexChange: (index) => url.set({ page: index === 0 ? undefined : index + 1 }),
          onPageSizeChange: (size) =>
            url.set({
              pageSize: size === DEFAULT_PAGE_SIZE ? undefined : size,
              page: undefined,
            }),
        }}
        emptyMessage={
          <div className="flex flex-col items-center gap-2 py-8">
            <span className="flex size-10 items-center justify-center rounded-full bg-muted">
              <Package className="size-5 text-muted-foreground" aria-hidden />
            </span>
            <p className="text-sm font-medium">No products yet</p>
            <p className="text-xs text-muted-foreground">
              Create your first product to start selling.
            </p>
          </div>
        }
      />
    </div>
  )
}
