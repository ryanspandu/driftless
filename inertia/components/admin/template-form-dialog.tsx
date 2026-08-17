import { FormEvent, useEffect, useState } from 'react'
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

export type TemplateFormSubmit = (values: {
  name: string
  type: TemplateType
}) => Promise<void> | void

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: TemplateFormSubmit
}

const TYPE_OPTIONS: { value: TemplateType; label: string }[] = [
  { value: 'HEADER', label: 'Header' },
  { value: 'FOOTER', label: 'Footer' },
  { value: 'COMPONENT', label: 'Component' },
  { value: 'LAYOUT', label: 'Layout' },
  // Opens a different builder: email clients cannot render the page blocks, so
  // an EMAIL template gets its own table-based, inline-styled block set.
  { value: 'EMAIL', label: 'Email' },
]

export function TemplateFormDialog({ open, onOpenChange, onSubmit }: Props) {
  const [name, setName] = useState('')
  const [type, setType] = useState<TemplateType>('HEADER')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName('')
    setType('HEADER')
    setError(null)
  }, [open])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await onSubmit({ name: name.trim(), type })
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
