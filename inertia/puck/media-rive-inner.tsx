import { useRive } from '@rive-app/react-canvas'

/**
 * Rive player — isolated so the heavy `@rive-app/react-canvas` runtime is only
 * pulled in via the `lazy()` boundary in `media-embeds.tsx` (client-only).
 */
export default function RiveInner({ src }: { src: string }) {
  const { RiveComponent } = useRive({ src, autoplay: true })
  return <RiveComponent style={{ width: '100%', height: '100%', minHeight: 240 }} />
}
