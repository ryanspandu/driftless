/** Pure, SSR-safe renderer for RichText block HTML (no TipTap import). */
export function RichTextView({ html }: { html?: string }) {
  return <div className="tiptap-content" dangerouslySetInnerHTML={{ __html: html || '' }} />
}
