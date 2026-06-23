import {
  Briefcase,
  Buildings,
  Calendar,
  ChartBar,
  ChatCircle,
  CheckSquare,
  Clipboard,
  Cube,
  CurrencyDollar,
  Envelope,
  Faders,
  FileText,
  FolderSimple,
  Gauge,
  Kanban,
  Lifebuoy,
  ListChecks,
  Megaphone,
  Notebook,
  Package,
  PuzzlePiece,
  Receipt,
  ShoppingCart,
  SquaresFour,
  Stack,
  Tag,
  Ticket,
  Users,
  type Icon,
} from '@phosphor-icons/react'

/**
 * Curated phosphor icons selectable by name from a module/plugin manifest's
 * `nav.icon`. Kept as an explicit map (not a barrel lookup) so the bundle only
 * ships the icons we actually expose. Unknown names fall back to `Cube`.
 */
const ICONS: Record<string, Icon> = {
  Briefcase,
  Buildings,
  Calendar,
  ChartBar,
  ChatCircle,
  CheckSquare,
  Clipboard,
  Cube,
  CurrencyDollar,
  Envelope,
  Faders,
  FileText,
  FolderSimple,
  Gauge,
  Kanban,
  Lifebuoy,
  ListChecks,
  Megaphone,
  Notebook,
  Package,
  PuzzlePiece,
  Receipt,
  ShoppingCart,
  SquaresFour,
  Stack,
  Tag,
  Ticket,
  Users,
}

/** Resolve a phosphor icon component by name, defaulting to `Cube`. */
export function phosphorIconByName(name?: string): Icon {
  if (name && ICONS[name]) return ICONS[name]
  return Cube
}

/** Icon names a module manifest may reference (for docs / validation). */
export const PHOSPHOR_ICON_NAMES = Object.keys(ICONS)
