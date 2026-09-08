import { Shell } from '../components/shell'
import { useLandingScripts } from '../lib/use-scripts'
import { useInsightsScripts } from '../lib/use-insights-scripts'
import { BuiltWithLogos, ConnectsLogos } from '../components/cta-logos'

export const path = 'insights'
export const title = 'Insights: Guides on SEO, GEO & Getting More Customers · AFTRN'

export default function InsightsHub() {
  useLandingScripts()
  useInsightsScripts()
  return (
    <Shell header="nav" insightsCurrent>
      <main>
        <section className="section">
          <div className="container">
            <div className="section__head section__head--center reveal" data-reveal>
              <span className="eyebrow">Insights</span>
              <h1 className="section__title">Guides to getting found and getting more customers.</h1>
              <p className="section__lead">Practical, no-fluff guides on local SEO, getting recommended by AI, and turning your website into booked calls, for local service businesses and custom projects.</p>
            </div>

            <article className="ins-featured reveal" data-reveal style={{ position: 'relative' }}>
              <a className="ins-card__link" href="/insights/what-is-geo-get-recommended-by-ai"><span>Read the featured guide</span></a>
              <div className="ins-featured__cover cover--geo" aria-hidden="true"><span className="ins-cover__glow"></span><span className="ins-featured__badge">Featured guide</span><span className="ins-cover__mark">AI &amp; GEO</span></div>
              <div className="ins-featured__body">
                <span className="ins-featured__eyebrow">AI &amp; GEO</span>
                <h2 className="ins-featured__title">What is GEO, and how do you get your business recommended by ChatGPT?</h2>
                <p className="ins-featured__excerpt">The AI-era companion to SEO, explained. What Generative Engine Optimization is, how it differs from SEO, and the exact steps a small business can take to get named in AI answers.</p>
                <div className="ins-featured__meta"><span>AI &amp; GEO</span><span className="dot"></span><span>9 min read</span></div>
                <span className="btn btn--primary ins-featured__link">Read the guide</span>
              </div>
            </article>

            <div className="ins-filter" role="tablist" aria-label="Filter articles">
              <button className="ins-tab is-active" role="tab" aria-selected="true" data-filter="all">All</button>
              <button className="ins-tab" role="tab" aria-selected="false" data-filter="localseo">Local SEO</button>
              <button className="ins-tab" role="tab" aria-selected="false" data-filter="geo">AI &amp; GEO</button>
              <button className="ins-tab" role="tab" aria-selected="false" data-filter="conversion">Web &amp; Conversion</button>
            </div>

            <div className="ins-grid" id="insGrid">
              <article className="ins-card reveal" data-reveal data-cat="localseo">
                <div className="ins-card__cover cover--seo" aria-hidden="true"><span className="ins-cover__glow"></span></div>
                <div className="ins-card__body">
                  <span className="ins-card__cat">Local SEO</span>
                  <h2 className="ins-card__title">How much does local SEO cost for a small business in 2026?</h2>
                  <p className="ins-card__excerpt">A clear breakdown of DIY, freelancer, and agency pricing, what you get at each tier, and how to avoid overpaying.</p>
                  <div className="ins-card__meta"><span>8 min read</span><span className="dot"></span><time dateTime="2026-05-12">May 12, 2026</time></div>
                </div>
                <a className="ins-card__link" href="/insights/local-seo-cost-small-business"><span>Read: How much does local SEO cost for a small business in 2026?</span></a>
              </article>
              <article className="ins-card reveal" data-reveal data-cat="geo">
                <div className="ins-card__cover cover--geo" aria-hidden="true"><span className="ins-cover__glow"></span></div>
                <div className="ins-card__body">
                  <span className="ins-card__cat">AI &amp; GEO</span>
                  <h2 className="ins-card__title">What is GEO, and how do you get recommended by ChatGPT?</h2>
                  <p className="ins-card__excerpt">The AI-era companion to SEO, explained, plus the exact steps a small business can take to get named in AI answers.</p>
                  <div className="ins-card__meta"><span>9 min read</span><span className="dot"></span><time dateTime="2026-06-03">Jun 3, 2026</time></div>
                </div>
                <a className="ins-card__link" href="/insights/what-is-geo-get-recommended-by-ai"><span>Read: What is GEO, and how do you get recommended by ChatGPT?</span></a>
              </article>
              <article className="ins-card reveal" data-reveal data-cat="conversion">
                <div className="ins-card__cover cover--calls" aria-hidden="true"><span className="ins-cover__glow"></span></div>
                <div className="ins-card__body">
                  <span className="ins-card__cat">Web &amp; Conversion</span>
                  <h2 className="ins-card__title">How to get more calls for your service business</h2>
                  <p className="ins-card__excerpt">A practical playbook that turns your website, Google profile, and follow-up into more booked calls.</p>
                  <div className="ins-card__meta"><span>7 min read</span><span className="dot"></span><time dateTime="2026-06-24">Jun 24, 2026</time></div>
                </div>
                <a className="ins-card__link" href="/insights/how-to-get-more-calls-service-business"><span>Read: How to get more calls for your service business</span></a>
              </article>
            </div>
          </div>
        </section>
        <section className="section">
          <div className="container">
            <div className="cta cta--dark reveal" data-reveal>
              <div className="cta__bg" aria-hidden="true">
                <span className="cta__grid"></span>
                <span className="cta__glow"></span>
                <span className="cta__ring"></span>
              </div>

              <div className="cta__inner">
                <div className="cta__proof"><span className="cta__proof-label">New studio · now booking our founding clients</span></div>

                <h2 className="cta__title">Ready for more customers?</h2>
                <p className="cta__sub">Book a free 15-minute call. We'll audit your website, Google, and AI
                  visibility, then show you exactly how to get more calls. No pressure, no contracts.</p>

                <div className="cta__actions">
                  <a href="/aftrn#contact" className="btn btn--primary btn--lg">Book a free call</a>
                  <a href="tel:+14155550132" className="cta__phone">or call (415) 555-0132</a>
                </div>

                <ul className="cta__guarantees">
                  <li><span className="tick-w">✓</span> No contracts</li>
                  <li><span className="tick-w">✓</span> Live in ~2 weeks</li>
                  <li><span className="tick-w">✓</span> 30-day money-back</li>
                </ul>

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
