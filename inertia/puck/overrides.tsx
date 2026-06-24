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

/** Icon per block type (keyed by the Puck component name). Shared with the
 *  Layers tree (layers-tree.tsx) so tiles and tree rows use the same glyphs. */
export const ICONS: Record<string, ComponentType<{ className?: string }>> = {
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
export const LABELS: Record<string, string> = {
  RichText: 'Rich text',
  CollectionList: 'Collection',
}

/**
 * Puck UI overrides for the builder. The Components/Detail/Layers panels are laid
 * out by the custom layout in `builder-shell.tsx` (not via `fields`/`outline`
 * overrides — those are position-locked and feed `Puck.Fields`/`Puck.Outline`).
 * The only override left is `componentItem`, which styles each drawer tile; the
 * 3-column grid itself is CSS (app.css) on Puck's internal `_Drawer_` container.
 */
export const puckOverrides: Partial<Overrides> = {
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
