import { Megaphone } from 'lucide-react'
import type { CustomPuckBlocks } from '~/puck/custom-blocks'
import { styleFields, Box } from '~/puck/style-fields'

/**
 * Reference implementation for a custom builder block.
 *
 * Copy this file to add your own. The only requirements are the default export
 * shape and living in this folder — discovery is a build-time glob, so a new
 * file needs a front-end rebuild before it appears in the drawer.
 *
 * Spreading `styleFields` and wrapping in `<Box>` is what gives the block the
 * whole Element panel (spacing, size, background, borders…) for free; a block
 * that skips them only gets its own fields.
 */
export default {
  icons: { Callout: Megaphone },
  components: {
    Callout: {
      label: 'Callout',
      fields: {
        text: { type: 'textarea', label: 'Text' },
        tone: {
          type: 'select',
          label: 'Tone',
          options: [
            { label: 'Info', value: 'info' },
            { label: 'Warning', value: 'warning' },
          ],
        },
        ...styleFields,
      },
      defaultProps: {
        text: 'A custom React block, rendered from inertia/custom/blocks/callout.tsx.',
        tone: 'info',
        padding: '14px 16px',
        borderRadius: '10px',
      },
      render: ({ text, tone, ...s }) => (
        <Box
          s={s}
          style={{
            background: tone === 'warning' ? '#FEF3C7' : '#EFF6FF',
            color: tone === 'warning' ? '#78350F' : '#1E3A8A',
          }}
        >
          {text}
        </Box>
      ),
    },
  },
} satisfies CustomPuckBlocks
