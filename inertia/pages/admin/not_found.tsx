import { Link } from '@inertiajs/react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '~/components/ui/button'

/** Friendly "page not found" illustration — a tilted document being searched. */
function NotFoundIllustration() {
  return (
    <svg
      viewBox="0 0 320 240"
      fill="none"
      role="img"
      aria-label="Page not found illustration"
      className="h-auto w-60 max-w-full"
    >
      <ellipse cx="160" cy="138" rx="124" ry="92" className="fill-primary/5" />
      <circle cx="54" cy="66" r="8" className="fill-primary/15" />
      <circle cx="272" cy="58" r="5" className="fill-primary/20" />
      <circle cx="282" cy="182" r="9" className="fill-primary/10" />
      <circle cx="44" cy="170" r="4" className="fill-primary/20" />

      {/* Back document (tilted) */}
      <rect
        x="92"
        y="56"
        width="150"
        height="122"
        rx="14"
        transform="rotate(-7 167 117)"
        className="fill-card stroke-border"
        strokeWidth="2"
      />

      {/* Front document */}
      <g>
        <rect
          x="98"
          y="64"
          width="150"
          height="122"
          rx="14"
          className="fill-card stroke-border"
          strokeWidth="2"
        />
        <circle cx="114" cy="80" r="3.5" className="fill-muted-foreground/40" />
        <circle cx="126" cy="80" r="3.5" className="fill-muted-foreground/30" />
        <circle cx="138" cy="80" r="3.5" className="fill-muted-foreground/20" />
        <line x1="98" y1="94" x2="248" y2="94" className="stroke-border" strokeWidth="2" />
        <rect x="114" y="110" width="78" height="9" rx="4.5" className="fill-muted" />
        <rect x="114" y="127" width="116" height="7" rx="3.5" className="fill-muted/70" />
        <rect x="114" y="141" width="94" height="7" rx="3.5" className="fill-muted/70" />
        <rect x="114" y="155" width="58" height="7" rx="3.5" className="fill-muted/50" />
      </g>

      {/* Magnifying glass */}
      <g transform="translate(206 154)">
        <line
          x1="17"
          y1="17"
          x2="40"
          y2="40"
          className="stroke-primary"
          strokeWidth="9"
          strokeLinecap="round"
        />
        <circle cx="0" cy="0" r="27" className="fill-background stroke-primary" strokeWidth="6" />
        <text
          x="0"
          y="7"
          textAnchor="middle"
          fontSize="22"
          fontWeight="700"
          className="fill-primary"
        >
          ?
        </text>
      </g>
    </svg>
  )
}

export default function AdminNotFoundPage() {
  return (
    <div className="flex min-h-[62vh] flex-col items-center justify-center px-4 text-center">
      <NotFoundIllustration />
      <p className="mt-6 text-sm font-semibold tracking-[0.2em] text-primary">404</p>
      <h1 className="mt-2 text-xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        This page doesn&apos;t exist, was moved, or has been turned off in Settings → Application.
      </p>
      <Button className="mt-6 gap-2" render={<Link href="/admin/dashboard" />}>
        <ArrowLeft className="size-4" />
        Back to dashboard
      </Button>
    </div>
  )
}
