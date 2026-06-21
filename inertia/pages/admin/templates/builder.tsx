import '@measured/puck/puck.css'
import { Puck, type Data } from '@measured/puck'
import { Link } from '@inertiajs/react'
import { ArrowLeft } from 'lucide-react'
import { Toaster, toast } from 'sonner'
import { puckConfig } from '~/puck/config'
import { builderViewports } from '~/puck/style-fields'
import { puckOverrides } from '~/puck/overrides'
import { useTemplate, useUpdateTemplate } from '~/hooks/api/use-templates'
import { buttonVariants } from '~/components/ui/button'
import { cn } from '~/lib/utils'

const EMPTY_DOC = { content: [], root: {} } as unknown as Data

export default function TemplateBuilder({ id }: { id: string }) {
  const templateQuery = useTemplate(id)
  const updateMut = useUpdateTemplate()
  const template = templateQuery.data

  if (templateQuery.isLoading || !template) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Loading builder…
      </div>
    )
  }

  const initial =
    template.content && Object.keys(template.content).length
      ? (template.content as unknown as Data)
      : EMPTY_DOC

  const save = async (data: Data) => {
    try {
      await updateMut.mutateAsync({ id, content: data as unknown as Record<string, unknown> })
      toast.success('Template design saved')
    } catch {
      toast.error('Failed to save')
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between border-b bg-background px-3">
        <div className="flex items-center gap-2">
          <Link
            href="/admin/templates"
            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'gap-1.5')}
          >
            <ArrowLeft className="size-4" />
            Templates
          </Link>
          <span className="text-sm font-medium">{template.name}</span>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <Puck
          config={puckConfig}
          data={initial}
          onPublish={save}
          overrides={puckOverrides}
          viewports={[...builderViewports]}
        />
      </div>

      <Toaster richColors position="bottom-right" />
    </div>
  )
}
