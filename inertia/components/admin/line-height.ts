import { Extension, type CommandProps } from '@tiptap/core'

/**
 * Block-level line-height. The bundled `LineHeight` from
 * `@tiptap/extension-text-style` applies the value to an inline `textStyle`
 * span, which does NOT change paragraph spacing. This sets `line-height` as a
 * node attribute on paragraph/heading instead, rendered as an inline `style`
 * (so it round-trips through the saved HTML and matches the public page).
 *
 * Reuses the `setLineHeight` / `unsetLineHeight` command names typed by the
 * text-style package's module augmentation.
 */
export const BlockLineHeight = Extension.create({
  name: 'blockLineHeight',

  addOptions() {
    return { types: ['paragraph', 'heading'] as string[] }
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (element: HTMLElement) => element.style.lineHeight || null,
            renderHTML: (attributes: Record<string, unknown>) => {
              const lh = attributes.lineHeight
              if (!lh) return {}
              return { style: `line-height: ${String(lh)}` }
            },
          },
        },
      },
    ]
  },

  addCommands() {
    const setOnBlocks =
      (lineHeight: string | null) =>
      ({ state, tr, dispatch }: CommandProps) => {
        const { from, to } = state.selection
        let changed = false
        state.doc.nodesBetween(from, to, (node, pos) => {
          if (this.options.types.includes(node.type.name)) {
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, lineHeight })
            changed = true
          }
        })
        if (changed && dispatch) dispatch(tr)
        return changed
      }

    return {
      setLineHeight: (lineHeight: string) => setOnBlocks(lineHeight),
      unsetLineHeight: () => setOnBlocks(null),
    }
  },
})
