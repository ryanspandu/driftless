import { Link } from '@inertiajs/react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { cn } from '~/lib/utils'

/**
 * The back affordance on a detail page.
 *
 * This existed as thirteen hand-written copies of the same six lines, and they
 * had already drifted: most were `ghost`, one was `outline`, some put the
 * accessible name on the link and others on an `sr-only` span, one carried a
 * `shrink-0` the rest were missing. None of that was a decision — it was
 * copy-paste diverging over time, and the visible result was a button that
 * looked slightly different depending on which page you had navigated to.
 *
 * `ghost` is the shape the majority used, so it is the one that survives.
 *
 * Always paired with a heading in a `flex items-center gap-3` row rather than
 * baked into `PageHeader`, because several pages build their own header — an
 * icon tile, a badge next to the title — and a prop on `PageHeader` would not
 * reach them.
 */
export function BackButton({
  href,
  label,
  className,
}: {
  href: string
  /** The accessible name, e.g. "Back to settings". There is no visible text. */
  label: string
  className?: string
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn('size-8 shrink-0', className)}
      render={<Link href={href} aria-label={label} />}
    >
      <ArrowLeft className="size-4" aria-hidden />
    </Button>
  )
}
