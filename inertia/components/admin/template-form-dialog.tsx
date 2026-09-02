import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { TemplateType } from '~/types/api'
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { AppSelect } from '~/components/ui/app-select'
import { apiErrorMessage } from '~/lib/api'
import { useBindableCollections } from '~/hooks/api/use-cms-collections'

export type TemplateFormSubmit = (values: {
  name: string
  type: TemplateType
  /** Only sent for COLLECTION templates. */
  collectionKey?: string
}) => Promise<void> | void

/** Pre-fill for a deep link (`?new=COLLECTION&collection=posts`). */
export interface TemplateFormInitial {
  type: TemplateType
  collectionKey?: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: TemplateFormSubmit
  initial?: TemplateFormInitial | null
}

const TYPE_OPTIONS: { value: TemplateType; label: string }[] = [
  { value: 'HEADER', label: 'Header' },
  { value: 'FOOTER', label: 'Footer' },
  { value: 'COMPONENT', label: 'Component' },
  { value: 'LAYOUT', label: 'Layout' },
  // Opens a different builder: email clients cannot render the page blocks, so
  // an EMAIL template gets its own table-based, inline-styled block set.
  { value: 'EMAIL', label: 'Email' },
  // The item card a Collection List repeats per record. Bound to one CMS
  // collection so the builder can offer that collection's fields for binding.
  { value: 'COLLECTION', label: 'Collection item' },
]

export function TemplateFormDialog({ open, onOpenChange, onSubmit, initial }: Props) {
  const [name, setName] = useState('')
  const [type, setType] = useState<TemplateType>('HEADER')
  const [collectionKey, setCollectionKey] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isCollection = type === 'COLLECTION'
  // Built-ins (Posts, Products when the store is on) and CMS collections alike —
  // whatever a Collection List can show, a template can be designed for.
  const collectionsQuery = useBindableCollections()
  const collectionOptions = useMemo(
    () =>
      (collectionsQuery.data ?? []).map((c) => ({
        value: c.key,
        label: c.group ? `${c.label} (${c.group})` : c.label,
      })),
    [collectionsQuery.data]
  )

  useEffect(() => {
    if (!open) return
    setName('')
    setType(initial?.type ?? 'HEADER')
    setCollectionKey(initial?.collectionKey ?? '')
    setError(null)
  }, [open, initial])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (isCollection && !collectionKey) {
      setError('Pick the collection this template is for')
      return
    }
    setSubmitting(true)
    try {
      await onSubmit({
        name: name.trim(),
        type,
        ...(isCollection ? { collectionKey } : {}),
      })
      onOpenChange(false)
    } catch (err) {
      setError(apiErrorMessage(err, 'Failed to save'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New template</DialogTitle>
          <DialogDescription>
            Create a template, then design it in the visual builder.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="template-name">Name</Label>
            <Input
              id="template-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={1}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="template-type">Type</Label>
            <AppSelect
              id="template-type"
              value={type}
              onChange={(v) => setType(v as TemplateType)}
              options={TYPE_OPTIONS}
              isSearchable={false}
            />
          </div>

          {isCollection ? (
            <div className="space-y-2">
              <Label htmlFor="template-collection">Collection</Label>
              <AppSelect
                id="template-collection"
                value={collectionKey}
                onChange={(v) => setCollectionKey(String(v ?? ''))}
                options={collectionOptions}
                placeholder={collectionsQuery.isLoading ? 'Loading…' : 'Select a collection'}
              />
              <p className="text-xs text-muted-foreground">
                The item card repeats once per record. Bind its text, images and links to this
                collection&apos;s fields from each element&apos;s Settings tab.
              </p>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
