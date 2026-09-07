/**
 * A code header template. A page selects it in the Header picker (it appears as
 * "example · code"); the value stored is `codetpl:example/header`. It renders
 * itself — no props. See docs/ai/custom-templates.md.
 */
export default function Header() {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        <a href="/" className="text-sm font-semibold tracking-tight text-foreground">
          Example<span className="text-primary">kit</span>
        </a>
        <nav className="flex items-center gap-6 text-sm text-muted-foreground">
          <a href="/kit-example/about" className="hover:text-foreground">
            About
          </a>
          <a href="/kit-example/pricing" className="hover:text-foreground">
            Pricing
          </a>
        </nav>
      </div>
    </header>
  )
}
