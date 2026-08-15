import '@measured/puck/puck.css'
import { Puck, type Data } from '@measured/puck'
import { Link } from '@inertiajs/react'
import { ArrowLeft } from 'lucide-react'
import { Toaster, toast } from 'sonner'
import { puckConfig } from '~/puck/config'
import { builderViewports } from '~/puck/style-fields'
import { puckOverrides } from '~/puck/overrides'
import { BuilderShell } from '~/puck/builder-shell'
import { useTemplate, useUpdateTemplate } from '~/hooks/api/use-templates'
import { buttonVariants } from '~/components/ui/button'
import { cn } from '~/lib/utils'

const EMPTY_DOC = { content: [], root: {} } as unknown as Data

// See pages/builder.tsx: render the canvas in the host document (no iframe) to
// avoid Puck's freeze-prone auto-frame path; stable refs so props are identity-stable.
const PUCK_IFRAME = { enabled: false }
const PUCK_VIEWPORTS = [...builderViewports]

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
    } catch (error) {
      toast.error('Failed to save')
      // Rethrown so BuilderShell keeps the template marked unsaved — see the
      // guard there; a failed save must not clear it.
      throw error
    }
  }

  return (
    <Puck
      config={puckConfig}
      data={initial}
      onPublish={save}
      overrides={puckOverrides}
      viewports={PUCK_VIEWPORTS}
      iframe={PUCK_IFRAME}
    >
      <BuilderShell
        onPublish={save}
        topbarStart={
          <>
            <Link
              href="/admin/templates"
              className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'gap-1.5')}
            >
              <ArrowLeft className="size-4" />
              Templates
            </Link>
            <span className="truncate text-sm font-medium">{template.name}</span>
          </>
        }
      />

      <Toaster richColors position="bottom-right" />
    </Puck>
  )
}
