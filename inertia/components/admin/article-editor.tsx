import { useState, type ReactNode } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { NodeSelection } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { TableKit } from '@tiptap/extension-table'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import { FontFamily, FontSize, TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Youtube from '@tiptap/extension-youtube'
import CharacterCount from '@tiptap/extension-character-count'
import Typography from '@tiptap/extension-typography'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'
import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details'
import { DragHandle } from '@tiptap/extension-drag-handle-react'
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  ChevronDown,
  Code,
  Code2,
  GripVertical,
  Highlighter,
  ImagePlus,
  Italic,
  Link as LinkIcon,
  List,
  ListChecks,
  ListCollapse,
  ListOrdered,
  ListTree,
  Minus,
  Pipette,
  Plus,
  Quote,
  Redo,
  RemoveFormatting,
  Strikethrough,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  Table as TableIcon,
  MonitorPlay as YoutubeIcon,
  Underline as UnderlineIcon,
  Undo,
  Unlink,
} from 'lucide-react'
import { Button } from '~/components/ui/button'
import { AppSelect } from '~/components/ui/app-select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown_menu'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover'
import { cn } from '~/lib/utils'
import { ResizableImage } from './resizable-image'
import { BlockLineHeight } from './line-height'
import { createSlashCommand } from './slash-command'
import { MediaImagePicker } from './media-image-picker'

const lowlight = createLowlight(common)

export interface ArticleEditorProps {
  /** HTML string (the same markup rendered on the public page). */
  value: string
  onChange: (html: string) => void
  disabled?: boolean
  placeholder?: string
  className?: string
  /** Render without the outer border/ring so it blends into a parent card. */
  bare?: boolean
}

const HIGHLIGHT_COLORS = [
  '#fef08a',
  '#fde68a',
  '#fed7aa',
  '#fecaca',
  '#fbcfe8',
  '#e9d5ff',
  '#ddd6fe',
  '#bfdbfe',
  '#a5f3fc',
  '#bbf7d0',
]

const LINE_HEIGHTS = [
  { value: 'default', label: 'Spacing' },
  { value: '1', label: '1.0' },
  { value: '1.15', label: '1.15' },
  { value: '1.5', label: '1.5' },
  { value: '1.75', label: '1.75' },
  { value: '2', label: '2.0' },
]

const TEXT_COLORS = [
  '#000000',
  '#374151',
  '#6b7280',
  '#9ca3af',
  '#d1d5db',
  '#ffffff',
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#eab308',
  '#84cc16',
  '#22c55e',
  '#10b981',
  '#14b8a6',
  '#06b6d4',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#a855f7',
  '#d946ef',
  '#ec4899',
  '#f43f5e',
  '#7c2d12',
  '#1e3a8a',
]

/**
 * Full-featured TipTap WYSIWYG editor for article bodies. Emits **HTML** (the
 * same markup rendered publicly inside `prose`). StarterKit already bundles
 * Link + Underline, so Link is configured here and not added twice.
 */
export function ArticleEditor({
  value,
  onChange,
  disabled,
  placeholder,
  className,
  bare,
}: ArticleEditorProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')

  const editor = useEditor({
    editable: !disabled,
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        codeBlock: false,
        link: {
          openOnClick: false,
          HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
        },
      }),
      Placeholder.configure({ placeholder: placeholder ?? 'Write your article…' }),
      TextStyle,
      FontFamily,
      FontSize,
      BlockLineHeight,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Subscript,
      Superscript,
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit.configure({ table: { resizable: true } }),
      Youtube.configure({ nocookie: true, HTMLAttributes: { class: 'rounded-lg' } }),
      ResizableImage.configure({ HTMLAttributes: { class: 'rounded-lg' } }),
      CodeBlockLowlight.configure({ lowlight }),
      Typography,
      CharacterCount,
      Details.configure({ persist: true, HTMLAttributes: { class: 'tiptap-details' } }),
      DetailsSummary,
      DetailsContent,
      createSlashCommand({ onInsertImage: () => setPickerOpen(true) }),
    ],
    content: value || '',
    onUpdate: ({ editor: ed }) => onChange(ed.getHTML()),
    editorProps: {
      attributes: {
        class: 'tiptap-content min-h-[24rem] px-4 py-3 focus:outline-none',
      },
      // Clicking an image selects the whole node (so its resize/align controls
      // show). ProseMirror's implicit atom selection is unreliable with a custom
      // NodeView, so we select it explicitly here.
      handleClickOn: (view, _pos, node, nodePos) => {
        if (node.type.name === 'image') {
          view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, nodePos)))
          return true
        }
        return false
      },
    },
  })

  if (!editor) {
    return (
      <div
        className={cn(
          'rounded-lg border bg-background p-3 text-sm text-muted-foreground',
          className
        )}
      >
        Loading editor…
      </div>
    )
  }

  const words = editor.storage.characterCount.words()
  const characters = editor.storage.characterCount.characters()
  const readingMinutes = Math.max(1, Math.ceil(words / 200))

  const openLink = () => {
    setLinkUrl((editor.getAttributes('link').href as string) ?? '')
    setLinkOpen(true)
  }

  return (
    <div
      className={cn(
        bare
          ? 'overflow-hidden bg-transparent'
          : 'overflow-hidden rounded-lg border bg-background focus-within:ring-2 focus-within:ring-ring',
        disabled && 'opacity-60',
        className
      )}
    >
      <Toolbar
        editor={editor}
        disabled={disabled}
        onInsertImage={() => setPickerOpen(true)}
        onEditLink={openLink}
      />
      <div className="max-h-[60vh] overflow-auto border-t">
        <EditorContent editor={editor} />
      </div>
      <DragHandle editor={editor}>
        <div className="flex h-6 w-5 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-muted active:cursor-grabbing">
          <GripVertical className="size-4" />
        </div>
      </DragHandle>
      <div className="flex items-center justify-end gap-3 border-t px-3 py-1.5 text-xs tabular-nums text-muted-foreground">
        <span>{words} words</span>
        <span>{characters} characters</span>
        <span>~{readingMinutes} min read</span>
      </div>

      <BubbleMenu
        editor={editor}
        shouldShow={({ editor: ed, state }) =>
          ed.isEditable && !state.selection.empty && !ed.isActive('image')
        }
        className="flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 text-muted-foreground shadow-md"
      >
        <TbBtn
          label="Bold"
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="size-4" />
        </TbBtn>
        <TbBtn
          label="Italic"
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="size-4" />
        </TbBtn>
        <TbBtn
          label="Underline"
          active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="size-4" />
        </TbBtn>
        <TbBtn
          label="Strikethrough"
          active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="size-4" />
        </TbBtn>
        <TbBtn
          label="Highlight"
          active={editor.isActive('highlight')}
          onClick={() => editor.chain().focus().toggleHighlight().run()}
        >
          <Highlighter className="size-4" />
        </TbBtn>
        <TbBtn label="Link" active={editor.isActive('link')} onClick={openLink}>
          <LinkIcon className="size-4" />
        </TbBtn>
        <TbBtn
          label="Remove link"
          disabled={!editor.isActive('link')}
          onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}
        >
          <Unlink className="size-4" />
        </TbBtn>
      </BubbleMenu>

      <MediaImagePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={(src) => editor.chain().focus().setImage({ src }).run()}
      />
      <LinkDialog
        editor={editor}
        open={linkOpen}
        onOpenChange={setLinkOpen}
        url={linkUrl}
        onUrlChange={setLinkUrl}
      />
    </div>
  )
}

function Divider() {
  return <div className="mx-1 h-4 w-px bg-border" />
}

function TbBtn({
  label,
  onClick,
  active,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      className={cn('size-7', active && 'bg-muted text-foreground')}
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {children}
    </Button>
  )
}

const FORMAT_OPTIONS = [
  { value: 'paragraph', label: 'Paragraph' },
  { value: 'h1', label: 'Heading 1' },
  { value: 'h2', label: 'Heading 2' },
  { value: 'h3', label: 'Heading 3' },
  { value: 'h4', label: 'Heading 4' },
  { value: 'h5', label: 'Heading 5' },
  { value: 'h6', label: 'Heading 6' },
]

function blockFormat(editor: Editor): string {
  for (let lvl = 1; lvl <= 6; lvl++) {
    if (editor.isActive('heading', { level: lvl })) return `h${lvl}`
  }
  return 'paragraph'
}

function applyFormat(editor: Editor, value: string): void {
  if (value === 'paragraph') {
    editor.chain().focus().setParagraph().run()
    return
  }
  const level = Number(value.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6
  editor.chain().focus().setHeading({ level }).run()
}

const FONT_FAMILIES = [
  { value: 'default', label: 'Default font' },
  { value: 'Inter, ui-sans-serif, sans-serif', label: 'Sans-serif' },
  { value: 'Georgia, serif', label: 'Serif' },
  { value: 'ui-monospace, monospace', label: 'Monospace' },
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: '"Times New Roman", serif', label: 'Times New Roman' },
  { value: '"Courier New", monospace', label: 'Courier New' },
]

const FONT_SIZES = [
  { value: 'default', label: 'Size' },
  { value: '12px', label: '12' },
  { value: '14px', label: '14' },
  { value: '16px', label: '16' },
  { value: '18px', label: '18' },
  { value: '20px', label: '20' },
  { value: '24px', label: '24' },
  { value: '30px', label: '30' },
  { value: '36px', label: '36' },
]

function applyFontFamily(editor: Editor, value: string): void {
  if (value === 'default') editor.chain().focus().unsetFontFamily().run()
  else editor.chain().focus().setFontFamily(value).run()
}

function applyFontSize(editor: Editor, value: string): void {
  if (value === 'default') editor.chain().focus().unsetFontSize().run()
  else editor.chain().focus().setFontSize(value).run()
}

function currentLineHeight(editor: Editor): string {
  return (
    (editor.getAttributes('paragraph').lineHeight as string) ||
    (editor.getAttributes('heading').lineHeight as string) ||
    'default'
  )
}

function applyLineHeight(editor: Editor, value: string): void {
  if (value === 'default') editor.chain().focus().unsetLineHeight().run()
  else editor.chain().focus().setLineHeight(value).run()
}

function LinkDialog({
  editor,
  open,
  onOpenChange,
  url,
  onUrlChange,
}: {
  editor: Editor
  open: boolean
  onOpenChange: (open: boolean) => void
  url: string
  onUrlChange: (url: string) => void
}) {
  const hasLink = editor.isActive('link')

  const apply = () => {
    const href = url.trim()
    const chain = editor.chain().focus().extendMarkRange('link')
    if (href) chain.setLink({ href }).run()
    else chain.unsetLink().run()
    onOpenChange(false)
  }

  const remove = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{hasLink ? 'Edit link' : 'Add link'}</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="https://example.com"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              apply()
            }
          }}
        />
        <DialogFooter>
          {hasLink ? (
            <Button
              variant="ghost"
              className="mr-auto gap-1.5 text-destructive hover:text-destructive"
              onClick={remove}
            >
              <Unlink className="size-4" />
              Remove link
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={apply}>{hasLink ? 'Update' : 'Add'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Custom font-size stepper: type any size, or step with −/+. */
function FontSizeStepper({ editor, disabled }: { editor: Editor; disabled?: boolean }) {
  const px = Number.parseInt((editor.getAttributes('textStyle').fontSize as string) || '', 10)
  const current = Number.isFinite(px) ? px : 16

  const apply = (n: number) => {
    if (!Number.isFinite(n)) return
    const clamped = Math.min(200, Math.max(8, Math.round(n)))
    editor.chain().focus().setFontSize(`${clamped}px`).run()
  }

  return (
    <div className="inline-flex h-7 items-center overflow-hidden rounded-md border border-input">
      <button
        type="button"
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => apply(current - 1)}
        aria-label="Decrease font size"
        className="flex h-full items-center px-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        <Minus className="size-3.5" />
      </button>
      <input
        key={current}
        type="text"
        inputMode="numeric"
        defaultValue={current}
        disabled={disabled}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          const el = e.target as HTMLInputElement
          apply(Number(el.value))
          el.blur()
        }}
        onBlur={(e) => apply(Number(e.target.value))}
        aria-label="Font size"
        className="h-full w-8 border-x border-input bg-transparent text-center text-xs tabular-nums focus:outline-none"
      />
      <button
        type="button"
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => apply(current + 1)}
        aria-label="Increase font size"
        className="flex h-full items-center px-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  )
}

type OutlineItem = { level: number; text: string; pos: number }

function getOutline(editor: Editor): OutlineItem[] {
  const items: OutlineItem[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      items.push({
        level: (node.attrs.level as number) ?? 1,
        text: node.textContent || 'Untitled',
        pos,
      })
    }
  })
  return items
}

/** Live table of contents / outline: lists the document's headings; click to jump. */
function OutlineButton({ editor, disabled }: { editor: Editor; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const items = getOutline(editor)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button type="button" size="icon-sm" variant="ghost" className="size-7" />}
        aria-label="Table of contents"
        disabled={disabled}
      >
        <ListTree className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-[60vh] w-64 overflow-y-auto p-1">
        <p className="px-2 pt-1 pb-1.5 text-xs font-medium text-muted-foreground">
          Table of contents
        </p>
        {items.length === 0 ? (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">
            No headings yet — add H1–H6 to build the outline.
          </p>
        ) : (
          items.map((item) => (
            <button
              key={item.pos}
              type="button"
              onClick={() => {
                editor
                  .chain()
                  .focus()
                  .setTextSelection(item.pos + 1)
                  .scrollIntoView()
                  .run()
                setOpen(false)
              }}
              className="block w-full truncate rounded-md py-1 pr-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              style={{ paddingLeft: `${0.5 + (item.level - 1) * 0.75}rem` }}
            >
              {item.text}
            </button>
          ))
        )}
      </PopoverContent>
    </Popover>
  )
}

function Toolbar({
  editor,
  disabled,
  onInsertImage,
  onEditLink,
}: {
  editor: Editor
  disabled?: boolean
  onInsertImage: () => void
  onEditLink: () => void
}) {
  const inTable = editor.isActive('table')

  const promptYoutube = () => {
    const url = window.prompt('YouTube URL', 'https://')
    if (!url) return
    editor.commands.setYoutubeVideo({ src: url })
  }

  return (
    <div className="flex flex-wrap items-center gap-1 p-1.5 text-muted-foreground">
      <AppSelect
        value={blockFormat(editor)}
        onChange={(v) => applyFormat(editor, v)}
        options={FORMAT_OPTIONS}
        isSearchable={false}
        size="sm"
        disabled={disabled}
        className="w-[8rem]"
        controlClassName="!h-7 !min-h-7 !rounded-md !px-2"
      />
      <AppSelect
        value={(editor.getAttributes('textStyle').fontFamily as string) || 'default'}
        onChange={(v) => applyFontFamily(editor, v)}
        options={FONT_FAMILIES}
        isSearchable={false}
        size="sm"
        disabled={disabled}
        className="w-[7.5rem]"
        controlClassName="!h-7 !min-h-7 !rounded-md !px-2"
      />
      <AppSelect
        value={(editor.getAttributes('textStyle').fontSize as string) || 'default'}
        onChange={(v) => applyFontSize(editor, v)}
        options={FONT_SIZES}
        isSearchable={false}
        size="sm"
        disabled={disabled}
        className="w-[4.5rem]"
        controlClassName="!h-7 !min-h-7 !rounded-md !px-2"
      />
      <FontSizeStepper editor={editor} disabled={disabled} />
      <AppSelect
        value={currentLineHeight(editor)}
        onChange={(v) => applyLineHeight(editor, v)}
        options={LINE_HEIGHTS}
        isSearchable={false}
        size="sm"
        disabled={disabled}
        className="w-[5.5rem]"
        controlClassName="!h-7 !min-h-7 !rounded-md !px-2"
      />
      <Divider />

      <TbBtn
        label="Bold"
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="size-4" />
      </TbBtn>
      <TbBtn
        label="Italic"
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="size-4" />
      </TbBtn>
      <TbBtn
        label="Underline"
        active={editor.isActive('underline')}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon className="size-4" />
      </TbBtn>
      <TbBtn
        label="Strikethrough"
        active={editor.isActive('strike')}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough className="size-4" />
      </TbBtn>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className={cn('size-7', editor.isActive('highlight') && 'bg-muted text-foreground')}
            />
          }
          aria-label="Highlight"
          disabled={disabled}
        >
          <Highlighter className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-auto">
          <div className="grid grid-cols-5 gap-1 p-1.5">
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Highlight ${c}`}
                onClick={() => editor.chain().focus().setHighlight({ color: c }).run()}
                className="size-6 rounded-md border border-border"
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <DropdownMenuSeparator />
          <label className="mx-1 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground">
            <Pipette className="size-4" />
            <span>Custom color…</span>
            <input
              type="color"
              aria-label="Custom highlight"
              onChange={(e) => editor.chain().focus().setHighlight({ color: e.target.value }).run()}
              className="ml-auto size-6 cursor-pointer rounded bg-transparent p-0"
            />
          </label>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => editor.chain().focus().unsetHighlight().run()}>
            Remove highlight
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <TbBtn
        label="Inline code"
        active={editor.isActive('code')}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <Code className="size-4" />
      </TbBtn>

      {/* Text color */}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button type="button" size="icon-sm" variant="ghost" className="size-7" />}
          aria-label="Text color"
          disabled={disabled}
        >
          <Baseline className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-auto">
          <div className="grid grid-cols-6 gap-1 p-1.5">
            {TEXT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                onClick={() => editor.chain().focus().setColor(c).run()}
                className="size-6 rounded-full border border-border"
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <DropdownMenuSeparator />
          <label className="mx-1 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground">
            <Pipette className="size-4" />
            <span>Custom color…</span>
            <input
              type="color"
              aria-label="Custom color"
              onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
              className="ml-auto size-6 cursor-pointer rounded bg-transparent p-0"
            />
          </label>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => editor.chain().focus().unsetColor().run()}>
            Default color
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <TbBtn label="Clear formatting" onClick={() => editor.chain().focus().unsetAllMarks().run()}>
        <RemoveFormatting className="size-4" />
      </TbBtn>
      <Divider />

      <TbBtn
        label="Align left"
        active={editor.isActive({ textAlign: 'left' })}
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
      >
        <AlignLeft className="size-4" />
      </TbBtn>
      <TbBtn
        label="Align center"
        active={editor.isActive({ textAlign: 'center' })}
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
      >
        <AlignCenter className="size-4" />
      </TbBtn>
      <TbBtn
        label="Align right"
        active={editor.isActive({ textAlign: 'right' })}
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
      >
        <AlignRight className="size-4" />
      </TbBtn>
      <TbBtn
        label="Justify"
        active={editor.isActive({ textAlign: 'justify' })}
        onClick={() => editor.chain().focus().setTextAlign('justify').run()}
      >
        <AlignJustify className="size-4" />
      </TbBtn>
      <Divider />

      <TbBtn
        label="Subscript"
        active={editor.isActive('subscript')}
        onClick={() => editor.chain().focus().toggleSubscript().run()}
      >
        <SubscriptIcon className="size-4" />
      </TbBtn>
      <TbBtn
        label="Superscript"
        active={editor.isActive('superscript')}
        onClick={() => editor.chain().focus().toggleSuperscript().run()}
      >
        <SuperscriptIcon className="size-4" />
      </TbBtn>
      <Divider />

      <TbBtn
        label="Bullet list"
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="size-4" />
      </TbBtn>
      <TbBtn
        label="Ordered list"
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="size-4" />
      </TbBtn>
      <TbBtn
        label="Task list"
        active={editor.isActive('taskList')}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      >
        <ListChecks className="size-4" />
      </TbBtn>
      <TbBtn
        label="Quote"
        active={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote className="size-4" />
      </TbBtn>
      <TbBtn
        label="Code block"
        active={editor.isActive('codeBlock')}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      >
        <Code2 className="size-4" />
      </TbBtn>
      <TbBtn label="Divider" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
        <Minus className="size-4" />
      </TbBtn>
      <Divider />

      <TbBtn label="Link" active={editor.isActive('link')} onClick={onEditLink}>
        <LinkIcon className="size-4" />
      </TbBtn>
      <TbBtn
        label="Remove link"
        disabled={disabled || !editor.isActive('link')}
        onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}
      >
        <Unlink className="size-4" />
      </TbBtn>
      <TbBtn label="Insert image" onClick={onInsertImage}>
        <ImagePlus className="size-4" />
      </TbBtn>
      <TbBtn label="YouTube video" onClick={promptYoutube}>
        <YoutubeIcon className="size-4" />
      </TbBtn>
      <TbBtn label="Collapsible section" onClick={() => editor.chain().focus().setDetails().run()}>
        <ListCollapse className="size-4" />
      </TbBtn>

      {/* Table menu */}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="h-7 w-auto gap-0 px-1"
            />
          }
          aria-label="Table"
          disabled={disabled}
        >
          <TableIcon className="size-4" />
          <ChevronDown className="size-3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            onClick={() =>
              editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
            }
          >
            Insert table
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!inTable}
            onClick={() => editor.chain().focus().addColumnBefore().run()}
          >
            Add column before
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!inTable}
            onClick={() => editor.chain().focus().addColumnAfter().run()}
          >
            Add column after
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!inTable}
            onClick={() => editor.chain().focus().addRowBefore().run()}
          >
            Add row before
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!inTable}
            onClick={() => editor.chain().focus().addRowAfter().run()}
          >
            Add row after
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!inTable}
            onClick={() => editor.chain().focus().toggleHeaderRow().run()}
          >
            Toggle header row
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={!inTable}
            onClick={() => editor.chain().focus().deleteColumn().run()}
          >
            Delete column
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!inTable}
            onClick={() => editor.chain().focus().deleteRow().run()}
          >
            Delete row
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            disabled={!inTable}
            onClick={() => editor.chain().focus().deleteTable().run()}
          >
            Delete table
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <OutlineButton editor={editor} disabled={disabled} />

      <div className="ml-auto flex items-center gap-0.5">
        <TbBtn
          label="Undo"
          disabled={disabled || !editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo className="size-4" />
        </TbBtn>
        <TbBtn
          label="Redo"
          disabled={disabled || !editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo className="size-4" />
        </TbBtn>
      </div>
    </div>
  )
}
