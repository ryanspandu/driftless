
import { useEffect } from "react";
import {
  EditorContent,
  useEditor,
  type Editor,
  type JSONContent,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Redo,
  Strikethrough,
  Undo,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

export interface RichTextEditorProps {
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  /** Display-only: not editable, no toolbar, no border chrome. */
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
}

function normalizeInitial(value: unknown): JSONContent | null {
  if (value == null) return null;
  if (typeof value === "object" && !Array.isArray(value)) {
    const obj = value as { type?: unknown };
    if (typeof obj.type === "string") return value as JSONContent;
  }
  return null;
}

/**
 * TipTap-powered WYSIWYG editor used for `RICHTEXT` fields. Emits the TipTap
 * JSON document (same shape the backend stores in JSONB) on every change.
 * Initialises once with the incoming value to avoid fighting controlled-form
 * round-trips; external resets (e.g. opening a different record in the same
 * dialog instance) are handled by the form's `modeKey` remount.
 */
export function RichTextEditor({
  value,
  onChange,
  disabled,
  readOnly,
  placeholder,
  className,
}: RichTextEditorProps) {
  const editor = useEditor({
    editable: !disabled && !readOnly,
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      Placeholder.configure({
        placeholder: placeholder ?? "Write something…",
      }),
    ],
    content: normalizeInitial(value) ?? "",
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getJSON());
    },
    editorProps: {
      attributes: {
        class: "tiptap-content min-h-40 px-3 py-2 focus:outline-none",
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    const shouldEdit = !disabled && !readOnly;
    if (editor.isEditable !== shouldEdit) editor.setEditable(shouldEdit);
  }, [editor, disabled, readOnly]);

  useEffect(() => {
    return () => {
      editor?.destroy();
    };
  }, [editor]);

  if (!editor) {
    return (
      <div
        className={cn(
          "rounded-lg border bg-background p-3 text-sm text-muted-foreground",
          className,
        )}
      >
        Loading editor…
      </div>
    );
  }

  if (readOnly) {
    return (
      <div className={className}>
        <EditorContent editor={editor} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border bg-background focus-within:ring-2 focus-within:ring-ring",
        disabled && "opacity-60",
        className,
      )}
    >
      <Toolbar editor={editor} disabled={disabled} />
      <div className="max-h-[28rem] overflow-auto border-t">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function Toolbar({
  editor,
  disabled,
}: {
  editor: Editor;
  disabled?: boolean;
}) {
  const btn = (active: boolean) =>
    cn(
      "size-7",
      active && "bg-muted text-foreground",
    );

  const promptLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", prev ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url })
      .run();
  };

  return (
    <div className="flex flex-wrap items-center gap-1 p-1 text-muted-foreground">
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className={btn(editor.isActive("heading", { level: 1 }))}
        disabled={disabled}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 1 }).run()
        }
        aria-label="Heading 1"
      >
        <Heading1 className="size-4" />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className={btn(editor.isActive("heading", { level: 2 }))}
        disabled={disabled}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 2 }).run()
        }
        aria-label="Heading 2"
      >
        <Heading2 className="size-4" />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className={btn(editor.isActive("heading", { level: 3 }))}
        disabled={disabled}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 3 }).run()
        }
        aria-label="Heading 3"
      >
        <Heading3 className="size-4" />
      </Button>
      <div className="mx-1 h-4 w-px bg-border" />
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className={btn(editor.isActive("bold"))}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleBold().run()}
        aria-label="Bold"
      >
        <Bold className="size-4" />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className={btn(editor.isActive("italic"))}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        aria-label="Italic"
      >
        <Italic className="size-4" />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className={btn(editor.isActive("strike"))}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        aria-label="Strikethrough"
      >
        <Strikethrough className="size-4" />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className={btn(editor.isActive("code"))}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleCode().run()}
        aria-label="Inline code"
      >
        <Code className="size-4" />
      </Button>
      <div className="mx-1 h-4 w-px bg-border" />
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className={btn(editor.isActive("bulletList"))}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        aria-label="Bullet list"
      >
        <List className="size-4" />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className={btn(editor.isActive("orderedList"))}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        aria-label="Ordered list"
      >
        <ListOrdered className="size-4" />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className={btn(editor.isActive("blockquote"))}
        disabled={disabled}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        aria-label="Quote"
      >
        <Quote className="size-4" />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className={btn(editor.isActive("link"))}
        disabled={disabled}
        onClick={promptLink}
        aria-label="Link"
      >
        <LinkIcon className="size-4" />
      </Button>
      <div className="ml-auto flex items-center gap-1">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="size-7"
          disabled={disabled || !editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
          aria-label="Undo"
        >
          <Undo className="size-4" />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="size-7"
          disabled={disabled || !editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
          aria-label="Redo"
        >
          <Redo className="size-4" />
        </Button>
      </div>
    </div>
  );
}
