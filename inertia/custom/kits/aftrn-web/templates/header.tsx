import { logoMark, logoWord } from '../lib/assets'

/**
 * The primary site **header template** (`.nav`) — a kit code template
 * (`codetpl:aftrn-web/header`), used by the landing and insights pages via the
 * Shell. Scroll state + the mobile hamburger are wired by `useNav()` via the ids
 * here. Links are absolute so the header works identically from any page.
 *
 * `insightsCurrent` is optional so the template also renders correctly when the
 * chrome system calls it with no props.
 */
export default function Header({ insightsCurrent = false }: { insightsCurrent?: boolean } = {}) {
  return (
    <header className="nav" id="nav">
      <div className="container nav__inner">
        <a href="/aftrn" className="nav__logo" aria-label="AFTRN home">
          <img src={logoMark} alt="" className="nav__mark" width={32} height={32} />
          <img src={logoWord} alt="AFTRN" className="nav__word" width={69} height={39} />
        </a>
        <nav className="nav__links" id="navLinks" aria-label="Primary">
          <a href="/aftrn#services">Services</a>
          <a href="/portfolio">Work</a>
          <a href="/aftrn#pricing">Pricing</a>
          <a href="/aftrn#results">Results</a>
          <a href="/aftrn#faq">FAQ</a>
          <a href="/insights" {...(insightsCurrent ? { 'aria-current': 'page' as const } : {})}>
            Insights
          </a>
          <a href="tel:+14155550132" className="nav__phone">
            (415) 555-0132
          </a>
          <a href="#contact" className="btn btn--sm btn--primary nav__cta">
            Book a free call
          </a>
        </nav>
        <button
          className="nav__toggle"
          id="navToggle"
          aria-label="Open menu"
          aria-expanded="false"
          aria-controls="navLinks"
        >
          <span />
          <span />
          <span />
        </button>
      </div>
    </header>
  )
}
