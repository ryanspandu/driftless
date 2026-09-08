import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { FormFieldDef, FormDefinitionStatus } from '~/types/api'
import { useUrlState } from '~/hooks/use-url-state'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Badge } from '~/components/ui/badge'
import { AppSelect } from '~/components/ui/app-select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { BackButton } from '~/components/admin/back-button'
import { FormsInbox } from '~/components/admin/forms-inbox'
import { FormFieldsEditor } from '~/components/forms/form-fields-editor'
import { useForm, useUpdateForm } from '~/hooks/api/use-forms-admin'

const TABS = ['submissions', 'fields', 'settings'] as const

const STATUS_OPTIONS: { value: FormDefinitionStatus; label: string }[] = [
  { value: 'active', label: 'Active — accepting submissions' },
  { value: 'inactive', label: 'Inactive — not accepting' },
  { value: 'draft', label: 'Draft' },
]

export default function FormDetailPage({ id }: { id: string }) {
  const url = useUrlState()
  const tab = url.one('tab', TABS, 'submissions')
  const query = useForm(id)
  const update = useUpdateForm()
  const form = query.data

  // Settings form, seeded once the definition loads.
  const [settings, setSettings] = useState<{
    title: string
    slug: string
    successMessage: string
    status: FormDefinitionStatus
  } | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  useEffect(() => {
    if (form && !settings) {
      setSettings({
        title: form.title,
        slug: form.slug,
        successMessage: form.successMessage ?? '',
        status: form.status,
      })
    }
  }, [form, settings])

  if (query.isPending) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading…
      </div>
    )
  }
  if (query.isError || !form) {
    return <p className="py-16 text-sm text-destructive">Could not load this form.</p>
  }

  const saveFields = (fields: FormFieldDef[]) => update.mutate({ id, fields })

  const saveSettings = () => {
    if (!settings) return
    update
      .mutateAsync({
        id,
        title: settings.title,
        slug: settings.slug,
        successMessage: settings.successMessage || null,
        status: settings.status,
      })
      .then(() => {
        setSavedFlash(true)
        window.setTimeout(() => setSavedFlash(false), 2000)
      })
  }

  return (
    <div className="space-y-6">
      <BackButton href="/admin/forms" label="Forms" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{form.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Bind a page’s <strong>Form Block</strong> to{' '}
            <code className="rounded bg-muted px-1 font-mono text-xs">{form.slug}</code> to show it.
          </p>
        </div>
        {update.isPending ? (
          <Badge variant="secondary" className="gap-1">
            <Loader2 className="size-3 animate-spin" /> Saving…
          </Badge>
        ) : null}
      </div>

      <Tabs value={tab} onValueChange={(v) => url.set({ tab: v === 'submissions' ? undefined : v })}>
        <TabsList>
          <TabsTrigger value="submissions">Submissions</TabsTrigger>
          <TabsTrigger value="fields">Fields</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="submissions" className="mt-4">
          <FormsInbox formId={id} />
        </TabsContent>

        <TabsContent value="fields" className="mt-4">
          <FormFieldsEditor fields={form.fields} onChange={saveFields} />
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          {settings ? (
            <div className="max-w-lg space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="f-title">Title</Label>
                <Input
                  id="f-title"
                  value={settings.title}
                  onChange={(e) => setSettings({ ...settings, title: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="f-slug">Slug</Label>
                <Input
                  id="f-slug"
                  value={settings.slug}
                  onChange={(e) => setSettings({ ...settings, slug: e.target.value })}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  The stable key a Form Block binds to. Changing it breaks existing bindings.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="f-success">Success message</Label>
                <textarea
                  id="f-success"
                  rows={2}
                  value={settings.successMessage}
                  onChange={(e) => setSettings({ ...settings, successMessage: e.target.value })}
                  placeholder="Thanks — we’ve received your message."
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <AppSelect
                  value={settings.status}
                  onChange={(v) => setSettings({ ...settings, status: v as FormDefinitionStatus })}
                  options={STATUS_OPTIONS}
                  isSearchable={false}
                />
              </div>
              <div className="flex items-center gap-3">
                <Button onClick={saveSettings} disabled={update.isPending}>
                  Save settings
                </Button>
                {savedFlash ? <span className="text-sm text-emerald-600">Saved</span> : null}
              </div>
            </div>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  )
}
