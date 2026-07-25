import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react'
import { Extension, type Editor, type Range } from '@tiptap/core'
import { ReactRenderer } from '@tiptap/react'
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from '@tiptap/suggestion'
import {
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  List,
  ListChecks,
  ListCollapse,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Table as TableIcon,
} from 'lucide-react'
import { cn } from '~/lib/utils'

type CommandArgs = { editor: Editor; range: Range }

type SlashItem = {
  title: string
  subtitle: string
  icon: ReactNode
  keywords?: string[]
  command: (args: CommandArgs) => void
}

export type SlashCommandOptions = {
  onInsertImage?: () => void
}

function buildItems(options: SlashCommandOptions): SlashItem[] {
  const c = (args: CommandArgs) => args.editor.chain().focus().deleteRange(args.range)
  return [
    {
      title: 'Heading 1',
      subtitle: 'Large section title',
      icon: <Heading1 className="size-4" />,
      keywords: ['h1', 'title', 'heading'],
      command: (a) => c(a).setHeading({ level: 1 }).run(),
    },
    {
      title: 'Heading 2',
      subtitle: 'Medium section title',
      icon: <Heading2 className="size-4" />,
      keywords: ['h2', 'heading'],
      command: (a) => c(a).setHeading({ level: 2 }).run(),
    },
    {
      title: 'Heading 3',
      subtitle: 'Small section title',
      icon: <Heading3 className="size-4" />,
      keywords: ['h3', 'heading'],
      command: (a) => c(a).setHeading({ level: 3 }).run(),
    },
    {
      title: 'Paragraph',
      subtitle: 'Plain text',
      icon: <Pilcrow className="size-4" />,
      keywords: ['text', 'paragraph', 'p'],
      command: (a) => c(a).setParagraph().run(),
    },
    {
      title: 'Bullet list',
      subtitle: 'Unordered list',
      icon: <List className="size-4" />,
      keywords: ['ul', 'unordered', 'bullet'],
      command: (a) => c(a).toggleBulletList().run(),
    },
    {
      title: 'Numbered list',
      subtitle: 'Ordered list',
      icon: <ListOrdered className="size-4" />,
      keywords: ['ol', 'ordered', 'number'],
      command: (a) => c(a).toggleOrderedList().run(),
    },
    {
      title: 'Task list',
      subtitle: 'Checklist with checkboxes',
      icon: <ListChecks className="size-4" />,
      keywords: ['todo', 'task', 'checklist', 'check'],
      command: (a) => c(a).toggleTaskList().run(),
    },
    {
      title: 'Quote',
      subtitle: 'Blockquote',
      icon: <Quote className="size-4" />,
      keywords: ['blockquote', 'quote'],
      command: (a) => c(a).toggleBlockquote().run(),
    },
    {
      title: 'Code block',
      subtitle: 'Code with syntax highlighting',
      icon: <Code2 className="size-4" />,
      keywords: ['code', 'pre', 'snippet'],
      command: (a) => c(a).toggleCodeBlock().run(),
    },
    {
      title: 'Divider',
      subtitle: 'Horizontal rule',
      icon: <Minus className="size-4" />,
      keywords: ['hr', 'rule', 'divider', 'separator'],
      command: (a) => c(a).setHorizontalRule().run(),
    },
    {
      title: 'Table',
      subtitle: '3×3 table with header',
      icon: <TableIcon className="size-4" />,
      keywords: ['table', 'grid'],
      command: (a) => c(a).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
    {
      title: 'Collapsible',
      subtitle: 'Expandable details section',
      icon: <ListCollapse className="size-4" />,
      keywords: ['details', 'toggle', 'accordion', 'collapsible'],
      command: (a) => c(a).setDetails().run(),
    },
    {
      title: 'Image',
      subtitle: 'Upload or pick from library',
      icon: <ImageIcon className="size-4" />,
      keywords: ['image', 'picture', 'photo', 'media'],
      command: (a) => {
        c(a).run()
        options.onInsertImage?.()
      },
    },
  ]
}

type ListHandle = { onKeyDown: (props: SuggestionKeyDownProps) => boolean }

const SlashCommandList = forwardRef<
  ListHandle,
  { items: SlashItem[]; command: (item: SlashItem) => void }
>(function SlashCommandList({ items, command }, ref) {
  const [selected, setSelected] = useState(0)
  const selectedRef = useRef(0)
  selectedRef.current = selected

  useEffect(() => {
    setSelected(0)
  }, [items])

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      const n = items.length
      if (!n) return false
      if (event.key === 'ArrowUp') {
        setSelected((selectedRef.current + n - 1) % n)
        return true
      }
      if (event.key === 'ArrowDown') {
        setSelected((selectedRef.current + 1) % n)
        return true
      }
      if (event.key === 'Enter') {
        const item = items[selectedRef.current]
        if (item) command(item)
        return true
      }
      return false
    },
  }))

  if (!items.length) {
    return (
      <div className="w-64 rounded-lg border border-border bg-popover p-3 text-center text-xs text-muted-foreground shadow-md">
        No matching blocks
      </div>
    )
  }

  return (
    <div className="max-h-72 w-64 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md">
      {items.map((item, i) => (
        <button
          key={item.title}
          type="button"
          onMouseEnter={() => setSelected(i)}
          onClick={() => command(item)}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left',
            i === selected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'
          )}
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
            {item.icon}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{item.title}</span>
            <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span>
          </span>
        </button>
      ))}
    </div>
  )
})

/**
 * Notion-style `/` command menu. Type `/` to open a filterable list of blocks
 * (headings, lists, table, code, image, …) with keyboard navigation.
 */
export function createSlashCommand(options: SlashCommandOptions = {}) {
  return Extension.create({
    name: 'slashCommand',

    addProseMirrorPlugins() {
      return [
        Suggestion<SlashItem>({
          editor: this.editor,
          char: '/',
          startOfLine: false,
          allowSpaces: false,
          command: ({ editor, range, props }) => {
            props.command({ editor, range })
          },
          items: ({ query }) => {
            const q = query.toLowerCase()
            return buildItems(options).filter(
              (item) =>
                item.title.toLowerCase().includes(q) || item.keywords?.some((k) => k.includes(q))
            )
          },
          render: () => {
            let renderer: ReactRenderer<ListHandle> | null = null
            let el: HTMLDivElement | null = null

            const place = (props: SuggestionProps<SlashItem>) => {
              if (!el) return
              const rect = props.clientRect?.()
              if (!rect) return
              el.style.position = 'fixed'
              el.style.left = `${rect.left}px`
              el.style.top = `${rect.bottom + 6}px`
              el.style.zIndex = '60'
            }

            return {
              onStart: (props) => {
                renderer = new ReactRenderer(SlashCommandList, {
                  props: { items: props.items, command: props.command },
                  editor: props.editor,
                })
                el = document.createElement('div')
                el.appendChild(renderer.element)
                document.body.appendChild(el)
                place(props)
              },
              onUpdate: (props) => {
                renderer?.updateProps({ items: props.items, command: props.command })
                place(props)
              },
              onKeyDown: (props) => {
                if (props.event.key === 'Escape') {
                  el?.remove()
                  el = null
                  renderer?.destroy()
                  renderer = null
                  return true
                }
                return renderer?.ref?.onKeyDown(props) ?? false
              },
              onExit: () => {
                el?.remove()
                el = null
                renderer?.destroy()
                renderer = null
              },
            }
          },
        }),
      ]
    },
  })
}
