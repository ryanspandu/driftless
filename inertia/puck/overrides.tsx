import { type ComponentType } from 'react'
import type { Overrides } from '@measured/puck'
import {
  AppWindow,
  Box,
  ChevronDown,
  CircleDot,
  Code,
  Columns3,
  Component,
  Expand,
  FileText,
  GalleryHorizontal,
  GalleryHorizontalEnd,
  Heading,
  Image as ImageIcon,
  KeyRound,
  LayoutGrid,
  LayoutList,
  LayoutTemplate,
  LetterText,
  Link,
  Link2,
  List,
  LockKeyhole,
  LogIn,
  MapPin,
  Minus,
  MousePointerClick,
  MoveVertical,
  PanelTop,
  Pilcrow,
  Play,
  Quote,
  RectangleHorizontal,
  Rows3,
  Search,
  ShieldCheck,
  Sparkles,
  Square,
  Star,
  SquareCheck,
  SquareChevronDown,
  SquareDashed,
  Tag,
  TextCursorInput,
  Type,
  Upload,
  UserPlus,
  Video,
} from 'lucide-react'
import { FaFacebookF, FaXTwitter } from 'react-icons/fa6'
import { cn } from '~/lib/utils'
import { puckConfig } from '~/puck/config'
import { moduleBlockIcons } from '~/puck/module-blocks'
import { customBlockIcons } from '~/puck/custom-blocks'

/** Icons for core's own blocks. Modules contribute theirs from their
 *  `ui/puck/blocks.tsx`; the two are merged into `ICONS` below. */
const CORE_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  // Structure
  Section: RectangleHorizontal,
  Container: Square,
  QuickStack: LayoutGrid,
  VFlex: Rows3,
  HFlex: Columns3,
  PageOutlet: LayoutTemplate,
  // Basic
  DivBlock: SquareDashed,
  List: List,
  ListItem: List,
  LinkBlock: Link2,
  Button: MousePointerClick,
  // Typography
  Heading: Heading,
  Paragraph: Pilcrow,
  TextLink: Link,
  Text: Type,
  BlockQuote: Quote,
  RichText: FileText,
  // CMS
  CollectionList: LayoutGrid,
  // Media
  Image: ImageIcon,
  Video: Video,
  YouTube: Video,
  LottieAnimation: Sparkles,
  SplineScene: Box,
  Rive: Play,
  // Forms
  LoginForm: LogIn,
  RegisterForm: UserPlus,
  ForgotPasswordForm: KeyRound,
  ResetPasswordForm: LockKeyhole,
  FormBlock: LayoutList,
  Label: Tag,
  Input: TextCursorInput,
  FileUpload: Upload,
  TextArea: LetterText,
  Checkbox: SquareCheck,
  RadioButton: CircleDot,
  Select: SquareChevronDown,
  Recaptcha: ShieldCheck,
  FormButton: MousePointerClick,
  // Advanced
  Search: Search,
  BackgroundVideo: Video,
  Dropdown: ChevronDown,
  CodeEmbed: Code,
  Lightbox: Expand,
  Navbar: PanelTop,
  Slider: GalleryHorizontal,
  Carousel: GalleryHorizontalEnd,
  Tabs: AppWindow,
  Map: MapPin,
  Reviews: Star,
  Facebook: FaFacebookF,
  XTwitter: FaXTwitter,
  CustomElement: Code,
  CodeBlock: Code,
  // Other
  Grid: LayoutGrid,
  Columns: Columns3,
  Spacer: MoveVertical,
  Divider: Minus,
  TemplateRef: Component,
}

/** Icon per block type (keyed by the Puck component name). Shared with the
 *  Layers tree (layers-tree.tsx) and the Detail panel so tiles and tree rows use
 *  the same glyphs. Module blocks (`module-blocks.ts`) and first-party custom
 *  blocks (`custom-blocks.ts`) bring their own; core wins on a name collision.
 *  Anything not listed falls back to `Square`. */
export const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  ...moduleBlockIcons(),
  ...customBlockIcons(),
  ...CORE_ICONS,
}

/** Legacy friendlier labels (the drawer + tree now prefer the config `label`). */
export const LABELS: Record<string, string> = {
  RichText: 'Rich text',
  CollectionList: 'Collection',
}

/** Display label for a component tile/row — the config `label`, else the key. */
function labelFor(name: string): string {
  const fromConfig = (puckConfig.components?.[name] as { label?: string } | undefined)?.label
  return fromConfig || LABELS[name] || name
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
    const label = labelFor(name)
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
