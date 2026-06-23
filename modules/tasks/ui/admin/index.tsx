import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { apiFetch } from '~/lib/api-client'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Textarea } from '~/components/ui/textarea'
import { AppSelect } from '~/components/ui/app-select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown_menu'
import { PageHeader } from '~/components/admin/page-header'
import { DataTable, DataTableColumnHeader } from '~/components/data-table'
import { cn } from '~/lib/utils'

type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE'
type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH'

interface TaskDto {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  dueDate: string | null
  assignedUserId: number | null
  createdAt: string
  updatedAt: string
}

const qk = ['module', 'tasks', 'list'] as const

const STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  DONE: 'Done',
}
const PRIORITY_LABEL: Record<TaskPriority, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' }

function statusBadge(s: TaskStatus) {
  const variant = s === 'DONE' ? 'success' : s === 'IN_PROGRESS' ? 'warning' : 'secondary'
  return <Badge variant={variant}>{STATUS_LABEL[s]}</Badge>
}
function priorityBadge(p: TaskPriority) {
  const variant = p === 'HIGH' ? 'destructive' : p === 'MEDIUM' ? 'secondary' : 'outline'
  return <Badge variant={variant}>{PRIORITY_LABEL[p]}</Badge>
}

type FormState = {
  id: string | null
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  dueDate: string
}
const EMPTY_FORM: FormState = {
  id: null,
  title: '',
  description: '',
  status: 'TODO',
  priority: 'MEDIUM',
  dueDate: '',
}

export default function TasksAdminPage() {
  const qc = useQueryClient()
  const list = useQuery({
    queryKey: qk,
    queryFn: () => apiFetch<TaskDto[]>('/api/admin/tasks'),
    staleTime: 15_000,
  })
  const items = useMemo(() => list.data ?? [], [list.data])

  const [tab, setTab] = useState<'all' | TaskStatus>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  const save = useMutation({
    mutationFn: (f: FormState) => {
      const body = JSON.stringify({
        title: f.title,
        description: f.description,
        status: f.status,
        priority: f.priority,
        dueDate: f.dueDate || null,
      })
      return f.id
        ? apiFetch<TaskDto>(`/api/admin/tasks/${f.id}`, { method: 'PUT', body })
        : apiFetch<TaskDto>('/api/admin/tasks', { method: 'POST', body })
    },
    onSuccess: () => {
      setDialogOpen(false)
      setForm(EMPTY_FORM)
      qc.invalidateQueries({ queryKey: qk })
    },
  })

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/admin/tasks/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  })

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }
  const openEdit = (t: TaskDto) => {
    setForm({
      id: t.id,
      title: t.title,
      description: t.description ?? '',
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate ?? '',
    })
    setDialogOpen(true)
  }

  const counts = {
    all: items.length,
    TODO: items.filter((t) => t.status === 'TODO').length,
    IN_PROGRESS: items.filter((t) => t.status === 'IN_PROGRESS').length,
    DONE: items.filter((t) => t.status === 'DONE').length,
  }
  const activeData = tab === 'all' ? items : items.filter((t) => t.status === tab)

  const statusFilters: { value: 'all' | TaskStatus; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: counts.all },
    { value: 'TODO', label: 'To do', count: counts.TODO },
    { value: 'IN_PROGRESS', label: 'In progress', count: counts.IN_PROGRESS },
    { value: 'DONE', label: 'Done', count: counts.DONE },
  ]
  const statusFilter = (
    <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-1">
      {statusFilters.map((f) => {
        const active = tab === f.value
        return (
          <button
            key={f.value}
            type="button"
            onClick={() => setTab(f.value)}
            aria-pressed={active}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-colors',
              active
                ? 'bg-background font-medium text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {f.label}
            <span className="text-xs tabular-nums text-muted-foreground">{f.count}</span>
          </button>
        )
      })}
    </div>
  )

  const columns = useMemo<ColumnDef<TaskDto, unknown>[]>(
    () => [
      {
        id: 'title',
        accessorFn: (r) => r.title,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Task" />,
        cell: ({ row }) => (
          <div className="flex flex-col leading-tight">
            <span className="font-medium">{row.original.title}</span>
            {row.original.description ? (
              <span className="line-clamp-1 text-xs text-muted-foreground">
                {row.original.description}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        id: 'status',
        accessorFn: (r) => r.status,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => statusBadge(row.original.status),
      },
      {
        id: 'priority',
        accessorFn: (r) => r.priority,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Priority" />,
        cell: ({ row }) => priorityBadge(row.original.priority),
      },
      {
        id: 'dueDate',
        accessorFn: (r) => r.dueDate ?? '',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="Due" className="ml-auto w-full justify-end" />
        ),
        cell: ({ row }) => (
          <div className="text-right text-xs text-muted-foreground tabular-nums">
            {row.original.dueDate ?? '—'}
          </div>
        ),
      },
      {
        id: 'actions',
        enableSorting: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" className="size-8" />}
              aria-label="Row actions"
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="gap-2" onClick={() => openEdit(row.original)}>
                <Pencil className="size-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                className="gap-2"
                onClick={() => remove.mutate(row.original.id)}
              >
                <Trash2 className="size-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [remove]
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tasks"
        subtitle="A lightweight task tracker."
        count={list.isLoading ? undefined : items.length}
        actions={
          <Button className="gap-2" onClick={openCreate}>
            <Plus className="size-4" />
            New task
          </Button>
        }
      />

      <DataTable
        key={tab}
        columns={columns}
        data={activeData}
        getRowId={(r) => r.id}
        filters={statusFilter}
        searchPlaceholder="Search tasks…"
        hideSyncColumn
        enableBulkSelect={false}
        emptyMessage={
          list.isLoading
            ? 'Loading…'
            : tab === 'all'
              ? 'No tasks yet — create your first one.'
              : 'No tasks match this filter.'
        }
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit task' : 'New task'}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (form.title.trim()) save.mutate(form)
            }}
          >
            <Input
              placeholder="Title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
            <Textarea
              placeholder="Description (optional)"
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
            <div className="grid grid-cols-2 gap-3">
              <AppSelect
                value={form.status}
                isSearchable={false}
                onChange={(v) => setForm((f) => ({ ...f, status: v as TaskStatus }))}
                options={[
                  { value: 'TODO', label: 'To do' },
                  { value: 'IN_PROGRESS', label: 'In progress' },
                  { value: 'DONE', label: 'Done' },
                ]}
              />
              <AppSelect
                value={form.priority}
                isSearchable={false}
                onChange={(v) => setForm((f) => ({ ...f, priority: v as TaskPriority }))}
                options={[
                  { value: 'LOW', label: 'Low' },
                  { value: 'MEDIUM', label: 'Medium' },
                  { value: 'HIGH', label: 'High' },
                ]}
              />
            </div>
            <Input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
            />
            {save.error ? (
              <p className="text-sm text-destructive">{(save.error as Error).message}</p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!form.title.trim() || save.isPending}>
                {save.isPending ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
