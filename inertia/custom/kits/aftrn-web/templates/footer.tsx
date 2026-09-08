import { logoWord } from '../lib/assets'

/**
 * The shared site **footer template** — a kit code template
 * (`codetpl:aftrn-web/footer`), used by every page via the Shell. Links are
 * absolute. Renders itself with no props.
 */
export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer__inner">
        <div className="footer__brand">
          <img src={logoWord} alt="AFTRN" width={69} height={39} />
          <p>
            Web development, AI automation, and SEO/GEO for local service businesses and custom
            projects across the US.
          </p>
          <a href="mailto:hello@aftrn.com" className="footer__mail">
            hello@aftrn.com
          </a>
        </div>
        <nav className="footer__col" aria-label="Services">
          <h4>Services</h4>
          <a href="/aftrn#web">Web Development</a>
          <a href="/aftrn#ai">AI Automation</a>
          <a href="/aftrn#seo">SEO / GEO</a>
        </nav>
        <nav className="footer__col" aria-label="Company">
          <h4>Company</h4>
          <a href="/portfolio">Work</a>
          <a href="/insights">Insights</a>
          <a href="/aftrn#pricing">Pricing</a>
          <a href="/aftrn#results">Results</a>
          <a href="/aftrn#faq">FAQ</a>
        </nav>
        <nav className="footer__col" aria-label="Industries">
          <h4>Who we help</h4>
          <a href="#contact">Plumbing &amp; HVAC</a>
          <a href="#contact">Dental &amp; Med Spa</a>
          <a href="#contact">Custom projects</a>
        </nav>
      </div>
      <div className="container footer__bar">
        <span>
          &copy; <span id="year">{new Date().getFullYear()}</span> AFTRN. All rights reserved.
        </span>
        <span className="footer__made">Made in the USA &middot; No contracts</span>
      </div>
    </footer>
  )
}
