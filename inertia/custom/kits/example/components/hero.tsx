/**
 * A sub-component, imported by the kit's index.tsx with a relative path.
 *
 * Sub-components need no glob entry of their own — the bundler follows
 * index.tsx's imports; only the entry (index.tsx) is discovered by the kit glob.
 * `.kit-example-gradient` comes from the co-located styles.css.
 */
export function Hero({ title, path }: { title: string; path: string }) {
  return (
    <header>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Custom template
      </p>
      <h1 className="kit-example-gradient mt-3 text-4xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        Served at <code className="font-mono">/{path}</code>.
      </p>
    </header>
  )
}
