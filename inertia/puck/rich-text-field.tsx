import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { Bold, Heading2, Italic, Link as LinkIcon, List, ListOrdered } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { cn } from '~/lib/utils'

/**
 * TipTap editor used as a Puck custom field for the RichText block. Emits HTML
 * (so the public render is a plain `dangerouslySetInnerHTML`). Lazy-loaded by the
 * config so TipTap stays out of the SSR render path.
 */

function Toolbar({ editor }: { editor: Editor }) {
  const cls = (active: boolean) => cn('size-7', active && 'bg-muted text-foreground')
  const promptLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('Link URL', prev ?? 'https://')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  return (
    <div className="flex flex-wrap items-center gap-1 border-b p-1 text-muted-foreground">
      <Button type="button" size="icon-sm" variant="ghost" className={cls(editor.isActive('bold'))} onClick={() => editor.chain().focus().toggleBold().run()} aria-label="Bold">
        <Bold className="size-4" />
      </Button>
      <Button type="button" size="icon-sm" variant="ghost" className={cls(editor.isActive('italic'))} onClick={() => editor.chain().focus().toggleItalic().run()} aria-label="Italic">
        <Italic className="size-4" />
      </Button>
      <Button type="button" size="icon-sm" variant="ghost" className={cls(editor.isActive('heading', { level: 2 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} aria-label="Heading">
        <Heading2 className="size-4" />
      </Button>
      <Button type="button" size="icon-sm" variant="ghost" className={cls(editor.isActive('bulletList'))} onClick={() => editor.chain().focus().toggleBulletList().run()} aria-label="Bullet list">
        <List className="size-4" />
      </Button>
      <Button type="button" size="icon-sm" variant="ghost" className={cls(editor.isActive('orderedList'))} onClick={() => editor.chain().focus().toggleOrderedList().run()} aria-label="Ordered list">
        <ListOrdered className="size-4" />
      </Button>
      <Button type="button" size="icon-sm" variant="ghost" className={cls(editor.isActive('link'))} onClick={promptLink} aria-label="Link">
        <LinkIcon className="size-4" />
      </Button>
    </div>
  )
}

export function RichTextField({
  value,
  onChange,
}: {
  value?: string
  onChange: (value: string) => void
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
    ],
    content: value || '',
    onUpdate: ({ editor: ed }) => onChange(ed.getHTML()),
    editorProps: { attributes: { class: 'tiptap-content min-h-32 px-3 py-2 focus:outline-none' } },
  })

  if (!editor) {
    return <div className="rounded-md border p-2 text-sm text-muted-foreground">Loading editor…</div>
  }

  return (
    <div className="overflow-hidden rounded-md border bg-background">
      <Toolbar editor={editor} />
      <div className="max-h-80 overflow-auto">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
