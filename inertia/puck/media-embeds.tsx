import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react'

/**
 * Client-only media players (Lottie / Spline / Rive). Each library is heavy and
 * touches canvas/WebGL, so they are:
 *   • **lazy-loaded** — the runtime is a separate chunk, pulled only on pages that
 *     actually use the block (kept out of the main + SSR bundles), and
 *   • **mount-guarded** — they render a placeholder during SSR and the first client
 *     render, then mount the real player in `useEffect` (no SSR/hydration crash).
 */

const LottiePlayer = lazy(() =>
  import('@lottiefiles/dotlottie-react').then((m) => ({ default: m.DotLottieReact }))
)
const SplinePlayer = lazy(() => import('@splinetool/react-spline'))
const RivePlayer = lazy(() => import('./media-rive-inner'))

function Placeholder({ children, minHeight = 160 }: { children: ReactNode; minHeight?: number }) {
  return (
    <div
      className="flex w-full items-center justify-center rounded border border-dashed text-sm text-muted-foreground"
      style={{ minHeight }}
    >
      {children}
    </div>
  )
}

/** True only after the component has mounted on the client. */
function useMounted() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted
}

export function LottieAnimationView({
  src,
  loop,
  autoplay,
}: {
  src?: string
  loop: boolean
  autoplay: boolean
}) {
  const mounted = useMounted()
  if (!src) return <Placeholder>Add a Lottie URL (.json / .lottie)</Placeholder>
  if (!mounted) return <Placeholder>Loading animation…</Placeholder>
  return (
    <Suspense fallback={<Placeholder>Loading animation…</Placeholder>}>
      <LottiePlayer
        src={src}
        loop={loop}
        autoplay={autoplay}
        style={{ width: '100%', height: '100%', minHeight: 160 }}
      />
    </Suspense>
  )
}

export function SplineSceneView({ scene }: { scene?: string }) {
  const mounted = useMounted()
  if (!scene) return <Placeholder minHeight={300}>Add a Spline scene URL (.splinecode)</Placeholder>
  if (!mounted) return <Placeholder minHeight={300}>Loading 3D scene…</Placeholder>
  return (
    <Suspense fallback={<Placeholder minHeight={300}>Loading 3D scene…</Placeholder>}>
      <div style={{ position: 'relative', width: '100%', minHeight: 300 }}>
        <SplinePlayer scene={scene} />
      </div>
    </Suspense>
  )
}

export function RiveView({ src }: { src?: string }) {
  const mounted = useMounted()
  if (!src) return <Placeholder minHeight={240}>Add a Rive file URL (.riv)</Placeholder>
  if (!mounted) return <Placeholder minHeight={240}>Loading animation…</Placeholder>
  return (
    <Suspense fallback={<Placeholder minHeight={240}>Loading animation…</Placeholder>}>
      <div style={{ width: '100%', minHeight: 240 }}>
        <RivePlayer src={src} />
      </div>
    </Suspense>
  )
}
