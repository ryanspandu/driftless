import { type ComponentType } from 'react'
import type { Overrides } from '@measured/puck'
import {
  Columns3,
  FileText,
  Heading,
  Image as ImageIcon,
  LayoutGrid,
  Minus,
  MousePointerClick,
  MoveVertical,
  RectangleHorizontal,
  Square,
  Type,
} from 'lucide-react'
import { cn } from '~/lib/utils'

/** Icon per block type (keyed by the Puck component name). */
const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  Section: RectangleHorizontal,
  Container: Square,
  Columns: Columns3,
  Heading: Heading,
  Text: Type,
  Button: MousePointerClick,
  Image: ImageIcon,
  RichText: FileText,
  CollectionList: LayoutGrid,
  Spacer: MoveVertical,
  Divider: Minus,
}

/** Friendlier labels for multi-word component names. */
const LABELS: Record<string, string> = {
  RichText: 'Rich text',
  CollectionList: 'Collection',
}

/**
 * Puck UI overrides shared by the page builder and the header/footer editor:
 * render the component drawer as a 3-column grid of labelled icon tiles.
 *
 * The canvas runs WITHOUT Puck's iframe (`iframe={{ enabled: false }}` in the
 * builders) and the builders wrap themselves in `.theme-light`, so the preview
 * stays light even when the dashboard is dark — no iframe override needed here.
 */
export const puckOverrides: Partial<Overrides> = {
  // The 3-column grid layout itself is done in CSS (app.css) on Puck's internal
  // `_Drawer_` container — `components` only wraps the whole list, not the items.
  componentItem: ({ name }) => {
    const Icon = ICONS[name] ?? Square
    const label = LABELS[name] ?? name
    return (
      <div
        className={cn(
          // max-w caps the drag ghost (cloned to <body> unconstrained); aspect-square
          // then keeps height in check. In the panel the cell is narrower than the cap,
          // so tiles still fill their grid cell.
          'flex aspect-square w-full max-w-28 cursor-grab flex-col items-center justify-center gap-1.5',
          'rounded-md border bg-card p-2 text-center transition-colors',
          'hover:border-ring hover:bg-accent'
        )}
      >
        <Icon className="size-5 text-muted-foreground" />
        <span className="text-xs font-medium leading-tight">{label}</span>
      </div>
    )
  },
}
