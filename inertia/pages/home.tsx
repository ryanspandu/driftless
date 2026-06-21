import type { FC } from 'react'
import { Head, Link, usePage } from '@inertiajs/react'
import {
  ArrowRight,
  Blocks,
  Boxes,
  CheckCircle2,
  CloudOff,
  Gauge,
  History,
  ImageIcon,
  Quote,
  ShieldCheck,
  Sparkles,
  Star,
} from 'lucide-react'
import type { PublicContentDto } from '~/types/api'
import { buttonVariants } from '~/components/ui/button'
import { cn } from '~/lib/utils'

interface HomeProps {
  posts?: PublicContentDto[]
}

const FEATURES = [
  {
    icon: Boxes,
    title: 'Dynamic CMS collections',
    body: 'Model any content type with custom fields — no migrations, no redeploys. Build collections visually and start publishing in minutes.',
  },
  {
    icon: ShieldCheck,
    title: 'Role-based access control',
    body: 'Fine-grained permissions per role and resource. Give every teammate exactly the access they need, nothing more.',
  },
  {
    icon: ImageIcon,
    title: 'Built-in media library',
    body: 'Upload, organize, and reuse images and files across your content with a fast, searchable asset manager.',
  },
  {
    icon: CloudOff,
    title: 'Offline-first by design',
    body: 'Keep editing when the network drops. Changes queue locally and sync automatically the moment you reconnect.',
  },
  {
    icon: History,
    title: 'Revisions & drafts',
    body: 'Every change is versioned. Compare, restore, and ship with confidence — your content history is never lost.',
  },
  {
    icon: Blocks,
    title: 'Extensible plugins',
    body: 'Drop a folder, flip a switch. Add features with self-contained plugins you can enable or disable at runtime.',
  },
]

const STATS = [
  { value: '99.9%', label: 'Uptime across publishing and APIs' },
  { value: '3×', label: 'Faster content delivery for teams' },
  { value: '100%', label: 'Type-safe from database to UI' },
  { value: '10k+', label: 'Records managed without a sweat' },
]

const STEPS = [
  {
    title: 'Create your space',
    body: 'Spin up Driftless, invite your team, and assign roles in a couple of clicks.',
  },
  {
    title: 'Model your content',
    body: 'Define collections and fields that match how your team actually works.',
  },
  {
    title: 'Publish & scale',
    body: 'Ship content through fast APIs and watch it sync everywhere, online or off.',
  },
]

const TESTIMONIALS = [
  {
    quote:
      'Driftless replaced three tools for us. Our editors finally have one place to manage everything, and it just works.',
    name: 'Hanny Mason',
    role: 'Head of Content, Northwind',
  },
  {
    quote:
      'The offline editing is magic. The team keeps moving on flaky connections and nothing is ever lost.',
    name: 'Liam Parker',
    role: 'Product Lead, Cortex',
  },
  {
    quote:
      'Permissions and revisions gave us the guardrails we needed to let the whole org contribute safely.',
    name: 'Emma Collins',
    role: 'Operations, Brightlane',
  },
]

const Home: FC<HomeProps> = ({ posts = [] }) => {
  const { props } = usePage<{ user?: { id?: number } }>()
  const primaryCta = props.user
    ? { href: '/admin/dashboard', label: 'Go to dashboard' }
    : { href: '/register', label: 'Get started free' }

  return (
    <div className="flex flex-col">
      <Head title="Driftless — Simplify content management" />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary/15 via-primary/5 to-background" />
        <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-[44rem] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative mx-auto max-w-5xl px-6 pt-28 pb-12 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="size-3.5" />
            The content platform for fast-moving teams
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-balance text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            Simplify content management.
            <br />
            <span className="text-primary">Boost productivity.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg">
            Model, manage, and publish content from one fast, offline-first workspace — built for
            teams that move quickly and ship often.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href={primaryCta.href} className={cn(buttonVariants({ size: 'lg' }), 'gap-2')}>
              {primaryCta.label}
              <ArrowRight className="size-4" />
            </Link>
            <Link href="/login" className={cn(buttonVariants({ variant: 'outline', size: 'lg' }))}>
              Book a demo
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            No credit card required · Free to get started
          </p>
        </div>

        {/* App preview */}
        <div className="relative mx-auto -mb-px max-w-4xl px-6">
          <AppPreview />
        </div>
      </section>

      {/* Logos */}
      <section className="border-y border-border bg-muted/30">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 px-6 py-10 sm:flex-row sm:justify-between">
          <p className="max-w-[12rem] text-center text-sm text-muted-foreground sm:text-left">
            Trusted by the globe&apos;s leading innovative teams
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 opacity-60">
            {['IPSUM', 'LogoIpsum', 'Acme', 'Northwind', 'Cortex'].map((logo) => (
              <span
                key={logo}
                className="text-lg font-semibold tracking-tight text-muted-foreground"
              >
                {logo}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-16 px-6 py-20">
        <SectionHeading
          eyebrow="Features"
          title="Unlock premium benefits with advanced features"
          subtitle="Everything you need to manage content at scale — designed to be powerful without getting in your way."
        />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-border bg-card p-6 transition-shadow hover:shadow-lg"
            >
              <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <f.icon className="size-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section id="why" className="scroll-mt-16 border-y border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <SectionHeading
            eyebrow="Why teams choose Driftless"
            title="Trusted to help teams do their best work"
            subtitle="Built for performance and reliability, so your content — and your team — never slows down."
          />
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label} className="rounded-2xl border border-border bg-card p-6">
                <div className="text-3xl font-bold tracking-tight text-primary sm:text-4xl">
                  {s.value}
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <SectionHeading
          eyebrow="Get started"
          title="Up and running in 3 easy steps"
          subtitle="A guided onboarding experience designed for speed and simplicity."
        />
        <div className="mt-12 grid items-center gap-10 lg:grid-cols-2">
          <div className="order-2 lg:order-1">
            <ol className="space-y-4">
              {STEPS.map((step, i) => (
                <li
                  key={step.title}
                  className="flex gap-4 rounded-2xl border border-border bg-card p-5"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {String(i + 1).padStart(2, '0')}
                  </div>
                  <div>
                    <h3 className="font-semibold">{step.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="order-1 lg:order-2">
            <div className="rounded-3xl bg-gradient-to-br from-primary/20 to-primary/5 p-6">
              <AppPreview compact />
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="scroll-mt-16 border-y border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <SectionHeading
            eyebrow="Success stories"
            title="Real results, real impact"
            subtitle="Real-world teams shipping more with less friction."
          />
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {TESTIMONIALS.map((t) => (
              <figure
                key={t.name}
                className="flex flex-col rounded-2xl border border-border bg-card p-6"
              >
                <Quote className="size-6 text-primary/40" />
                <blockquote className="mt-3 flex-1 text-sm leading-relaxed text-foreground/90">
                  {t.quote}
                </blockquote>
                <div className="mt-5 flex items-center gap-1 text-primary">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="size-4 fill-current" />
                  ))}
                </div>
                <figcaption className="mt-4 border-t border-border pt-4">
                  <div className="text-sm font-semibold">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.role}</div>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Latest posts (real CMS content, when available) */}
      {posts.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 py-20">
          <SectionHeading eyebrow="From the blog" title="Latest updates" />
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {posts.slice(0, 3).map((p) => (
              <Link
                key={p.id}
                href={`/posts/${p.slug}`}
                className="group rounded-2xl border border-border bg-card p-6 transition-shadow hover:shadow-lg"
              >
                <h3 className="font-semibold group-hover:text-primary">{p.title}</h3>
                <p className="mt-2 text-xs text-muted-foreground">
                  {new Date(p.updatedAt).toLocaleDateString()}
                </p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                  Read more <ArrowRight className="size-3.5" />
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Final CTA */}
      <section className="px-6 py-20">
        <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl bg-primary px-8 py-16 text-center text-primary-foreground">
          <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-16 size-64 rounded-full bg-white/10 blur-2xl" />
          <h2 className="relative text-pretty text-3xl font-bold tracking-tight sm:text-4xl">
            Ready to simplify your content?
          </h2>
          <p className="relative mx-auto mt-3 max-w-xl text-sm text-primary-foreground/80 sm:text-base">
            Join the teams managing content faster with Driftless. Get started in minutes.
          </p>
          <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={primaryCta.href}
              className={cn(
                buttonVariants({ size: 'lg', variant: 'secondary' }),
                'gap-2 bg-white text-primary hover:bg-white/90'
              )}
            >
              {primaryCta.label}
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
          <span className="font-semibold text-foreground">Driftless</span>
          <span>© {new Date().getFullYear()} Driftless. All rights reserved.</span>
        </div>
      </footer>
    </div>
  )
}

function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string
  title: string
  subtitle?: string
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-primary">{eyebrow}</p>
      <h2 className="mt-2 text-balance text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
      {subtitle ? <p className="mt-3 text-pretty text-muted-foreground">{subtitle}</p> : null}
    </div>
  )
}

/** Lightweight, dependency-free mockup of the admin board (no image assets). */
function AppPreview({ compact = false }: { compact?: boolean }) {
  const columns = [
    { name: 'To Do', tone: 'bg-amber-400' },
    { name: 'In Progress', tone: 'bg-primary' },
    { name: 'In Review', tone: 'bg-violet-400' },
    { name: 'Completed', tone: 'bg-emerald-400' },
  ]
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-primary/10">
      {/* Browser chrome */}
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-red-400" />
        <span className="size-2.5 rounded-full bg-amber-400" />
        <span className="size-2.5 rounded-full bg-emerald-400" />
        <div className="ml-3 flex-1">
          <div className="mx-auto h-5 w-40 rounded-md bg-background/70" />
        </div>
      </div>
      <div className="flex">
        {/* Sidebar */}
        {!compact && (
          <div className="hidden w-40 shrink-0 border-r border-border p-4 sm:block">
            <div className="flex items-center gap-2">
              <div className="size-6 rounded-md bg-primary" />
              <div className="h-3 w-16 rounded bg-muted" />
            </div>
            <div className="mt-5 space-y-2.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="size-3.5 rounded bg-muted" />
                  <div
                    className="h-2.5 rounded bg-muted"
                    style={{ width: `${50 + ((i * 13) % 40)}%` }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Board */}
        <div className="flex-1 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="h-3.5 w-24 rounded bg-foreground/80" />
            <div className="flex items-center gap-1.5">
              <Gauge className="size-3.5 text-muted-foreground" />
              <div className="h-2.5 w-10 rounded bg-muted" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {columns.map((col) => (
              <div key={col.name} className="rounded-lg bg-muted/40 p-2">
                <div className="mb-2 flex items-center gap-1.5">
                  <span className={cn('size-2 rounded-full', col.tone)} />
                  <div className="h-2 w-12 rounded bg-muted" />
                </div>
                <div className="space-y-2">
                  {Array.from({ length: col.name === 'Completed' ? 1 : 2 }).map((_, i) => (
                    <div key={i} className="rounded-md border border-border bg-card p-2">
                      <div className="h-2 w-3/4 rounded bg-foreground/15" />
                      <div className="mt-1.5 h-2 w-1/2 rounded bg-muted" />
                      <div className="mt-2.5 flex items-center gap-1">
                        <CheckCircle2 className="size-3 text-emerald-500" />
                        <div className="h-1.5 w-8 rounded bg-muted" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Home
