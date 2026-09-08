import { Shell } from '../components/shell'
import { usePortfolioScripts } from '../lib/use-portfolio-scripts'
import { BuiltWithLogos, ConnectsLogos } from '../components/cta-logos'

export const path = 'portfolio/case-rapid-plumbing'
export const title = 'Rapid Plumbing Co. (Concept) · AFTRN'

export default function CaseRapidPlumbing() {
  usePortfolioScripts()
  return (
    <Shell header="pnav" backHref="/portfolio" backLabel="All work">
      <main>
        <section className="cs-hero">
          <div className="container">
            <div className="cs-badges reveal" data-reveal>
              <span className="cs-badge cs-badge--concept"><span className="dot"></span> Concept build</span>
              <span className="cs-badge cs-badge--svc">Web</span>
              <span className="cs-badge cs-badge--svc">AI Automation</span>
              <span className="cs-badge cs-badge--svc">SEO / GEO</span>
            </div>
            <h1 className="cs-hero__title reveal" data-reveal>Rapid Plumbing Co.</h1>
            <p className="cs-hero__sub reveal" data-reveal>A full concept build for a local plumber: a website
              that turns visitors into calls, an AI receptionist that never misses a lead, and SEO/GEO that
              gets them found on Google and in AI answers. This is how we'd approach all three services for
              one business.</p>
          </div>
        </section>

        <section className="section" style={{ paddingTop: 20 }}>
          <div className="container">
            <div className="cs-body">

              {/* WEB */}
              <div className="cs-block reveal" data-reveal>
                <div className="cs-block__media">
                  <div className="browser" aria-hidden="true">
                    <div className="browser__bar"><span className="browser__dot"></span><span className="browser__dot"></span><span className="browser__dot"></span><span className="browser__url">rapidplumbing.co</span></div>
                    <div className="browser__body">
                      <div className="bmock__nav"><span className="bmock__logo"></span><span className="bmock__link"></span><span className="bmock__link"></span><span className="bmock__cta"></span></div>
                      <div className="bmock__hero">
                        <div className="bmock__htext"><span className="bmock__h"></span><span className="bmock__h bmock__h--sm"></span><span className="bmock__p"></span><span className="bmock__p bmock__p--sm"></span><span className="bmock__btn">Call now</span></div>
                        <div className="bmock__img"></div>
                      </div>
                      <div className="bmock__cards"><span></span><span></span><span></span></div>
                    </div>
                    <div className="browser__badge">Loads in 0.9s</div>
                  </div>
                </div>
                <div className="cs-block__body">
                  <h2 className="cs-block__title">A website built to book jobs</h2>
                  <p className="cs-block__text">Fast, mobile-first, and conversion-focused. Click-to-call in the
                    header, service pages for every job type, and clear offers so a visitor becomes a call.</p>
                  <ul className="cs-checks">
                    <li><span className="tick">✓</span> Click-to-call &amp; online booking</li>
                    <li><span className="tick">✓</span> Service &amp; city pages for local search</li>
                    <li><span className="tick">✓</span> Reviews + trust badges above the fold</li>
                    <li><span className="tick">✓</span> Speed &amp; Core Web Vitals tuned</li>
                  </ul>
                </div>
              </div>

              {/* AI */}
              <div className="cs-block cs-block--reverse reveal" data-reveal>
                <div className="cs-block__media">
                  <div className="chat" data-chat>
                    <div className="chat__head">
                      <span className="chat__avatar">AI</span>
                      <span className="chat__who"><b>Rapid Plumbing Co.</b><span>AI receptionist · online</span></span>
                    </div>
                    <div className="chat__log" aria-live="polite"></div>
                    <div className="chat__quick">
                      <button className="chat__chip" data-q="hours">Your hours?</button>
                      <button className="chat__chip" data-q="quote">Drain cleaning cost?</button>
                      <button className="chat__chip" data-q="book">Book a visit</button>
                      <button className="chat__chip" data-q="emergency">Emergency!</button>
                    </div>
                  </div>
                </div>
                <div className="cs-block__body">
                  <h2 className="cs-block__title">An AI receptionist that never sleeps</h2>
                  <p className="cs-block__text">Trained on the business's services, pricing, and hours, then wired
                    to text-back and booking. It answers instantly, qualifies the lead, and puts the job on the
                    calendar, day or night.</p>
                  <ul className="cs-checks">
                    <li><span className="tick">✓</span> Missed-call to instant text-back</li>
                    <li><span className="tick">✓</span> Answers FAQs from the business's own info</li>
                    <li><span className="tick">✓</span> Books appointments 24/7</li>
                    <li><span className="tick">✓</span> n8n workflows for follow-up &amp; reviews</li>
                  </ul>
                  <p className="cs-block__text" style={{ marginTop: 16 }}><a className="cs-hero__link" href="/portfolio/demo-chatbot">Open the full chatbot demo →</a></p>
                </div>
              </div>

              {/* SEO/GEO */}
              <div className="cs-block reveal" data-reveal>
                <div className="cs-block__media">
                  <div className="aidemo">
                    <div className="aidemo__bar" aria-hidden="true">
                      <span className="aidemo__chip aidemo__chip--on">ChatGPT</span>
                      <span className="aidemo__chip">Gemini</span>
                      <span className="aidemo__chip">Perplexity</span>
                    </div>
                    <p className="aidemo__q">"Who's the best emergency plumber near me?"</p>
                    <div className="aidemo__a">
                      <span className="aidemo__text">For 24/7 emergency plumbing in Austin, an AI assistant might recommend <b>Rapid Plumbing Co.</b> for its fast response times and strong local reviews.</span>
                    </div>
                    <p className="aidemo__src" aria-hidden="true">Sources: rapidplumbing.co · Google Business · Yelp</p>
                  </div>
                </div>
                <div className="cs-block__body">
                  <h2 className="cs-block__title">Found on Google, and named by AI</h2>
                  <p className="cs-block__text">Local SEO to win the map pack, plus GEO so AI assistants recommend
                    the business by name when customers ask.</p>
                  <ul className="cs-checks">
                    <li><span className="tick">✓</span> Google Business + map-pack targeting</li>
                    <li><span className="tick">✓</span> Entity pages + JSON-LD schema for AI</li>
                    <li><span className="tick">✓</span> Citable answer content + <code style={{ fontFamily: 'ui-monospace,Menlo,monospace', background: 'var(--red-soft)', color: 'var(--red-deep)', padding: '1px 6px', borderRadius: 6, fontSize: '.85em' }}>/llms.txt</code></li>
                    <li><span className="tick">✓</span> Citation tracking in ChatGPT &amp; Perplexity</li>
                  </ul>
                </div>
              </div>

            </div>

            {/* OUTCOME */}
            <div className="reveal" data-reveal style={{ marginTop: 40 }}>
              <h2 className="cs-block__title" style={{ textAlign: 'center' }}>What this unlocks</h2>
              <div className="cs-results" style={{ marginTop: 22 }}>
                <div className="stat"><span className="stat__num">24/7</span><span className="stat__label">Lead capture &amp; booking</span></div>
                <div className="stat"><span className="stat__num">0</span><span className="stat__label">Missed calls go unanswered</span></div>
                <div className="stat"><span className="stat__num">3-in-1</span><span className="stat__label">Web + AI + SEO, one team</span></div>
              </div>
              <p className="cs-result-note" style={{ textAlign: 'center' }}>Illustrative goals for this concept build, not measured client results.</p>
            </div>

            <div className="cs-stack reveal" data-reveal style={{ marginTop: 34, justifyContent: 'center' }}>
              <span className="cs-stack__chip">HTML/CSS/JS</span>
              <span className="cs-stack__chip">n8n</span>
              <span className="cs-stack__chip">LLM + RAG</span>
              <span className="cs-stack__chip">JSON-LD schema</span>
              <span className="cs-stack__chip">Google Business</span>
              <span className="cs-stack__chip">GA4</span>
            </div>
          </div>
        </section>

        <section className="section" style={{ paddingTop: 20 }}>
          <div className="container">
            <div className="cta cta--blue reveal" data-reveal>
              <div className="cta__bg" aria-hidden="true"><span className="cta__grid"></span><span className="cta__glow"></span><span className="cta__ring"></span></div>
              <div className="cta__inner">
                <div className="cta__proof"><span className="cta__proof-label">Free 15-minute call · no pressure, no contracts</span></div>
                <h2 className="cta__title">Want the full package for your business?</h2>
                <p className="cta__sub">Website, AI automation, and SEO/GEO, built and handled by one team. Book a
                  free call and we'll map it out.</p>
                <div className="cta__actions">
                  <a href="/aftrn#contact" className="btn btn--primary btn--lg">Book a free call</a>
                  <a href="/portfolio/case-bright-smile" className="cta__phone">next: Bright Smile Dental →</a>
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
