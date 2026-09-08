import { Shell } from '../components/shell'
import { usePortfolioScripts } from '../lib/use-portfolio-scripts'
import { BuiltWithLogos, ConnectsLogos } from '../components/cta-logos'

export const path = 'portfolio'
export const title = 'AFTRN Portfolio · Web, AI Automation & SEO/GEO Work'

export default function AftrnPortfolio() {
  usePortfolioScripts()
  return (
    <Shell header="pnav" backHref="/aftrn" backLabel="Back to site">
      <main>
        {/* HERO */}
        <section className="phero">
          <div className="phero__bg" aria-hidden="true"></div>
          <div className="container phero__inner">
            <span className="pill reveal" data-reveal><span className="pill__dot"></span> Selected work &amp; concept builds</span>
            <h1 className="phero__title reveal" data-reveal>Proof we can build, automate &amp; rank.</h1>
            <p className="phero__sub reveal" data-reveal>A mix of products we've shipped and concept builds
              that show exactly how we'd approach web, AI automation, and SEO/GEO for a business like yours.</p>
            <div className="phero__legend reveal" data-reveal>
              <span className="legend"><span className="legend__dot legend__dot--real"></span> Real product / shipped</span>
              <span className="legend"><span className="legend__dot legend__dot--concept"></span> Concept build (demo)</span>
            </div>
            <div className="phero__fan reveal" data-reveal aria-hidden="true">
              <div className="herocursor" aria-hidden="true">
                <span className="herocursor__ring"></span>
                <svg className="herocursor__ptr" width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M5 3l6 15 2.1-6.1L19.2 9.8 5 3z" fill="#fff" stroke="#1a1613" strokeWidth="1.4" strokeLinejoin="round" /></svg>
              </div>
              <div className="phero__tilt">
                <div className="fancard fancard--l2"><div className="fancard__bar"><span></span><span></span><span></span></div><div className="fancard__body"><div className="fancard__img fancard__img--seo"></div><div className="fancard__ln fancard__ln--red"></div><div className="fancard__ln fancard__ln--sh"></div></div></div>
                <div className="fancard fancard--r2"><div className="fancard__bar"><span></span><span></span><span></span></div><div className="fancard__body"><div className="fancard__img fancard__img--ai"></div><div className="fancard__ln fancard__ln--red"></div><div className="fancard__ln fancard__ln--sh"></div></div></div>
                <div className="fancard fancard--l1"><div className="fancard__bar"><span></span><span></span><span></span></div><div className="fancard__body"><div className="fancard__img fancard__img--ai"></div><div className="fancard__ln fancard__ln--red"></div><div className="fancard__ln"></div><div className="fancard__ln fancard__ln--sh"></div></div></div>
                <div className="fancard fancard--r1"><div className="fancard__bar"><span></span><span></span><span></span></div><div className="fancard__body"><div className="fancard__img fancard__img--web"></div><div className="fancard__ln fancard__ln--red"></div><div className="fancard__ln"></div><div className="fancard__ln fancard__ln--sh"></div></div></div>
                <div className="fancard fancard--c"><div className="fancard__bar"><span></span><span></span><span></span></div><div className="fancard__body"><div className="fancard__img fancard__img--web"></div><div className="fancard__ln fancard__ln--red"></div><div className="fancard__ln"></div><div className="fancard__ln fancard__ln--sh"></div></div></div>
              </div>
            </div>
          </div>
        </section>

        {/* GRID */}
        <section className="section" style={{ paddingTop: 18, paddingBottom: 84 }}>
          <div className="worktools">
            <div className="container worktools__inner">
              <div className="worktools__head">
                <h2 className="worktools__title">Selected work</h2>
                <p className="worktools__sub">Real client builds and clearly badged concept projects across web, AI, and SEO/GEO.</p>
                <div className="wt-legend">
                  <span className="wt-leg"><span className="wt-dot wt-dot--real" aria-hidden="true"></span> Real work</span>
                  <span className="wt-leg"><span className="wt-dot wt-dot--concept" aria-hidden="true"></span> Concept &amp; demo</span>
                </div>
              </div>
              <div className="pf-tabs" role="tablist" aria-label="Filter projects">
                <button className="pf-tab is-active" data-filter="all">All work <span className="pf-tab__n">11</span></button>
                <button className="pf-tab" data-filter="web">Web Development <span className="pf-tab__n">5</span></button>
                <button className="pf-tab" data-filter="ai">AI Automation <span className="pf-tab__n">6</span></button>
                <button className="pf-tab" data-filter="seo">SEO / GEO <span className="pf-tab__n">3</span></button>
              </div>
            </div>
          </div>

          <div className="container" style={{ marginTop: 30 }}>
            <div className="pgrid" id="pgrid">

              {/* 1 Rapid Plumbing (concept, all 3) */}
              <a className="pcard reveal" data-reveal data-cat="web ai seo" href="/portfolio/case-rapid-plumbing">
                <div className="pcard__thumb pcard__thumb--web">
                  <span className="pcard__badge pcard__badge--concept"><span className="dot"></span> Concept</span>
                  <div className="pcard__win"><div className="pcard__winbar"><span></span><span></span><span></span></div><div className="pcard__winbody"><i></i><i></i><i></i><i></i></div></div>
                </div>
                <div className="pcard__body">
                  <span className="pcard__tag">Web · AI · SEO/GEO</span>
                  <h3 className="pcard__title">Rapid Plumbing Co.</h3>
                  <p className="pcard__text">A full concept build: booking-ready website, AI receptionist, and SEO/GEO so the business wins Google and AI answers.</p>
                  <span className="pcard__link">View case study →</span>
                </div>
              </a>

              {/* 2 Bright Smile Dental (concept, web+ai) */}
              <a className="pcard reveal" data-reveal data-cat="web ai" href="/portfolio/case-bright-smile">
                <div className="pcard__thumb pcard__thumb--web">
                  <span className="pcard__badge pcard__badge--concept"><span className="dot"></span> Concept</span>
                  <div className="pcard__win"><div className="pcard__winbar"><span></span><span></span><span></span></div><div className="pcard__winbody"><i></i><i></i><i></i><i></i></div></div>
                </div>
                <div className="pcard__body">
                  <span className="pcard__tag">Web · AI</span>
                  <h3 className="pcard__title">Bright Smile Dental</h3>
                  <p className="pcard__text">A clean clinic website with an AI booking assistant that answers patients and fills the calendar 24/7.</p>
                  <span className="pcard__link">View case study →</span>
                </div>
              </a>

              {/* 3 Bareroot Skin Co (concept, ecom) */}
              <a className="pcard reveal" data-reveal data-cat="web" href="/portfolio/case-bareroot">
                <div className="pcard__thumb pcard__thumb--ecom">
                  <span className="pcard__badge pcard__badge--concept"><span className="dot"></span> Concept</span>
                  <div className="pcard__win"><div className="pcard__winbar"><span></span><span></span><span></span></div><div className="pcard__winbody"><i></i><i></i><i></i><i></i></div></div>
                </div>
                <div className="pcard__body">
                  <span className="pcard__tag">E-commerce</span>
                  <h3 className="pcard__title">Bareroot Skin Co.</h3>
                  <p className="pcard__text">A conversion-focused Shopify storefront concept for a clean-beauty DTC brand, built on a reusable theme system.</p>
                  <span className="pcard__link">View case study →</span>
                </div>
              </a>

              {/* 4 Driftless (real, web) */}
              <a className="pcard reveal" data-reveal data-cat="web" href="/portfolio/case-driftless">
                <div className="pcard__thumb pcard__thumb--web">
                  <span className="pcard__badge pcard__badge--real"><span className="dot"></span> Real</span>
                  <div className="pcard__win"><div className="pcard__winbar"><span></span><span></span><span></span></div><div className="pcard__winbody"><i></i><i></i><i></i><i></i></div></div>
                </div>
                <div className="pcard__body">
                  <span className="pcard__tag">Web · Platform</span>
                  <h3 className="pcard__title">Driftless CMS</h3>
                  <p className="pcard__text">Our flagship content platform: dynamic collections, roles &amp; permissions, media library, OAuth, and PWA.</p>
                  <span className="pcard__link">View case study →</span>
                </div>
              </a>

              {/* 5 AI Receptionist (demo, ai) */}
              <a className="pcard reveal" data-reveal data-cat="ai" href="/portfolio/demo-chatbot">
                <div className="pcard__thumb pcard__thumb--ai">
                  <span className="pcard__badge pcard__badge--concept"><span className="dot"></span> Live demo</span>
                  <div className="pcard__win"><div className="pcard__winbar"><span></span><span></span><span></span></div><div className="pcard__winbody"><i></i><i></i><i></i><i></i></div></div>
                </div>
                <div className="pcard__body">
                  <span className="pcard__tag">AI Automation</span>
                  <h3 className="pcard__title">AI Receptionist</h3>
                  <p className="pcard__text">Try a working demo: an AI chatbot trained on a business that answers questions, qualifies, and books.</p>
                  <span className="pcard__link">Try the demo →</span>
                </div>
              </a>

              {/* AI Automation explainer (guide, ai) */}
              <a className="pcard reveal" data-reveal data-cat="ai" href="/portfolio/ai-automation">
                <div className="pcard__thumb pcard__thumb--ai">
                  <span className="pcard__badge pcard__badge--concept"><span className="dot"></span> Guide</span>
                  <div className="pcard__win"><div className="pcard__winbar"><span></span><span></span><span></span></div><div className="pcard__winbody"><i></i><i></i><i></i><i></i></div></div>
                </div>
                <div className="pcard__body">
                  <span className="pcard__tag">AI Automation</span>
                  <h3 className="pcard__title">How our AI automation works</h3>
                  <p className="pcard__text">The full flow, the tools we build on, and everything we connect. Transparent, no black box.</p>
                  <span className="pcard__link">Read the breakdown →</span>
                </div>
              </a>

              {/* 6 Fintari (real, ai) */}
              <a className="pcard reveal" data-reveal data-cat="ai" href="/portfolio/case-fintari">
                <div className="pcard__thumb pcard__thumb--ai">
                  <span className="pcard__badge pcard__badge--real"><span className="dot"></span> Real</span>
                  <div className="pcard__win"><div className="pcard__winbar"><span></span><span></span><span></span></div><div className="pcard__winbody"><i></i><i></i><i></i><i></i></div></div>
                </div>
                <div className="pcard__body">
                  <span className="pcard__tag">AI · Mobile</span>
                  <h3 className="pcard__title">Fintari</h3>
                  <p className="pcard__text">A finance app with on-device AI: scan a receipt and it parses items, totals, and categories automatically.</p>
                  <span className="pcard__link">View case study →</span>
                </div>
              </a>

              {/* 7 Poplink (real, seo) */}
              <a className="pcard reveal" data-reveal data-cat="seo" href="/portfolio/case-poplink">
                <div className="pcard__thumb pcard__thumb--seo">
                  <span className="pcard__badge pcard__badge--real"><span className="dot"></span> Real</span>
                  <div className="pcard__win"><div className="pcard__winbar"><span></span><span></span><span></span></div><div className="pcard__winbody"><i></i><i></i><i></i><i></i></div></div>
                </div>
                <div className="pcard__body">
                  <span className="pcard__tag">SEO · Performance</span>
                  <h3 className="pcard__title">Poplink</h3>
                  <p className="pcard__text">A fast Astro landing engine with server-side attribution, Meta Pixel + Conversions API, and clean tracking.</p>
                  <span className="pcard__link">View case study →</span>
                </div>
              </a>

              {/* 8 Locus CMS (real, web, extra) */}
              <a className="pcard reveal" data-reveal data-cat="web" href="/aftrn#contact">
                <div className="pcard__thumb pcard__thumb--web">
                  <span className="pcard__badge pcard__badge--real"><span className="dot"></span> Real</span>
                  <div className="pcard__win"><div className="pcard__winbar"><span></span><span></span><span></span></div><div className="pcard__winbody"><i></i><i></i><i></i><i></i></div></div>
                </div>
                <div className="pcard__body">
                  <span className="pcard__tag">Web · Headless CMS</span>
                  <h3 className="pcard__title">Locus CMS</h3>
                  <p className="pcard__text">A modern headless CMS (Bun/Elysia + SvelteKit) with a clean editor and API-first content.</p>
                  <span className="pcard__link">Ask about this →</span>
                </div>
              </a>

              {/* 9 sscrawler (real, ai, extra) */}
              <a className="pcard reveal" data-reveal data-cat="ai" href="/aftrn#contact">
                <div className="pcard__thumb pcard__thumb--ai">
                  <span className="pcard__badge pcard__badge--real"><span className="dot"></span> Real</span>
                  <div className="pcard__win"><div className="pcard__winbar"><span></span><span></span><span></span></div><div className="pcard__winbody"><i></i><i></i><i></i><i></i></div></div>
                </div>
                <div className="pcard__body">
                  <span className="pcard__tag">AI · Automation pipeline</span>
                  <h3 className="pcard__title">Social Crawler</h3>
                  <p className="pcard__text">An automated data pipeline (job queue + workers) that collects and dashboards content across platforms.</p>
                  <span className="pcard__link">Ask about this →</span>
                </div>
              </a>

              {/* 10 SERP Monitor (real, seo, extra) */}
              <a className="pcard reveal" data-reveal data-cat="seo" href="/aftrn#contact">
                <div className="pcard__thumb pcard__thumb--seo">
                  <span className="pcard__badge pcard__badge--real"><span className="dot"></span> Real</span>
                  <div className="pcard__win"><div className="pcard__winbar"><span></span><span></span><span></span></div><div className="pcard__winbody"><i></i><i></i><i></i><i></i></div></div>
                </div>
                <div className="pcard__body">
                  <span className="pcard__tag">SEO · Tooling</span>
                  <h3 className="pcard__title">SERP Monitor</h3>
                  <p className="pcard__text">An internal rank tracker that monitors Google keyword positions over time with CSV export.</p>
                  <span className="pcard__link">Ask about this →</span>
                </div>
              </a>

            </div>

            <p className="cs-result-note reveal" data-reveal style={{ textAlign: 'center', marginTop: 28 }}>
              Concept builds are demonstrations of our approach, not paid client work. Client case studies
              will be added here as engagements complete.
            </p>
          </div>
        </section>

        {/* CTA */}
        <section className="section" style={{ paddingTop: 10 }}>
          <div className="container">
            <div className="cta cta--blue reveal" data-reveal>
              <div className="cta__bg" aria-hidden="true"><span className="cta__grid"></span><span className="cta__glow"></span><span className="cta__ring"></span></div>
              <div className="cta__inner">
                <div className="cta__proof"><span className="cta__proof-label">Free 15-minute call · no pressure, no contracts</span></div>
                <h2 className="cta__title">Want work like this for your business?</h2>
                <p className="cta__sub">Book a free 15-minute call and we'll show you exactly how we'd build,
                  automate, and rank it. No pressure, no contracts.</p>
                <div className="cta__actions">
                  <a href="/aftrn#contact" className="btn btn--primary btn--lg">Book a free call</a>
                  <a href="/aftrn" className="cta__phone">or back to the main site</a>
                </div>
                <div className="cta__trust">
                  <div className="cta__trust-row">
                    <span className="cta__trust-label">Real products we've shipped</span>
                    <span className="cta__trust-items">
                      <a href="/portfolio/case-driftless">Driftless</a>
                      <a href="/portfolio/case-poplink">Poplink</a>
                      <a href="/portfolio/case-fintari">Fintari</a>
                    </span>
                  </div>
                  <div className="cta__trust-row">
                    <span className="cta__trust-label">Built with</span>
                    <BuiltWithLogos />
                    <span className="cta__trust-note">plus LLM + RAG · JSON-LD schema · GA4</span>
                  </div>
                  <div className="cta__trust-row">
                    <span className="cta__trust-label">Connects with your CRM &amp; tools</span>
                    <ConnectsLogos />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </Shell>
  )
}
