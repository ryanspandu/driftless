import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Calendar,
  GripVertical,
  LayoutGrid,
  List as ListIcon,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  User as UserIcon,
} from 'lucide-react'
import { apiFetch } from '~/lib/api-client'
import { Avatar, AvatarFallback } from '~/components/ui/avatar'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Textarea } from '~/components/ui/textarea'
import { AppSelect } from '~/components/ui/app-select'
import { DatePicker } from '~/components/ui/date-picker'
import { RichTextEditor } from '~/components/cms/rich-text-editor'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown_menu'
import { PageHeader } from '~/components/admin/page-header'
import { DataTable, DataTableColumnHeader } from '~/components/data-table'
import { useAbility } from '~/components/providers/ability-provider'
import { cn } from '~/lib/utils'

type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE'
type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH'

interface TaskAssignee {
  id: number
  displayName: string
  initials: string
}

interface TaskDto {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: TaskPriority
  dueDate: string | null
  position: number
  assignedUserId: number | null
  assignee: TaskAssignee | null
  createdAt: string
  updatedAt: string
}

const qk = ['module', 'tasks', 'list'] as const
const assigneesQk = ['module', 'tasks', 'assignees'] as const

const STATUSES: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'DONE']
const STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  DONE: 'Done',
}
const STATUS_DOT: Record<TaskStatus, string> = {
  TODO: 'bg-muted-foreground',
  IN_PROGRESS: 'bg-sky-500',
  DONE: 'bg-emerald-500',
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

function dueInfo(dueDate: string | null, status: TaskStatus): { label: string; overdue: boolean } | null {
  if (!dueDate) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(`${dueDate}T00:00:00`)
  if (Number.isNaN(due.getTime())) return null
  const overdue = due < today && status !== 'DONE'
  return { label: due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), overdue }
}

function AssigneeAvatar({ assignee }: { assignee: TaskAssignee | null }) {
  if (!assignee) {
    return (
      <Avatar size="sm" title="Unassigned">
        <AvatarFallback className="text-muted-foreground/60">
          <UserIcon className="size-3.5" aria-hidden />
        </AvatarFallback>
      </Avatar>
    )
  }
  return (
    <Avatar size="sm" title={assignee.displayName}>
      <AvatarFallback className="text-[10px] font-medium">{assignee.initials}</AvatarFallback>
    </Avatar>
  )
}

function groupByStatus(items: TaskDto[]): Record<TaskStatus, TaskDto[]> {
  const out: Record<TaskStatus, TaskDto[]> = { TODO: [], IN_PROGRESS: [], DONE: [] }
  for (const t of items) out[t.status].push(t)
  return out
}

// ── Rich-text description ──────────────────────────────────────────────────
// The `description` column holds a TipTap JSON document (stringified). Legacy
// rows hold plain text; helpers below tolerate both.

function plainTextOf(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const n = node as { text?: unknown; content?: unknown }
  if (typeof n.text === 'string') return n.text
  if (Array.isArray(n.content)) return n.content.map(plainTextOf).join(' ')
  return ''
}

/** A one-line plain-text excerpt of a stored description (for cards / table). */
function descriptionExcerpt(raw: string | null): string {
  if (!raw) return ''
  const trimmed = raw.trim()
  if (!trimmed.startsWith('{')) return raw
  try {
    return plainTextOf(JSON.parse(trimmed)).replace(/\s+/g, ' ').trim()
  } catch {
    return raw
  }
}

/** Stored string → TipTap value for the editor (wraps legacy plain text). */
function parseDescription(raw: string | null): unknown {
  if (!raw || !raw.trim()) return null
  const trimmed = raw.trim()
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed)
    } catch {
      /* fall through to plain-text wrapping */
    }
  }
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: raw }] }] }
}

/** Editor value → stored string (null when the doc has no text). */
function serializeDescription(value: unknown): string | null {
  if (value == null) return null
  if (!plainTextOf(value).trim()) return null
  return JSON.stringify(value)
}

type FormState = {
  id: string | null
  title: string
  description: unknown
  status: TaskStatus
  priority: TaskPriority
  dueDate: string
  assignedUserId: number | null
}
const EMPTY_FORM: FormState = {
  id: null,
  title: '',
  description: null,
  status: 'TODO',
  priority: 'MEDIUM',
  dueDate: '',
  assignedUserId: null,
}

export default function TasksAdminPage() {
  const qc = useQueryClient()
  const { me } = useAbility()
  const myId = me ? Number(me.id) : null

  const list = useQuery({
    queryKey: qk,
    queryFn: () => apiFetch<TaskDto[]>('/api/admin/tasks'),
    staleTime: 15_000,
  })
  const items = useMemo(() => list.data ?? [], [list.data])

  const assigneesQuery = useQuery({
    queryKey: assigneesQk,
    queryFn: () => apiFetch<TaskAssignee[]>('/api/admin/tasks/assignees'),
    staleTime: 60_000,
  })
  const assignees = assigneesQuery.data ?? []

  const [view, setView] = useState<'board' | 'list'>(() => {
    if (typeof window === 'undefined') return 'board'
    return window.localStorage.getItem('tasks:view') === 'list' ? 'list' : 'board'
  })
  useEffect(() => {
    window.localStorage.setItem('tasks:view', view)
  }, [view])

  const [tab, setTab] = useState<'all' | TaskStatus>('all')
  const [search, setSearch] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [mineOnly, setMineOnly] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  // Existing tasks open in read-only "view" mode; New / clicking Edit edits.
  const [editing, setEditing] = useState(false)
  const editSnapshot = useRef<FormState>(EMPTY_FORM)

  const save = useMutation({
    mutationFn: (f: FormState) => {
      const body = JSON.stringify({
        title: f.title,
        description: serializeDescription(f.description),
        status: f.status,
        priority: f.priority,
        dueDate: f.dueDate || null,
        assignedUserId: f.assignedUserId,
      })
      return f.id
        ? apiFetch<TaskDto>(`/api/admin/tasks/${f.id}`, { method: 'PUT', body })
        : apiFetch<TaskDto>('/api/admin/tasks', { method: 'POST', body })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  })

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/admin/tasks/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  })

  const move = useMutation({
    mutationFn: (v: { id: string; toStatus: TaskStatus; beforeId: string | null; afterId: string | null }) =>
      apiFetch(`/api/admin/tasks/${v.id}/move`, {
        method: 'PATCH',
        body: JSON.stringify({ toStatus: v.toStatus, beforeId: v.beforeId, afterId: v.afterId }),
      }),
    onSettled: () => qc.invalidateQueries({ queryKey: qk }),
  })

  const quickAdd = useMutation({
    mutationFn: (v: { status: TaskStatus; title: string }) =>
      apiFetch<TaskDto>('/api/admin/tasks', {
        method: 'POST',
        body: JSON.stringify({ title: v.title, status: v.status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk }),
  })

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setEditing(true)
    setDialogOpen(true)
  }
  const openEdit = (t: TaskDto, startInEdit = false) => {
    const next: FormState = {
      id: t.id,
      title: t.title,
      description: parseDescription(t.description),
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate ?? '',
      assignedUserId: t.assignedUserId,
    }
    setForm(next)
    editSnapshot.current = next
    setEditing(startInEdit)
    setDialogOpen(true)
  }
  const startEdit = () => {
    editSnapshot.current = form
    setEditing(true)
  }
  const cancelEdit = () => {
    if (!form.id) {
      setDialogOpen(false)
      return
    }
    setForm(editSnapshot.current)
    setEditing(false)
  }
  const submitForm = async () => {
    if (!form.title.trim()) return
    const wasCreate = !form.id
    try {
      await save.mutateAsync(form)
      if (wasCreate) {
        setDialogOpen(false)
        setForm(EMPTY_FORM)
      } else {
        setEditing(false)
      }
    } catch {
      /* surfaced via save.error */
    }
  }

  // Shared filtered dataset feeding BOTH views (status is structural, so it's
  // NOT part of the shared filter — the list view adds its own status tab).
  const sharedFiltered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((t) => {
      if (q && !t.title.toLowerCase().includes(q)) return false
      if (assigneeFilter === '__none__' && t.assignedUserId !== null) return false
      if (assigneeFilter && assigneeFilter !== '__none__' && String(t.assignedUserId) !== assigneeFilter)
        return false
      if (priorityFilter && t.priority !== priorityFilter) return false
      if (mineOnly && (myId === null || t.assignedUserId !== myId)) return false
      return true
    })
  }, [items, search, assigneeFilter, priorityFilter, mineOnly, myId])

  const listData = tab === 'all' ? sharedFiltered : sharedFiltered.filter((t) => t.status === tab)

  const assigneeOptions = useMemo(
    () => [
      { value: '', label: 'All assignees' },
      { value: '__none__', label: 'Unassigned', icon: <AssigneeAvatar assignee={null} /> },
      ...assignees.map((a) => ({
        value: String(a.id),
        label: a.displayName,
        icon: <AssigneeAvatar assignee={a} />,
      })),
    ],
    [assignees]
  )

  const formAssignee =
    form.assignedUserId !== null
      ? (assignees.find((a) => a.id === form.assignedUserId) ?? null)
      : null

  const filterBar = (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        type="search"
        placeholder="Search tasks…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="h-9 w-full sm:w-56"
      />
      <div className="w-40">
        <AppSelect
          value={assigneeFilter}
          onChange={setAssigneeFilter}
          options={assigneeOptions}
          isSearchable={assignees.length > 8}
        />
      </div>
      <div className="w-32">
        <AppSelect
          value={priorityFilter}
          onChange={setPriorityFilter}
          isSearchable={false}
          options={[
            { value: '', label: 'All priority' },
            { value: 'HIGH', label: 'High' },
            { value: 'MEDIUM', label: 'Medium' },
            { value: 'LOW', label: 'Low' },
          ]}
        />
      </div>
      {myId !== null ? (
        <Button
          type="button"
          variant={mineOnly ? 'default' : 'outline'}
          size="sm"
          className="h-9 gap-2"
          onClick={() => setMineOnly((v) => !v)}
        >
          <UserIcon className="size-4" />
          Assigned to me
        </Button>
      ) : null}
    </div>
  )

  const viewToggle = (
    <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-1">
      {([
        { value: 'board', label: 'Board', icon: LayoutGrid },
        { value: 'list', label: 'List', icon: ListIcon },
      ] as const).map((v) => {
        const active = view === v.value
        const Icon = v.icon
        return (
          <button
            key={v.value}
            type="button"
            onClick={() => setView(v.value)}
            aria-pressed={active}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-colors',
              active
                ? 'bg-background font-medium text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="size-4" />
            {v.label}
          </button>
        )
      })}
    </div>
  )

  const statusFilters: { value: 'all' | TaskStatus; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: sharedFiltered.length },
    { value: 'TODO', label: 'To do', count: sharedFiltered.filter((t) => t.status === 'TODO').length },
    {
      value: 'IN_PROGRESS',
      label: 'In progress',
      count: sharedFiltered.filter((t) => t.status === 'IN_PROGRESS').length,
    },
    { value: 'DONE', label: 'Done', count: sharedFiltered.filter((t) => t.status === 'DONE').length },
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
        cell: ({ row }) => {
          const ex = descriptionExcerpt(row.original.description)
          return (
            <div className="flex flex-col leading-tight">
              <button
                type="button"
                onClick={() => openEdit(row.original)}
                className="text-left font-medium hover:underline"
              >
                {row.original.title}
              </button>
              {ex ? <span className="line-clamp-1 text-xs text-muted-foreground">{ex}</span> : null}
            </div>
          )
        },
      },
      {
        id: 'status',
        accessorFn: (r) => r.status,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => statusBadge(row.original.status),
      },
      {
        id: 'assignee',
        accessorFn: (r) => r.assignee?.displayName ?? '',
        header: ({ column }) => <DataTableColumnHeader column={column} title="Assignee" />,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <AssigneeAvatar assignee={row.original.assignee} />
            <span className="text-sm text-muted-foreground">
              {row.original.assignee?.displayName ?? 'Unassigned'}
            </span>
          </div>
        ),
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
              <DropdownMenuItem className="gap-2" onClick={() => openEdit(row.original, true)}>
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
        title="To do list"
        subtitle="Plan and track your work."
        count={list.isLoading ? undefined : items.length}
        actions={
          <div className="flex items-center gap-2">
            {viewToggle}
            <Button className="gap-2" onClick={openCreate}>
              <Plus className="size-4" />
              New task
            </Button>
          </div>
        }
      />

      {filterBar}

      {view === 'board' ? (
        <KanbanBoard
          items={sharedFiltered}
          onEdit={openEdit}
          onDelete={(id) => remove.mutate(id)}
          onMove={(v) => move.mutateAsync(v)}
          onQuickAdd={(status, title) => quickAdd.mutate({ status, title })}
        />
      ) : (
        <DataTable
          key={tab}
          columns={columns}
          data={listData}
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
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o)
          if (!o) setEditing(false)
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Task details' : 'New task'}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault()
              void submitForm()
            }}
          >
            <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_15rem]">
              {/* Main: title + description */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Title</Label>
                  {editing ? (
                    <Input
                      placeholder="Task title"
                      className="font-medium"
                      autoFocus
                      value={form.title}
                      onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    />
                  ) : (
                    <p className="text-lg font-medium leading-snug">{form.title}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label>Description</Label>
                  {!editing && !serializeDescription(form.description) ? (
                    <p className="text-sm text-muted-foreground">No description.</p>
                  ) : (
                    <RichTextEditor
                      key={`${form.id ?? 'new'}:${editing ? 'edit' : 'view'}`}
                      value={form.description}
                      onChange={(v) => setForm((f) => ({ ...f, description: v }))}
                      readOnly={!editing}
                      placeholder="Add a more detailed description…"
                    />
                  )}
                </div>
              </div>

              {/* Sidebar: meta */}
              <div className="space-y-4 md:border-l md:pl-6">
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  {editing ? (
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
                  ) : (
                    <div>{statusBadge(form.status)}</div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Priority</Label>
                  {editing ? (
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
                  ) : (
                    <div>{priorityBadge(form.priority)}</div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Assignee</Label>
                  {editing ? (
                    <AppSelect
                      value={form.assignedUserId === null ? '' : String(form.assignedUserId)}
                      onChange={(v) => setForm((f) => ({ ...f, assignedUserId: v ? Number(v) : null }))}
                      isSearchable={assignees.length > 8}
                      options={[
                        { value: '', label: 'Unassigned', icon: <AssigneeAvatar assignee={null} /> },
                        ...assignees.map((a) => ({
                          value: String(a.id),
                          label: a.displayName,
                          icon: <AssigneeAvatar assignee={a} />,
                        })),
                      ]}
                    />
                  ) : (
                    <div className="flex items-center gap-2 text-sm">
                      <AssigneeAvatar assignee={formAssignee} />
                      <span className={formAssignee ? '' : 'text-muted-foreground'}>
                        {formAssignee?.displayName ?? 'Unassigned'}
                      </span>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Due date</Label>
                  {editing ? (
                    <DatePicker
                      value={form.dueDate || null}
                      onChange={(v) => setForm((f) => ({ ...f, dueDate: v ?? '' }))}
                      placeholder="No due date"
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {form.dueDate
                        ? new Date(`${form.dueDate}T00:00:00`).toLocaleDateString(undefined, {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : 'No due date'}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {save.error ? (
              <p className="text-sm text-destructive">{(save.error as Error).message}</p>
            ) : null}

            <DialogFooter>
              {form.id ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="mr-auto gap-2 text-destructive hover:text-destructive"
                  onClick={() => {
                    if (form.id) remove.mutate(form.id)
                    setDialogOpen(false)
                  }}
                >
                  <Trash2 className="size-4" />
                  Delete
                </Button>
              ) : null}

              {editing ? (
                <>
                  <Button key="cancel" type="button" variant="outline" onClick={cancelEdit}>
                    Cancel
                  </Button>
                  <Button key="save" type="submit" disabled={!form.title.trim() || save.isPending}>
                    {save.isPending ? 'Saving…' : 'Save'}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    key="close"
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                  >
                    Close
                  </Button>
                  <Button key="edit" type="button" className="gap-2" onClick={startEdit}>
                    <Pencil className="size-4" />
                    Edit
                  </Button>
                </>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function KanbanBoard({
  items,
  onEdit,
  onDelete,
  onMove,
  onQuickAdd,
}: {
  items: TaskDto[]
  onEdit: (task: TaskDto, edit?: boolean) => void
  onDelete: (id: string) => void
  onMove: (v: {
    id: string
    toStatus: TaskStatus
    beforeId: string | null
    afterId: string | null
  }) => Promise<unknown>
  onQuickAdd: (status: TaskStatus, title: string) => void
}) {
  const [board, setBoard] = useState<Record<TaskStatus, TaskDto[]>>(() => groupByStatus(items))
  const [activeId, setActiveId] = useState<string | null>(null)
  // Ref (not a dep) so settling a move doesn't re-sync against stale `items`
  // and snap the optimistic board back before the refetch lands.
  const activeIdRef = useRef<string | null>(null)

  // Re-sync from server data only when it actually changes, and never mid-drag.
  useEffect(() => {
    if (activeIdRef.current) return
    setBoard(groupByStatus(items))
  }, [items])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const findContainer = (id: string): TaskStatus | null => {
    if ((STATUSES as string[]).includes(id)) return id as TaskStatus
    return STATUSES.find((s) => board[s].some((t) => t.id === id)) ?? null
  }

  const activeTask = activeId
    ? STATUSES.map((s) => board[s].find((t) => t.id === activeId)).find(Boolean) ?? null
    : null

  function onDragStart(e: DragStartEvent) {
    activeIdRef.current = String(e.active.id)
    setActiveId(String(e.active.id))
  }

  function onDragOver(e: DragOverEvent) {
    const { active, over } = e
    if (!over) return
    const activeC = findContainer(String(active.id))
    const overC = findContainer(String(over.id))
    if (!activeC || !overC || activeC === overC) return
    setBoard((prev) => {
      const activeItems = prev[activeC]
      const overItems = prev[overC]
      const moving = activeItems.find((t) => t.id === active.id)
      if (!moving) return prev
      let overIdx = overItems.findIndex((t) => t.id === over.id)
      if (overIdx < 0) overIdx = overItems.length
      return {
        ...prev,
        [activeC]: activeItems.filter((t) => t.id !== active.id),
        [overC]: [
          ...overItems.slice(0, overIdx),
          { ...moving, status: overC },
          ...overItems.slice(overIdx),
        ],
      }
    })
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    const id = String(active.id)
    activeIdRef.current = null
    setActiveId(null)
    if (!over) {
      setBoard(groupByStatus(items))
      return
    }
    const overC = findContainer(String(over.id))
    if (!overC) {
      setBoard(groupByStatus(items))
      return
    }

    const colItems = board[overC]
    const oldIdx = colItems.findIndex((t) => t.id === id)
    let newIdx = colItems.findIndex((t) => t.id === over.id)
    if (newIdx < 0) newIdx = colItems.length - 1
    const reordered =
      oldIdx >= 0 && newIdx >= 0 && oldIdx !== newIdx ? arrayMove(colItems, oldIdx, newIdx) : colItems
    setBoard((prev) => ({ ...prev, [overC]: reordered }))

    const idx = reordered.findIndex((t) => t.id === id)
    const beforeId = idx > 0 ? reordered[idx - 1]!.id : null
    const afterId = idx >= 0 && idx < reordered.length - 1 ? reordered[idx + 1]!.id : null

    // Skip the request if nothing actually changed (drop in place).
    const origin = groupByStatus(items)
    const originC = STATUSES.find((s) => origin[s].some((t) => t.id === id)) ?? null
    if (originC) {
      const oArr = origin[originC]
      const oi = oArr.findIndex((t) => t.id === id)
      const oBefore = oi > 0 ? oArr[oi - 1]!.id : null
      const oAfter = oi >= 0 && oi < oArr.length - 1 ? oArr[oi + 1]!.id : null
      if (originC === overC && oBefore === beforeId && oAfter === afterId) return
    }

    onMove({ id, toStatus: overC, beforeId, afterId }).catch(() => {
      setBoard(groupByStatus(items))
    })
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {STATUSES.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            tasks={board[status]}
            onEdit={onEdit}
            onDelete={onDelete}
            onQuickAdd={onQuickAdd}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? <TaskCard task={activeTask} dragging onEdit={onEdit} onDelete={onDelete} /> : null}
      </DragOverlay>
    </DndContext>
  )
}

function KanbanColumn({
  status,
  tasks,
  onEdit,
  onDelete,
  onQuickAdd,
}: {
  status: TaskStatus
  tasks: TaskDto[]
  onEdit: (task: TaskDto, edit?: boolean) => void
  onDelete: (id: string) => void
  onQuickAdd: (status: TaskStatus, title: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')

  const submit = () => {
    const t = title.trim()
    if (t) onQuickAdd(status, t)
    setTitle('')
    setAdding(false)
  }

  return (
    <div className="flex flex-col rounded-xl border bg-muted/30">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className={cn('size-2 rounded-full', STATUS_DOT[status])} aria-hidden />
        <span className="text-sm font-medium">{STATUS_LABEL[status]}</span>
        <span className="text-xs tabular-nums text-muted-foreground">{tasks.length}</span>
        <button
          type="button"
          onClick={() => setAdding(true)}
          aria-label={`Add card to ${STATUS_LABEL[status]}`}
          className="ml-auto rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Plus className="size-4" />
        </button>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-24 flex-1 flex-col gap-2 px-2.5 pb-2.5 transition-colors',
          isOver && 'bg-accent/40'
        )}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <SortableTaskCard key={task.id} task={task} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </SortableContext>

        {adding ? (
          <div className="rounded-lg border bg-card p-2">
            <Textarea
              autoFocus
              rows={2}
              placeholder="Card title…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submit()
                }
                if (e.key === 'Escape') {
                  setTitle('')
                  setAdding(false)
                }
              }}
            />
            <div className="mt-2 flex items-center gap-2">
              <Button size="sm" onClick={submit} disabled={!title.trim()}>
                Add card
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setTitle('')
                  setAdding(false)
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : tasks.length === 0 ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded-lg border border-dashed py-6 text-center text-xs text-muted-foreground transition-colors hover:bg-accent/40"
          >
            No tasks — drop here or add one
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <Plus className="size-3.5" />
            Add card
          </button>
        )}
      </div>
    </div>
  )
}

function SortableTaskCard({
  task,
  onEdit,
  onDelete,
}: {
  task: TaskDto
  onEdit: (task: TaskDto, edit?: boolean) => void
  onDelete: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  }
  return (
    <div ref={setNodeRef} style={style}>
      <TaskCard task={task} onEdit={onEdit} onDelete={onDelete} dragHandle={{ attributes, listeners }} />
    </div>
  )
}

function TaskCard({
  task,
  onEdit,
  onDelete,
  dragging,
  dragHandle,
}: {
  task: TaskDto
  onEdit: (task: TaskDto, edit?: boolean) => void
  onDelete: (id: string) => void
  dragging?: boolean
  dragHandle?: {
    attributes: ReturnType<typeof useSortable>['attributes']
    listeners: ReturnType<typeof useSortable>['listeners']
  }
}) {
  const due = dueInfo(task.dueDate, task.status)
  const excerpt = descriptionExcerpt(task.description)
  return (
    <div
      className={cn(
        'group/card rounded-lg border bg-card p-2.5 shadow-sm',
        dragging && 'ring-2 ring-ring'
      )}
    >
      <div className="flex items-start gap-1.5">
        {dragHandle ? (
          <button
            type="button"
            className="mt-0.5 shrink-0 cursor-grab touch-none text-muted-foreground/60 hover:text-foreground active:cursor-grabbing"
            aria-label="Drag card"
            {...dragHandle.attributes}
            {...dragHandle.listeners}
          >
            <GripVertical className="size-4" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onEdit(task)}
          className="line-clamp-2 min-w-0 flex-1 text-left text-sm font-medium leading-snug hover:underline"
        >
          {task.title}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="size-6 shrink-0 opacity-0 transition-opacity group-hover/card:opacity-100"
              />
            }
            aria-label="Card actions"
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="gap-2" onClick={() => onEdit(task, true)}>
              <Pencil className="size-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              className="gap-2"
              onClick={() => onDelete(task.id)}
            >
              <Trash2 className="size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {excerpt ? (
        <p className="mt-1 line-clamp-1 pl-5 text-xs text-muted-foreground">{excerpt}</p>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-2 pl-5">
        {priorityBadge(task.priority)}
        {due ? (
          <span
            className={cn(
              'inline-flex items-center gap-1 text-xs',
              due.overdue ? 'text-destructive' : 'text-muted-foreground'
            )}
          >
            <Calendar className="size-3.5" aria-hidden />
            {due.label}
          </span>
        ) : null}
        <span className="ml-auto">
          <AssigneeAvatar assignee={task.assignee} />
        </span>
      </div>
    </div>
  )
}
