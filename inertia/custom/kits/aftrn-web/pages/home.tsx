import { Shell } from '../components/shell'
import { useLandingScripts } from '../lib/use-scripts'
import { heroPhoto } from '../lib/assets'

export const path = 'aftrn'
export const title = 'AFTRN · Web Development, AI Automation & SEO/GEO for Local Business'

/** The AFTRN landing page (ported from index.html). */
export default function AftrnHome() {
  useLandingScripts()
  return (
    <Shell header="nav">
      <main id="top">
        {/* ===== HERO ===== */}
        <section className="hero">
          <div className="container hero__inner">
            <div className="hero__copy">
              <span className="pill reveal" data-reveal>
                <span className="pill__dot" /> Websites · AI automation · AI-era SEO
              </span>

              <h1 className="hero__title reveal" data-reveal>
                Get more customers online, on Google, and{' '}
                <span className="grad-text">in AI answers.</span>
              </h1>

              <p className="hero__sub reveal" data-reveal>
                AFTRN builds high-converting websites, sets up{' '}
                <strong>AI that answers &amp; books 24/7</strong>, and gets you found on Google{' '}
                <strong>and in AI search</strong> (ChatGPT, Gemini, Perplexity). Built for local
                service businesses and custom projects across the US.
              </p>

              <div className="hero__cta reveal" data-reveal>
                <a href="#contact" className="btn btn--primary btn--lg">
                  Book a free 15-min call
                </a>
                <a href="#services" className="btn btn--ghost btn--lg">
                  Explore services
                </a>
              </div>

              <ul className="hero__trust reveal" data-reveal>
                <li>
                  <span className="tick">✓</span> Free 15-min audit
                </li>
                <li>
                  <span className="tick">✓</span> No contracts
                </li>
                <li>
                  <span className="tick">✓</span> Live in ~2 weeks
                </li>
              </ul>
            </div>

            {/* hero visual: real photo + floating proof cards */}
            <div className="hero__visual reveal" data-reveal>
              <div className="hero__blob" aria-hidden="true" />
              <div className="hero__photo">
                <img
                  src={heroPhoto}
                  alt="Local service business owner on the job"
                  width={1200}
                  height={940}
                />
              </div>

              <div className="floatcard floatcard--booking" aria-hidden="true">
                <span className="floatcard__icon">
                  <svg
                    viewBox="0 0 24 24"
                    width="17"
                    height="17"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m5 12 4 4 10-10" />
                  </svg>
                </span>
                <div>
                  <b>New booking</b>
                  <small>Kitchen sink repair · $240</small>
                </div>
              </div>

              <div className="floatchip floatchip--calls" aria-hidden="true">
                <span className="floatchip__ai">AI</span>
                <div>
                  <b>Cited by ChatGPT</b>
                  <small>in AI answers</small>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===== TRUST / INDUSTRIES ===== */}
        <section className="trust" aria-label="Industries we serve">
          <div className="container">
            <p className="trust__label">
              Built for local service businesses and custom projects across the US
            </p>
            <ul className="trust__tags">
              <li>Plumbing</li>
              <li>Dental</li>
              <li>HVAC</li>
              <li>Roofing</li>
              <li>Med Spa</li>
              <li>Landscaping</li>
              <li>Electricians</li>
              <li>+ Custom</li>
            </ul>
          </div>
        </section>

        {/* ===== PROBLEM → SOLUTION ===== */}
        <section className="section">
          <div className="container problem">
            <div className="problem__col reveal" data-reveal>
              <span className="eyebrow eyebrow--muted">Sound familiar?</span>
              <ul className="painlist">
                <li>Your website looks outdated, or you don't have one</li>
                <li>Calls come in after hours and go straight to voicemail</li>
                <li>Competitors outrank you on Google</li>
                <li>You're invisible when customers ask ChatGPT or Google's AI</li>
              </ul>
            </div>
            <div className="problem__col problem__col--fix reveal" data-reveal>
              <span className="eyebrow">Here's the fix</span>
              <ul className="fixlist">
                <li>
                  <span className="tick">✓</span> A fast, modern website that turns visitors into
                  calls
                </li>
                <li>
                  <span className="tick">✓</span> AI that answers, books &amp; follows up 24/7
                </li>
                <li>
                  <span className="tick">✓</span> Local SEO so you rank in your city
                </li>
                <li>
                  <span className="tick">✓</span> GEO so you get recommended in AI answers
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* ===== SERVICES OVERVIEW ===== */}
        <section className="section section--alt" id="services">
          <div className="container">
            <div className="section__head section__head--center reveal" data-reveal>
              <span className="eyebrow">Our services</span>
              <h2 className="section__title">Three ways we get you more customers.</h2>
              <p className="section__lead">
                Pick one, or bundle them. Each is scoped, priced, and delivered done-for-you, with
                no jargon and no surprises.
              </p>
            </div>

            <div className="services">
              <article className="scard reveal" data-reveal>
                <div className="scard__icon">
                  <svg
                    viewBox="0 0 24 24"
                    width="24"
                    height="24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="4" width="18" height="14" rx="2" />
                    <path d="M3 8h18" />
                    <path d="M9 21h6" />
                    <path d="M12 18v3" />
                  </svg>
                </div>
                <h3 className="scard__title">Web Development</h3>
                <p className="scard__text">
                  Fast, mobile, conversion-focused websites for local trades and custom projects
                  alike.
                </p>
                <a href="#web" className="scard__link">
                  What's included →
                </a>
              </article>

              <article className="scard scard--feature reveal" data-reveal>
                <span className="scard__badge">AI-native</span>
                <div className="scard__icon scard__icon--accent">
                  <svg
                    viewBox="0 0 24 24"
                    width="24"
                    height="24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="4" y="8" width="16" height="12" rx="3" />
                    <path d="M12 8V5M9 3h6" />
                    <circle cx="9" cy="14" r="1" />
                    <circle cx="15" cy="14" r="1" />
                    <path d="M4 13H2M22 13h-2" />
                  </svg>
                </div>
                <h3 className="scard__title">AI Automation</h3>
                <p className="scard__text">
                  n8n workflows + an AI chatbot trained on your business, answering, qualifying
                  &amp; booking 24/7.
                </p>
                <a href="#ai" className="scard__link">
                  What's included →
                </a>
              </article>

              <article className="scard scard--feature reveal" data-reveal>
                <span className="scard__badge">SEO + GEO</span>
                <div className="scard__icon scard__icon--accent">
                  <svg
                    viewBox="0 0 24 24"
                    width="24"
                    height="24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path d="m21 21-4.3-4.3" />
                    <path d="m9.5 11 1 1 2.2-2.2" />
                  </svg>
                </div>
                <h3 className="scard__title">SEO / GEO</h3>
                <p className="scard__text">
                  Rank on Google <em>and</em> get cited in ChatGPT, Gemini &amp; Perplexity when
                  customers ask AI.
                </p>
                <a href="#seo" className="scard__link">
                  What's included →
                </a>
              </article>
            </div>
          </div>
        </section>

        {/* ===== SERVICE 1 · WEB DEVELOPMENT ===== */}
        <section className="section svc-sec" id="web">
          <div className="container">
            <div className="svc-row">
              <div className="svc-media reveal" data-reveal>
                <div className="browser" aria-hidden="true">
                  <div className="browser__bar">
                    <span className="browser__dot" />
                    <span className="browser__dot" />
                    <span className="browser__dot" />
                    <span className="browser__url">yourbusiness.com</span>
                  </div>
                  <div className="browser__body">
                    <div className="bmock__nav">
                      <span className="bmock__logo" />
                      <span className="bmock__link" />
                      <span className="bmock__link" />
                      <span className="bmock__cta" />
                    </div>
                    <div className="bmock__hero">
                      <div className="bmock__htext">
                        <span className="bmock__h" />
                        <span className="bmock__h bmock__h--sm" />
                        <span className="bmock__p" />
                        <span className="bmock__p bmock__p--sm" />
                        <span className="bmock__btn">Call now</span>
                      </div>
                      <div className="bmock__img" />
                    </div>
                    <div className="bmock__cards">
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                  <div className="browser__badge">Loads in 0.9s</div>
                </div>
                <p className="svc-caption">
                  Modern, mobile-first, and built to convert, live in about two weeks.
                </p>
              </div>

              <div className="svc-info reveal" data-reveal>
                <span className="eyebrow">01 · Web Development</span>
                <h2 className="svc-info__title">A website that turns visitors into customers.</h2>
                <p className="svc-info__lead">
                  Fast, modern sites for plumbers, clinics and spas, and just as good for a custom
                  project. Done for you, end to end.
                </p>

                <ul className="svc-checks">
                  <li>
                    <span className="tick">✓</span> Custom design in your brand
                  </li>
                  <li>
                    <span className="tick">✓</span> Copywriting + images
                  </li>
                  <li>
                    <span className="tick">✓</span> Mobile-first &amp; accessible
                  </li>
                  <li>
                    <span className="tick">✓</span> Click-to-call &amp; booking
                  </li>
                  <li>
                    <span className="tick">✓</span> Speed &amp; Core Web Vitals
                  </li>
                  <li>
                    <span className="tick">✓</span> On-page SEO + schema
                  </li>
                </ul>

                <div className="svc-tags">
                  <span className="svc-tag">Up to 6 pages</span>
                  <span className="svc-tag">2 revisions</span>
                  <span className="svc-tag">Live in ~2 weeks</span>
                  <span className="svc-tag">Any industry</span>
                </div>
                <p className="svc-addons">
                  Add-ons: e-commerce · booking &amp; payments · ongoing care plan
                </p>

                <div className="svc-price">
                  <span className="svc-price__amt">
                    from <strong>$600</strong> <em>one-time</em>
                  </span>
                  <a href="#contact" className="btn btn--primary">
                    Get a website quote
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===== SERVICE 2 · AI AUTOMATION ===== */}
        <section className="section section--alt svc-sec" id="ai">
          <div className="container">
            <div className="svc-row svc-row--reverse">
              <div className="svc-media reveal" data-reveal>
                <span className="svc-media__label">How a missed call becomes a booking</span>
                <div className="flowdemo" data-flow aria-hidden="true">
                  <div className="flownode">
                    <span className="flownode__ico">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.24 11 11 0 0 0 3.5.56 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11 11 0 0 0 .56 3.5 1 1 0 0 1-.24 1Z" />
                        <path d="m15 3 5 5M20 3l-5 5" />
                      </svg>
                    </span>
                    <span>Missed call</span>
                  </div>
                  <div className="flowwire">
                    <span className="flowdot" />
                  </div>
                  <div className="flownode flownode--ai">
                    <span className="flownode__ico">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect x="4" y="8" width="16" height="12" rx="3" />
                        <path d="M12 8V5M9 3h6" />
                        <circle cx="9.5" cy="14" r="1" />
                        <circle cx="14.5" cy="14" r="1" />
                      </svg>
                    </span>
                    <span>AI agent replies</span>
                  </div>
                  <div className="flowwire">
                    <span className="flowdot flowdot--2" />
                  </div>
                  <div className="flownode">
                    <span className="flownode__ico">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M21 11.5a8 8 0 0 1-11.5 7.2L4 20l1.3-4.9A8 8 0 1 1 21 11.5Z" />
                        <path d="M8.5 12h.01M12 12h.01M15.5 12h.01" />
                      </svg>
                    </span>
                    <span>Texts back &amp; books</span>
                  </div>
                  <div className="flowwire">
                    <span className="flowdot flowdot--3" />
                  </div>
                  <div className="flownode flownode--done">
                    <span className="flownode__ico">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect x="3" y="5" width="18" height="16" rx="2" />
                        <path d="M8 3v4M16 3v4M3 10h18" />
                        <path d="m8.5 15.5 2 2 4-4" />
                      </svg>
                    </span>
                    <span>Job on the calendar</span>
                  </div>
                </div>
                <p className="svc-caption">
                  Built visually in n8n and connected to your tools: reliable and easy to change as
                  you grow.
                </p>
              </div>

              <div className="svc-info reveal" data-reveal>
                <span className="eyebrow">02 · AI Automation</span>
                <h2 className="svc-info__title">
                  Put the busywork and your front desk on autopilot.
                </h2>
                <p className="svc-info__lead">
                  n8n workflows plus an AI chatbot trained on your business, so leads get answered,
                  qualified, and booked 24/7, even when you're closed.
                </p>

                <ul className="svc-checks">
                  <li>
                    <span className="tick">✓</span> Missed-call text-back
                  </li>
                  <li>
                    <span className="tick">✓</span> Lead follow-up &amp; reminders
                  </li>
                  <li>
                    <span className="tick">✓</span> Auto review requests
                  </li>
                  <li>
                    <span className="tick">✓</span> Chatbot on your info (RAG)
                  </li>
                  <li>
                    <span className="tick">✓</span> Books appointments 24/7
                  </li>
                  <li>
                    <span className="tick">✓</span> Site, WhatsApp &amp; SMS
                  </li>
                </ul>

                <div className="svc-tags">
                  <span className="svc-tag">Up to 4 workflows</span>
                  <span className="svc-tag">1 AI chatbot</span>
                  <span className="svc-tag">3 integrations</span>
                  <span className="svc-tag">Live in ~2 weeks</span>
                </div>
                <p className="svc-addons">
                  Add-ons: voice AI receptionist · extra workflows · enterprise builds
                </p>

                <div className="svc-price">
                  <span className="svc-price__amt">
                    from <strong>$750 setup</strong> <em>+ $199/mo</em>
                  </span>
                  <a href="#contact" className="btn btn--primary">
                    Automate my business
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===== SERVICE 3 · SEO / GEO ===== */}
        <section className="section svc-sec" id="seo">
          <div className="container">
            <div className="svc-row">
              <div className="svc-media reveal" data-reveal>
                <span className="svc-media__label">When a customer asks AI</span>
                <div className="aidemo" data-aidemo>
                  <div className="aidemo__bar" aria-hidden="true">
                    <span className="aidemo__chip aidemo__chip--on">ChatGPT</span>
                    <span className="aidemo__chip">Gemini</span>
                    <span className="aidemo__chip">Perplexity</span>
                  </div>
                  <p className="aidemo__q">"Who's the best emergency plumber near me?"</p>
                  <div className="aidemo__a">
                    <span
                      className="aidemo__text"
                      data-type="For 24/7 emergency plumbing in Austin, an AI assistant might recommend Rapid Plumbing Co. for its fast response times and strong local reviews."
                    />
                    <span className="aidemo__cursor" aria-hidden="true" />
                  </div>
                  <p className="aidemo__src" aria-hidden="true">
                    Sources: rapidplumbing.com · Google Business · Yelp
                  </p>
                </div>
                <p className="svc-caption">
                  GEO makes your business the answer AI gives, not the link nobody scrolls to.
                </p>
              </div>

              <div className="svc-info reveal" data-reveal>
                <span className="eyebrow">03 · SEO / GEO</span>
                <h2 className="svc-info__title">Get found on Google, and named by AI.</h2>
                <p className="svc-info__lead">
                  Local SEO to win Google's map pack, plus GEO (Generative Engine Optimization) so
                  AI assistants recommend you when customers ask.
                </p>

                <ul className="svc-checks">
                  <li>
                    <span className="tick">✓</span> Technical audit + schema
                  </li>
                  <li>
                    <span className="tick">✓</span> Local keyword research
                  </li>
                  <li>
                    <span className="tick">✓</span> Google Business + map pack
                  </li>
                  <li>
                    <span className="tick">✓</span> Entity pages + JSON-LD (GEO)
                  </li>
                  <li>
                    <span className="tick">✓</span> Cited in ChatGPT &amp; Perplexity
                  </li>
                  <li>
                    <span className="tick">✓</span> Monthly report + tracking
                  </li>
                </ul>

                <div className="svc-tags">
                  <span className="svc-tag">1 location</span>
                  <span className="svc-tag">SEO + GEO together</span>
                  <span className="svc-tag">10-15 queries</span>
                  <span className="svc-tag">Cancel anytime</span>
                </div>
                <p className="svc-addons">
                  Not included: paid ads · multi-location · national/e-commerce SEO
                </p>

                <div className="svc-price">
                  <span className="svc-price__amt">
                    from <strong>$600 setup</strong> <em>+ $549/mo</em>
                  </span>
                  <a href="#contact" className="btn btn--primary">
                    Book a free SEO/GEO audit
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===== STATS ===== */}
        <section className="section section--alt">
          <div className="container">
            <p className="statband__eyebrow reveal" data-reveal>
              What working with us means
            </p>
            <div className="statband reveal" data-reveal>
              <div className="stat">
                <span className="stat__ico">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="4" width="18" height="14" rx="2" />
                    <path d="M3 9h18" />
                    <path d="M9 21h6" />
                    <path d="M12 18v3" />
                  </svg>
                </span>
                <span className="stat__num" data-count="3">
                  0
                </span>
                <span className="stat__label">Services, one studio: web, AI &amp; SEO/GEO</span>
              </div>
              <div className="stat">
                <span className="stat__ico">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.9 8.9 0 0 1-3.9-.9L3 21l1.9-5.1A8.9 8.9 0 0 1 4 12a8.38 8.38 0 0 1 8.5-8.5A8.38 8.38 0 0 1 21 11.5z" />
                    <path d="M8.5 12h.01M12 12h.01M15.5 12h.01" />
                  </svg>
                </span>
                <span className="stat__num" data-count="24" data-suffix="/7">
                  0
                </span>
                <span className="stat__label">AI that answers &amp; books leads</span>
              </div>
              <div className="stat">
                <span className="stat__ico">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </svg>
                </span>
                <span className="stat__num" data-count="2" data-suffix=" wks">
                  0
                </span>
                <span className="stat__label">Typical time to launch</span>
              </div>
              <div className="stat">
                <span className="stat__ico">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 3l7 3v6c0 4-3 7-7 8-4-1-7-4-7-8V6l7-3z" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                </span>
                <span className="stat__num" data-count="100" data-suffix="%">
                  0
                </span>
                <span className="stat__label">Yours to keep: site, AI &amp; accounts</span>
              </div>
            </div>
          </div>
        </section>

        {/* ===== PRICING (BUNDLES) ===== */}
        <section className="section" id="pricing">
          <div className="container">
            <div className="section__head section__head--center reveal" data-reveal>
              <span className="eyebrow">Bundles</span>
              <h2 className="section__title">Save with an all-in-one package.</h2>
              <p className="section__lead">
                Prefer everything handled together? Bundle the services below, or mix &amp; match.
                One-time build, optional month-to-month plan for AI &amp; SEO/GEO.
              </p>
            </div>

            <div className="pricing">
              <article className="tier reveal" data-reveal>
                <h3 className="tier__name">Starter</h3>
                <p className="tier__for">Website</p>
                <div className="tier__price">
                  <span className="tier__from">from</span> $600
                </div>
                <p className="tier__note">one-time</p>
                <ul className="tier__feats">
                  <li>
                    <span className="tick">✓</span> Custom 5-page website
                  </li>
                  <li>
                    <span className="tick">✓</span> Copywriting + images
                  </li>
                  <li>
                    <span className="tick">✓</span> Click-to-call &amp; lead form
                  </li>
                  <li>
                    <span className="tick">✓</span> Google Business setup
                  </li>
                  <li>
                    <span className="tick">✓</span> Basic on-page SEO
                  </li>
                </ul>
                <a href="#contact" className="btn btn--ghost tier__cta">
                  Book a free call
                </a>
              </article>

              <article className="tier tier--popular reveal" data-reveal>
                <span className="tier__flag">Most popular</span>
                <h3 className="tier__name">Growth</h3>
                <p className="tier__for">Website + SEO / GEO</p>
                <div className="tier__price">
                  <span className="tier__from">from</span> $1,500
                </div>
                <p className="tier__note">one-time + from $549/mo</p>
                <ul className="tier__feats">
                  <li>
                    <span className="tick">✓</span> Everything in Starter
                  </li>
                  <li>
                    <span className="tick">✓</span> Up to 10 pages + booking
                  </li>
                  <li>
                    <span className="tick">✓</span> Local SEO: rank in your city
                  </li>
                  <li>
                    <span className="tick">✓</span> GEO: get cited in AI answers
                  </li>
                  <li>
                    <span className="tick">✓</span> Reviews + monthly reporting
                  </li>
                </ul>
                <a href="#contact" className="btn btn--primary tier__cta">
                  Book a free call
                </a>
              </article>

              <article className="tier reveal" data-reveal>
                <h3 className="tier__name">Automate</h3>
                <p className="tier__for">Website + SEO/GEO + AI</p>
                <div className="tier__price">
                  <span className="tier__from">from</span> $3,000
                </div>
                <p className="tier__note">one-time + monthly plan</p>
                <ul className="tier__feats">
                  <li>
                    <span className="tick">✓</span> Everything in Growth
                  </li>
                  <li>
                    <span className="tick">✓</span> AI chatbot trained on your business
                  </li>
                  <li>
                    <span className="tick">✓</span> n8n workflows &amp; follow-ups
                  </li>
                  <li>
                    <span className="tick">✓</span> CRM + SMS/email automations
                  </li>
                  <li>
                    <span className="tick">✓</span> Priority monthly optimization
                  </li>
                </ul>
                <a href="#contact" className="btn btn--ghost tier__cta">
                  Book a free call
                </a>
              </article>
            </div>

            <p className="pricing__fine reveal" data-reveal>
              No long-term contracts · live in ~2 weeks · 30-day money-back guarantee. Prices are
              starting points. <a href="#contact">Book a free call</a> for a custom quote.
            </p>
          </div>
        </section>

        {/* ===== RESULTS / TESTIMONIALS ===== */}
        <section className="section section--alt" id="results">
          <div className="container">
            <div className="section__head section__head--center reveal" data-reveal>
              <span className="eyebrow">Our promise</span>
              <h2 className="section__title">A fair deal, from day one.</h2>
              <p className="section__lead">
                We're a fresh studio, so you won't find inflated numbers here. What you will get is a
                straight, low-risk way to work with us.
              </p>
            </div>

            <div className="testi-grid">
              <figure className="testi reveal" data-reveal>
                <blockquote>
                  <strong>Straight pricing.</strong> Fixed, upfront quotes and month-to-month plans.
                  No lock-in, cancel anytime and keep everything we build.
                </blockquote>
                <span className="testi__metric">No contracts</span>
              </figure>
              <figure className="testi reveal" data-reveal>
                <blockquote>
                  <strong>You own it all.</strong> Your website, automations, and accounts are yours
                  from day one. We build and maintain, you stay in control.
                </blockquote>
                <span className="testi__metric">Full handover</span>
              </figure>
              <figure className="testi reveal" data-reveal>
                <blockquote>
                  <strong>A real person, fast.</strong> You talk to the people doing the work, never
                  a call center or a bot. Replies within one business day.
                </blockquote>
                <span className="testi__metric">Human support</span>
              </figure>
            </div>

            <div className="reveal" data-reveal style={{ textAlign: 'center', marginTop: 40 }}>
              <a href="/portfolio" className="btn btn--ghost btn--lg">
                See our work
              </a>
            </div>
          </div>
        </section>

        {/* ===== PROCESS ===== */}
        <section className="section">
          <div className="container">
            <div className="section__head section__head--center reveal" data-reveal>
              <span className="eyebrow">How we work</span>
              <h2 className="section__title">Three steps. We do the heavy lifting.</h2>
            </div>

            <ol className="steps">
              <li className="step reveal" data-reveal>
                <span className="step__num">1</span>
                <h3 className="step__title">Book a free call</h3>
                <p className="step__text">
                  15 minutes. We audit your website, Google presence, and AI visibility, then show
                  you where you're leaving money on the table.
                </p>
              </li>
              <li className="step reveal" data-reveal>
                <span className="step__num">2</span>
                <h3 className="step__title">We build &amp; launch</h3>
                <p className="step__text">
                  Website, automations, and SEO/GEO, set up done-for-you and usually live within two
                  weeks. You review, we handle the rest.
                </p>
              </li>
              <li className="step reveal" data-reveal>
                <span className="step__num">3</span>
                <h3 className="step__title">Grow on autopilot</h3>
                <p className="step__text">
                  More calls, more bookings, and AI that keeps working, with optional monthly
                  optimization to compound results.
                </p>
              </li>
            </ol>
          </div>
        </section>

        {/* ===== FAQ ===== */}
        <section className="section section--alt" id="faq">
          <div className="container faq-wrap">
            <div className="faq-left">
              <div className="section__head reveal" data-reveal>
                <span className="eyebrow">Questions</span>
                <h2 className="section__title">Everything you're wondering.</h2>
                <p className="section__lead">
                  Straight answers on how we work, what it costs, and what to expect.
                </p>
              </div>

              <div className="faqhelp reveal" data-reveal>
                <span className="faqhelp__chip" aria-hidden="true">
                  <svg
                    viewBox="0 0 24 24"
                    width="22"
                    height="22"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.9 8.9 0 0 1-3.9-.9L3 21l1.9-5.1A8.9 8.9 0 0 1 4 12a8.38 8.38 0 0 1 8.5-8.5A8.38 8.38 0 0 1 21 11.5z" />
                    <path d="M9 11h6M9 14h4" />
                  </svg>
                </span>
                <h3 className="faqhelp__title">Still have questions?</h3>
                <p className="faqhelp__text">
                  Book a free 15-minute call and we'll answer everything. You talk to a real person,
                  not a bot.
                </p>
                <a href="#contact" className="btn btn--primary faqhelp__cta">
                  Book a free call
                </a>
                <div className="faqhelp__foot">
                  <p className="faqhelp__meta">
                    <span className="faqhelp__dot" /> Replies within 1 business day
                  </p>
                </div>
              </div>
            </div>

            <div className="faq reveal" data-reveal>
              <details className="faq__item">
                <summary>What is GEO, and how is it different from SEO?</summary>
                <p>
                  SEO gets you ranked in Google's blue links and map pack. GEO (Generative Engine
                  Optimization) gets your business <em>named and cited</em> inside AI answers like
                  ChatGPT, Gemini, Perplexity, and Google's AI Overviews. Since AI now answers a
                  huge share of searches without a click, we do both so you're the answer either
                  way.
                </p>
              </details>
              <details className="faq__item">
                <summary>What can the AI automation actually do?</summary>
                <p>
                  We build n8n workflows (missed-call text-back, lead follow-up, review requests,
                  reporting) plus an AI chatbot trained on your own business info that answers
                  questions, qualifies leads, and books appointments 24/7 on your site, WhatsApp, or
                  SMS.
                </p>
              </details>
              <details className="faq__item">
                <summary>I'm not a plumber or dentist. Can you still help?</summary>
                <p>
                  Absolutely. We specialize in local service businesses, but we build custom
                  websites and automations for almost any business or project. Book a call and tell
                  us what you need.
                </p>
              </details>
              <details className="faq__item">
                <summary>How much does it cost?</summary>
                <p>
                  Websites start at $600 (one-time). AI Automation from $750 setup + $199/mo.
                  SEO/GEO from $600 setup + $549/mo. Bundles start at $600, and most clients land
                  between $500 and $3,000. You'll know the full price before we start.
                </p>
              </details>
              <details className="faq__item">
                <summary>Am I locked into a contract?</summary>
                <p>
                  No. Builds are one-time projects. The AI and SEO/GEO plans are month-to-month, so
                  you can cancel anytime and keep what we built.
                </p>
              </details>
              <details className="faq__item">
                <summary>I'm not tech-savvy. Is this complicated for me?</summary>
                <p>
                  Not at all. You do almost nothing. We handle design, copy, hosting, the AI setup,
                  and the SEO/GEO work. You just approve it.
                </p>
              </details>
            </div>
          </div>
        </section>

        {/* ===== INSIGHTS TEASER ===== */}
        <section className="section">
          <div className="container">
            <div
              className="section__head reveal"
              data-reveal
              style={{
                maxWidth: 'none',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-end',
                gap: 20,
                flexWrap: 'wrap',
                marginBottom: 34,
              }}
            >
              <div>
                <span className="eyebrow">Insights</span>
                <h2 className="section__title">Guides to get you found and booked.</h2>
              </div>
              <a href="/insights" className="btn btn--ghost">
                Read all insights
              </a>
            </div>
            <div className="ins-grid">
              <article className="ins-card reveal" data-reveal>
                <div className="ins-card__cover cover--geo" aria-hidden="true">
                  <span className="ins-cover__glow" />
                </div>
                <div className="ins-card__body">
                  <span className="ins-card__cat">AI &amp; GEO</span>
                  <h3 className="ins-card__title">
                    What is GEO, and how do you get recommended by ChatGPT?
                  </h3>
                  <p className="ins-card__excerpt">
                    The AI-era companion to SEO, plus the exact steps a small business can take to
                    get named in AI answers.
                  </p>
                  <div className="ins-card__meta">
                    <span>9 min read</span>
                    <span className="dot" />
                    <time dateTime="2026-06-03">Jun 3, 2026</time>
                  </div>
                </div>
                <a className="ins-card__link" href="/insights/what-is-geo-get-recommended-by-ai">
                  <span>Read: What is GEO</span>
                </a>
              </article>
              <article className="ins-card reveal" data-reveal>
                <div className="ins-card__cover cover--seo" aria-hidden="true">
                  <span className="ins-cover__glow" />
                </div>
                <div className="ins-card__body">
                  <span className="ins-card__cat">Local SEO</span>
                  <h3 className="ins-card__title">
                    How much does local SEO cost for a small business in 2026?
                  </h3>
                  <p className="ins-card__excerpt">
                    A clear breakdown of DIY, freelancer, and agency pricing, and how to avoid
                    overpaying.
                  </p>
                  <div className="ins-card__meta">
                    <span>8 min read</span>
                    <span className="dot" />
                    <time dateTime="2026-05-12">May 12, 2026</time>
                  </div>
                </div>
                <a className="ins-card__link" href="/insights/local-seo-cost-small-business">
                  <span>Read: local SEO cost</span>
                </a>
              </article>
              <article className="ins-card reveal" data-reveal>
                <div className="ins-card__cover cover--calls" aria-hidden="true">
                  <span className="ins-cover__glow" />
                </div>
                <div className="ins-card__body">
                  <span className="ins-card__cat">Web &amp; Conversion</span>
                  <h3 className="ins-card__title">
                    How to get more calls for your service business
                  </h3>
                  <p className="ins-card__excerpt">
                    A practical playbook that turns your website, Google profile, and follow-up into
                    booked calls.
                  </p>
                  <div className="ins-card__meta">
                    <span>7 min read</span>
                    <span className="dot" />
                    <time dateTime="2026-06-24">Jun 24, 2026</time>
                  </div>
                </div>
                <a className="ins-card__link" href="/insights/how-to-get-more-calls-service-business">
                  <span>Read: more calls</span>
                </a>
              </article>
            </div>
          </div>
        </section>

        {/* ===== FINAL CTA ===== */}
        <section className="section" id="contact">
          <div className="container">
            <div className="cta cta--dark reveal" data-reveal>
              <div className="cta__bg" aria-hidden="true">
                <span className="cta__grid" />
                <span className="cta__glow" />
                <span className="cta__ring" />
              </div>

              <div className="cta__inner">
                <div className="cta__proof">
                  <span className="cta__proof-label">
                    New studio · now booking our founding clients
                  </span>
                </div>

                <h2 className="cta__title">Ready for more customers?</h2>
                <p className="cta__sub">
                  Book a free 15-minute call. We'll audit your website, Google, and AI visibility,
                  then show you exactly how to get more calls. No pressure, no contracts.
                </p>

                <div className="cta__actions">
                  <a href="#contact" className="btn btn--primary btn--lg">
                    Book a free call
                  </a>
                  <a href="tel:+14155550132" className="cta__phone">
                    or call (415) 555-0132
                  </a>
                </div>

                <ul className="cta__guarantees">
                  <li>
                    <span className="tick-w">✓</span> No contracts
                  </li>
                  <li>
                    <span className="tick-w">✓</span> Live in ~2 weeks
                  </li>
                  <li>
                    <span className="tick-w">✓</span> 30-day money-back
                  </li>
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

/** Brand-partner logo strip ("Built with") — inline SVGs kept verbatim. */
export function BuiltWithLogos() {
  return (
    <span className="cta__logos">
      <svg className="cta__logo" role="img" aria-label="React" viewBox="0 0 24 24">
        <path d="M14.23 12.004a2.236 2.236 0 0 1-2.235 2.236 2.236 2.236 0 0 1-2.236-2.236 2.236 2.236 0 0 1 2.235-2.236 2.236 2.236 0 0 1 2.236 2.236zm2.648-10.69c-1.346 0-3.107.96-4.888 2.622-1.78-1.653-3.542-2.602-4.887-2.602-.41 0-.783.093-1.106.278-1.375.793-1.683 3.264-.973 6.365C1.98 8.917 0 10.42 0 12.004c0 1.59 1.99 3.097 5.043 4.03-.704 3.113-.39 5.588.988 6.38.32.187.69.275 1.102.275 1.345 0 3.107-.96 4.888-2.624 1.78 1.654 3.542 2.603 4.887 2.603.41 0 .783-.09 1.106-.275 1.374-.792 1.683-3.263.973-6.365C22.02 15.096 24 13.59 24 12.004c0-1.59-1.99-3.097-5.043-4.032.704-3.11.39-5.587-.988-6.38-.318-.184-.688-.277-1.092-.278zm-.005 1.09v.006c.225 0 .406.044.558.127.666.382.955 1.835.73 3.704-.054.46-.142.945-.25 1.44-.96-.236-2.006-.417-3.107-.534-.66-.905-1.345-1.727-2.035-2.447 1.592-1.48 3.087-2.292 4.105-2.295zm-9.77.02c1.012 0 2.514.808 4.11 2.28-.686.72-1.37 1.537-2.02 2.442-1.107.117-2.154.298-3.113.538-.112-.49-.195-.964-.254-1.42-.23-1.868.054-3.32.714-3.707.19-.09.4-.127.563-.132zm4.882 3.05c.455.468.91.992 1.36 1.564-.44-.02-.89-.034-1.345-.034-.46 0-.915.01-1.36.034.44-.572.895-1.096 1.345-1.565zM12 8.1c.74 0 1.477.034 2.202.093.406.582.802 1.203 1.183 1.86.372.64.71 1.29 1.018 1.946-.308.655-.646 1.31-1.013 1.95-.38.66-.773 1.288-1.18 1.87-.728.063-1.466.098-2.21.098-.74 0-1.477-.035-2.202-.093-.406-.582-.802-1.204-1.183-1.86-.372-.64-.71-1.29-1.018-1.946.303-.657.646-1.313 1.013-1.954.38-.66.773-1.286 1.18-1.868.728-.064 1.466-.098 2.21-.098zm-3.635.254c-.24.377-.48.763-.704 1.16-.225.39-.435.782-.635 1.174-.265-.656-.49-1.31-.676-1.947.64-.15 1.315-.283 2.015-.386zm7.26 0c.695.103 1.365.23 2.006.387-.18.632-.405 1.282-.66 1.933-.2-.39-.41-.783-.64-1.174-.225-.392-.465-.774-.705-1.146zm3.063.675c.484.15.944.317 1.375.498 1.732.74 2.852 1.708 2.852 2.476-.005.768-1.125 1.74-2.857 2.475-.42.18-.88.342-1.355.493-.28-.958-.646-1.956-1.1-2.98.45-1.017.81-2.01 1.085-2.964zm-13.395.004c.278.96.645 1.957 1.1 2.98-.45 1.017-.812 2.01-1.086 2.964-.484-.15-.944-.318-1.37-.5-1.732-.737-2.852-1.706-2.852-2.474 0-.768 1.12-1.742 2.852-2.476.42-.18.88-.342 1.356-.494zm11.678 4.28c.265.657.49 1.312.676 1.948-.64.157-1.316.29-2.016.39.24-.375.48-.762.705-1.158.225-.39.435-.788.636-1.18zm-9.945.02c.2.392.41.783.64 1.175.23.39.465.772.705 1.143-.695-.102-1.365-.23-2.006-.386.18-.63.406-1.282.66-1.933zM17.92 16.32c.112.493.2.968.254 1.423.23 1.868-.054 3.32-.714 3.708-.147.09-.338.128-.563.128-1.012 0-2.514-.807-4.11-2.28.686-.72 1.37-1.536 2.02-2.44 1.107-.118 2.154-.3 3.113-.54zm-11.83.01c.96.234 2.006.415 3.107.532.66.905 1.345 1.727 2.035 2.446-1.595 1.483-3.092 2.295-4.11 2.295-.22-.005-.406-.05-.553-.132-.666-.38-.955-1.834-.73-3.703.054-.46.142-.944.25-1.438zm4.56.64c.44.02.89.034 1.345.034.46 0 .915-.01 1.36-.034-.44.572-.895 1.095-1.345 1.565-.455-.47-.91-.993-1.36-1.565z" />
      </svg>
      <svg className="cta__logo" role="img" aria-label="Next.js" viewBox="0 0 24 24">
        <path d="M18.665 21.978C16.758 23.255 14.465 24 12 24 5.377 24 0 18.623 0 12S5.377 0 12 0s12 5.377 12 12c0 3.583-1.574 6.801-4.067 9.001L9.219 7.2H7.2v9.596h1.615V9.251l9.85 12.727Zm-3.332-8.533 1.6 2.061V7.2h-1.6v6.245Z" />
      </svg>
      <svg className="cta__logo" role="img" aria-label="NestJS" viewBox="0 0 24 24">
        <path d="M14.131.047c-.173 0-.334.037-.483.087.316.21.49.49.576.806.007.043.019.074.025.117a.681.681 0 0 1 .013.112c.024.545-.143.614-.26.936-.18.415-.13.861.086 1.22a.74.74 0 0 0 .074.137c-.235-1.568 1.073-1.803 1.314-2.293.019-.428-.334-.713-.613-.911a1.37 1.37 0 0 0-.732-.21zM16.102.4c-.024.143-.006.106-.012.18-.006.05-.006.112-.012.161-.013.05-.025.1-.044.149-.012.05-.03.1-.05.149l-.067.142c-.02.025-.031.05-.05.075l-.037.055a2.152 2.152 0 0 1-.093.124c-.037.038-.068.081-.112.112v.006c-.037.031-.074.068-.118.1-.13.099-.278.173-.415.266-.043.03-.087.056-.124.093a.906.906 0 0 0-.118.099c-.043.037-.074.074-.111.118-.031.037-.068.08-.093.124a1.582 1.582 0 0 0-.087.13c-.025.05-.043.093-.068.142-.019.05-.037.093-.05.143a2.007 2.007 0 0 0-.043.155c-.006.025-.006.056-.012.08-.007.025-.007.05-.013.075 0 .05-.006.105-.006.155 0 .037 0 .074.006.111 0 .05.006.1.019.155.006.05.018.1.03.15.02.049.032.098.05.148.013.03.031.062.044.087l-1.426-.552c-.241-.068-.477-.13-.719-.186l-.39-.093c-.372-.074-.75-.13-1.128-.167-.013 0-.019-.006-.031-.006A11.082 11.082 0 0 0 8.9 2.855c-.378.025-.756.074-1.134.136a12.45 12.45 0 0 0-.837.174l-.279.074c-.092.037-.18.08-.266.118l-.205.093c-.012.006-.024.006-.03.012-.063.031-.118.056-.174.087a2.738 2.738 0 0 0-.236.118c-.043.018-.086.043-.124.062a.559.559 0 0 1-.055.03c-.056.032-.112.063-.162.094a1.56 1.56 0 0 0-.148.093c-.044.03-.087.055-.124.086-.006.007-.013.007-.019.013-.037.025-.08.056-.118.087l-.012.012-.093.074c-.012.007-.025.019-.037.025-.031.025-.062.056-.093.08-.006.013-.019.02-.025.025-.037.038-.074.069-.111.106-.007 0-.007.006-.013.012a1.742 1.742 0 0 0-.111.106c-.007.006-.007.012-.013.012a1.454 1.454 0 0 0-.093.1c-.012.012-.03.024-.043.036a1.374 1.374 0 0 1-.106.112c-.006.012-.018.019-.024.03-.05.05-.093.1-.143.15l-.018.018c-.1.106-.205.211-.317.304-.111.1-.229.192-.347.273a3.777 3.777 0 0 1-.762.421c-.13.056-.267.106-.403.149-.26.056-.527.161-.756.18-.05 0-.105.012-.155.018l-.155.037-.149.056c-.05.019-.099.044-.148.068-.044.031-.093.056-.137.087a1.011 1.011 0 0 0-.124.106c-.043.03-.087.074-.124.111-.037.043-.074.08-.105.124-.031.05-.068.093-.093.143a1.092 1.092 0 0 0-.087.142c-.025.056-.05.106-.068.161-.019.05-.037.106-.056.161-.012.05-.025.1-.03.15 0 .005-.007.012-.007.018-.012.056-.012.13-.019.167C.006 7.95 0 7.986 0 8.03a.657.657 0 0 0 .074.31v.006c.019.037.044.075.069.112.024.037.05.074.08.111.031.031.068.069.106.1a.906.906 0 0 0 .117.099c.149.13.186.173.378.272.031.019.062.031.1.05.006 0 .012.006.018.006 0 .013 0 .019.006.031a1.272 1.272 0 0 0 .08.298c.02.037.032.074.05.111.007.013.013.025.02.031.024.05.049.093.073.137l.093.13c.031.037.069.08.106.118.037.037.074.068.118.105 0 0 .006.006.012.006.037.031.074.062.112.087a.986.986 0 0 0 .136.08c.043.025.093.05.142.069a.73.73 0 0 0 .124.043c.007.006.013.006.025.012.025.007.056.013.08.019-.018.335-.024.65.026.762.055.124.328-.254.6-.688-.036.428-.061.93 0 1.079.069.155.44-.329.763-.862 4.395-1.016 8.405 2.02 8.826 6.31-.08-.67-.905-1.041-1.283-.948-.186.458-.502 1.047-1.01 1.413.043-.41.025-.83-.062-1.24a4.009 4.009 0 0 1-.769 1.562c-.588.043-1.177-.242-1.487-.67-.025-.018-.031-.055-.05-.08-.018-.043-.037-.087-.05-.13a.515.515 0 0 1-.037-.13c-.006-.044-.006-.087-.006-.137v-.093a.992.992 0 0 1 .031-.13c.013-.043.025-.086.044-.13.024-.043.043-.087.074-.13.105-.298.105-.54-.087-.682a.706.706 0 0 0-.118-.062c-.024-.006-.055-.018-.08-.025l-.05-.018a.847.847 0 0 0-.13-.031.472.472 0 0 0-.13-.019 1.01 1.01 0 0 0-.136-.012c-.031 0-.062.006-.093.006a.484.484 0 0 0-.137.019c-.043.006-.086.012-.13.024a1.068 1.068 0 0 0-.13.044c-.043.018-.08.037-.124.056-.037.018-.074.043-.118.062-1.444.942-.582 3.148.403 3.787-.372.068-.75.148-.855.229l-.013.012c.267.161.546.298.837.416.397.13.818.247 1.004.297v.006a5.996 5.996 0 0 0 1.562.112c2.746-.192 4.996-2.281 5.405-5.033l.037.161c.019.112.043.23.056.347v.006c.012.056.018.112.025.162v.024c.006.056.012.112.012.162.006.068.012.136.012.204v.1c0 .03.007.067.007.098 0 .038-.007.075-.007.112v.087c0 .043-.006.08-.006.124 0 .025 0 .05-.006.08 0 .044-.006.087-.006.137-.006.018-.006.037-.006.055l-.02.143c0 .019 0 .037-.005.056-.007.062-.019.118-.025.18v.012l-.037.174v.018l-.037.167c0 .007-.007.02-.007.025a1.663 1.663 0 0 1-.043.168v.018c-.019.062-.037.118-.05.174-.006.006-.006.012-.006.012l-.056.186c-.024.062-.043.118-.068.18-.025.062-.043.124-.068.18-.025.062-.05.117-.074.18h-.007c-.024.055-.05.117-.08.173a.302.302 0 0 1-.019.043c-.006.006-.006.013-.012.019a5.867 5.867 0 0 1-1.742 2.082c-.05.031-.099.069-.149.106-.012.012-.03.018-.043.03a2.603 2.603 0 0 1-.136.094l.018.037h.007l.26-.037h.006c.161-.025.322-.056.483-.087.044-.006.093-.019.137-.031l.087-.019c.043-.006.086-.018.13-.024.037-.013.074-.02.111-.031.62-.15 1.221-.354 1.798-.595a9.926 9.926 0 0 1-3.85 3.142c.714-.05 1.426-.167 2.114-.366a9.903 9.903 0 0 0 5.857-4.68 9.893 9.893 0 0 1-1.667 3.986 9.758 9.758 0 0 0 1.655-1.376 9.824 9.824 0 0 0 2.61-5.268c.21.98.272 1.99.18 2.987 4.474-6.241.371-12.712-1.346-14.416-.006-.013-.012-.019-.012-.031-.006.006-.006.006-.006.012 0-.006 0-.006-.007-.012 0 .074-.006.148-.012.223a8.34 8.34 0 0 1-.062.415c-.03.136-.068.273-.105.41-.044.13-.093.266-.15.396a5.322 5.322 0 0 1-.185.378 4.735 4.735 0 0 1-.477.688c-.093.111-.192.21-.292.31a3.994 3.994 0 0 1-.18.155l-.142.124a3.459 3.459 0 0 1-.347.241 4.295 4.295 0 0 1-.366.211c-.13.062-.26.118-.39.174a4.364 4.364 0 0 1-.818.223c-.143.025-.285.037-.422.05a4.914 4.914 0 0 1-.297.012 4.66 4.66 0 0 1-.422-.025 3.137 3.137 0 0 1-.421-.062 3.136 3.136 0 0 1-.415-.105h-.007c.137-.013.273-.025.41-.05a4.493 4.493 0 0 0 .818-.223c.136-.05.266-.112.39-.174.13-.062.248-.13.372-.204.118-.08.235-.161.347-.248.112-.087.217-.18.316-.279.105-.093.198-.198.291-.304.093-.111.18-.223.26-.334.013-.019.026-.044.038-.062.062-.1.124-.199.18-.298a4.272 4.272 0 0 0 .334-.775c.044-.13.075-.266.106-.403.025-.142.05-.278.062-.415.012-.142.025-.285.025-.421 0-.1-.007-.199-.013-.298a6.726 6.726 0 0 0-.05-.415 4.493 4.493 0 0 0-.092-.415c-.044-.13-.087-.267-.137-.397-.05-.13-.111-.26-.173-.384-.069-.124-.137-.248-.211-.366a6.843 6.843 0 0 0-.248-.34c-.093-.106-.186-.212-.285-.317a3.878 3.878 0 0 0-.161-.155c-.28-.217-.57-.421-.862-.607a1.154 1.154 0 0 0-.124-.062 2.415 2.415 0 0 0-.589-.26Z" />
      </svg>
      <svg className="cta__logo" role="img" aria-label="Python" viewBox="0 0 24 24">
        <path d="M14.25.18l.9.2.73.26.59.3.45.32.34.34.25.34.16.33.1.3.04.26.02.2-.01.13V8.5l-.05.63-.13.55-.21.46-.26.38-.3.31-.33.25-.35.19-.35.14-.33.1-.3.07-.26.04-.21.02H8.77l-.69.05-.59.14-.5.22-.41.27-.33.32-.27.35-.2.36-.15.37-.1.35-.07.32-.04.27-.02.21v3.06H3.17l-.21-.03-.28-.07-.32-.12-.35-.18-.36-.26-.36-.36-.35-.46-.32-.59-.28-.73-.21-.88-.14-1.05-.05-1.23.06-1.22.16-1.04.24-.87.32-.71.36-.57.4-.44.42-.33.42-.24.4-.16.36-.1.32-.05.24-.01h.16l.06.01h8.16v-.83H6.18l-.01-2.75-.02-.37.05-.34.11-.31.17-.28.25-.26.31-.23.38-.2.44-.18.51-.15.58-.12.64-.1.71-.06.77-.04.84-.02 1.27.05zm-6.3 1.98l-.23.33-.08.41.08.41.23.34.33.22.41.09.41-.09.33-.22.23-.34.08-.41-.08-.41-.23-.33-.33-.22-.41-.09-.41.09zm13.09 3.95l.28.06.32.12.35.18.36.27.36.35.35.47.32.59.28.73.21.88.14 1.04.05 1.23-.06 1.23-.16 1.04-.24.86-.32.71-.36.57-.4.45-.42.33-.42.24-.4.16-.36.09-.32.05-.24.02-.16-.01h-8.22v.82h5.84l.01 2.76.02.36-.05.34-.11.31-.17.29-.25.25-.31.24-.38.2-.44.17-.51.15-.58.13-.64.09-.71.07-.77.04-.84.01-1.27-.04-1.07-.14-.9-.2-.73-.25-.59-.3-.45-.33-.34-.34-.25-.34-.16-.33-.1-.3-.04-.25-.02-.2.01-.13v-5.34l.05-.64.13-.54.21-.46.26-.38.3-.32.33-.24.35-.2.35-.14.33-.1.3-.06.26-.04.21-.02.13-.01h5.84l.69-.05.59-.14.5-.21.41-.28.33-.32.27-.35.2-.36.15-.36.1-.35.07-.32.04-.28.02-.21V6.07h2.09l.14.01z" />
      </svg>
      <svg className="cta__logo" role="img" aria-label="Shopify" viewBox="0 0 24 24">
        <path d="M15.337 23.979l7.216-1.561s-2.604-17.613-2.625-17.73c-.018-.116-.114-.192-.211-.192s-1.929-.136-1.929-.136-1.275-1.274-1.439-1.411c-.045-.037-.075-.057-.121-.074l-.914 21.104h.023zM11.71 11.305s-.81-.424-1.774-.424c-1.447 0-1.504.906-1.504 1.141 0 1.232 3.24 1.715 3.24 4.629 0 2.295-1.44 3.76-3.406 3.76-2.354 0-3.54-1.465-3.54-1.465l.646-2.086s1.245 1.066 2.28 1.066c.675 0 .975-.545.975-.932 0-1.619-2.654-1.694-2.654-4.359-.034-2.237 1.571-4.416 4.827-4.416 1.257 0 1.875.361 1.875.361l-.945 2.715-.02.01zM11.17.83c.136 0 .271.038.405.135-.984.465-2.064 1.639-2.508 3.992-.656.213-1.293.405-1.889.578C7.697 3.75 8.951.84 11.17.84V.83zm1.235 2.949v.135c-.754.232-1.583.484-2.394.736.466-1.777 1.333-2.645 2.085-2.971.193.501.309 1.176.309 2.1zm.539-2.234c.694.074 1.141.867 1.429 1.755-.349.114-.735.231-1.158.366v-.252c0-.752-.096-1.371-.271-1.871v.002zm2.992 1.289c-.02 0-.06.021-.078.021s-.289.075-.714.21c-.423-1.233-1.176-2.37-2.508-2.37h-.115C12.135.209 11.669 0 11.265 0 8.159 0 6.675 3.877 6.21 5.846c-1.194.365-2.063.636-2.16.674-.675.213-.694.232-.772.87-.075.462-1.83 14.063-1.83 14.063L15.009 24l.927-21.166z" />
      </svg>
      <svg className="cta__logo" role="img" aria-label="n8n" viewBox="0 0 24 24">
        <path d="M21.4737 5.6842c-1.1772 0-2.1663.8051-2.4468 1.8947h-2.8955c-1.235 0-2.289.893-2.492 2.111l-.1038.623a1.263 1.263 0 0 1-1.246 1.0555H11.289c-.2805-1.0896-1.2696-1.8947-2.4468-1.8947s-2.1663.8051-2.4467 1.8947H4.973c-.2805-1.0896-1.2696-1.8947-2.4468-1.8947C1.1311 9.4737 0 10.6047 0 12s1.131 2.5263 2.5263 2.5263c1.1772 0 2.1663-.8051 2.4468-1.8947h1.4223c.2804 1.0896 1.2696 1.8947 2.4467 1.8947 1.1772 0 2.1663-.8051 2.4468-1.8947h1.0008a1.263 1.263 0 0 1 1.2459 1.0555l.1038.623c.203 1.218 1.257 2.111 2.492 2.111h.3692c.2804 1.0895 1.2696 1.8947 2.4468 1.8947 1.3952 0 2.5263-1.131 2.5263-2.5263s-1.131-2.5263-2.5263-2.5263c-1.1772 0-2.1664.805-2.4468 1.8947h-.3692a1.263 1.263 0 0 1-1.246-1.0555l-.1037-.623A2.52 2.52 0 0 0 13.9607 12a2.52 2.52 0 0 0 .821-1.4794l.1038-.623a1.263 1.263 0 0 1 1.2459-1.0555h2.8955c.2805 1.0896 1.2696 1.8947 2.4468 1.8947 1.3952 0 2.5263-1.131 2.5263-2.5263s-1.131-2.5263-2.5263-2.5263m0 1.2632a1.263 1.263 0 0 1 1.2631 1.2631 1.263 1.263 0 0 1-1.2631 1.2632 1.263 1.263 0 0 1-1.2632-1.2632 1.263 1.263 0 0 1 1.2632-1.2631M2.5263 10.7368A1.263 1.263 0 0 1 3.7895 12a1.263 1.263 0 0 1-1.2632 1.2632A1.263 1.263 0 0 1 1.2632 12a1.263 1.263 0 0 1 1.2631-1.2632m6.3158 0A1.263 1.263 0 0 1 10.1053 12a1.263 1.263 0 0 1-1.2632 1.2632A1.263 1.263 0 0 1 7.579 12a1.263 1.263 0 0 1 1.2632-1.2632m10.1053 3.7895a1.263 1.263 0 0 1 1.2631 1.2632 1.263 1.263 0 0 1-1.2631 1.2631 1.263 1.263 0 0 1-1.2632-1.2631 1.263 1.263 0 0 1 1.2632-1.2632" />
      </svg>
    </span>
  )
}

/** CRM/tools logo strip ("Connects with") — inline SVGs kept verbatim. */
export function ConnectsLogos() {
  return (
    <span className="cta__logos">
      <svg className="cta__logo" role="img" aria-label="HubSpot" viewBox="0 0 24 24">
        <path d="M18.164 7.93V5.084a2.198 2.198 0 001.267-1.978v-.067A2.2 2.2 0 0017.238.845h-.067a2.2 2.2 0 00-2.193 2.193v.067a2.196 2.196 0 001.252 1.973l.013.006v2.852a6.22 6.22 0 00-2.969 1.31l.012-.01-7.828-6.095A2.497 2.497 0 104.3 4.656l-.012.006 7.697 5.991a6.176 6.176 0 00-1.038 3.446c0 1.343.425 2.588 1.147 3.607l-.013-.02-2.342 2.343a1.968 1.968 0 00-.58-.095h-.002a2.033 2.033 0 102.033 2.033 1.978 1.978 0 00-.1-.595l.005.014 2.317-2.317a6.247 6.247 0 104.782-11.134l-.036-.005zm-.964 9.378a3.206 3.206 0 113.215-3.207v.002a3.206 3.206 0 01-3.207 3.207z" />
      </svg>
      <svg className="cta__logo" role="img" aria-label="Zendesk" viewBox="0 0 24 24">
        <path d="M12.914 2.904V16.29L24 2.905H12.914zM0 2.906C0 5.966 2.483 8.45 5.543 8.45s5.542-2.484 5.543-5.544H0zm11.086 4.807L0 21.096h11.086V7.713zm7.37 7.84c-3.063 0-5.542 2.48-5.542 5.543H24c0-3.06-2.48-5.543-5.543-5.543z" />
      </svg>
      <svg className="cta__logo" role="img" aria-label="Mailchimp" viewBox="0 0 24 24">
        <path d="M11.267 0C6.791-.015-1.82 10.246 1.397 12.964l.79.669a3.88 3.88 0 0 0-.22 1.792c.084.84.518 1.644 1.22 2.266.666.59 1.542.964 2.392.964 1.406 3.24 4.62 5.228 8.386 5.34 4.04.12 7.433-1.776 8.854-5.182.093-.24.488-1.316.488-2.267 0-.956-.54-1.352-.885-1.352-.01-.037-.078-.286-.172-.586-.093-.3-.19-.51-.19-.51.375-.563.382-1.065.332-1.35-.053-.353-.2-.653-.496-.964-.296-.311-.902-.63-1.753-.868l-.446-.124c-.002-.019-.024-1.053-.043-1.497-.014-.32-.042-.822-.197-1.315-.186-.668-.508-1.253-.911-1.627 1.112-1.152 1.806-2.422 1.804-3.511-.003-2.095-2.576-2.729-5.746-1.416l-.672.285A678.22 678.22 0 0 0 12.7.504C12.304.159 11.817.002 11.267 0zm.073.873c.166 0 .322.019.465.058.297.084 1.28 1.224 1.28 1.224s-1.826 1.013-3.52 2.426c-2.28 1.757-4.005 4.311-5.037 7.082-.811.158-1.526.618-1.963 1.253-.261-.218-.748-.64-.834-.804-.698-1.326.761-3.902 1.781-5.357C5.834 3.44 9.37.867 11.34.873zm3.286 3.273c.04-.002.06.05.028.074-.143.11-.299.26-.413.414a.04.04 0 0 0 .031.064c.659.004 1.587.235 2.192.574.041.023.012.103-.034.092-.915-.21-2.414-.369-3.97.01-1.39.34-2.45.863-3.224 1.426-.04.028-.086-.023-.055-.06.896-1.035 1.999-1.935 2.987-2.44.034-.018.07.019.052.052-.079.143-.23.447-.278.678-.007.035.032.063.062.042.615-.42 1.684-.868 2.622-.926zm3.023 3.205l.056.001a.896.896 0 0 1 .456.146c.534.355.61 1.216.638 1.845.015.36.059 1.229.074 1.478.034.571.184.651.487.751.17.057.33.098.563.164.706.198 1.125.4 1.39.658.157.162.23.333.253.497.083.608-.472 1.36-1.942 2.041-1.607.746-3.557.935-4.904.785l-.471-.053c-1.078-.145-1.693 1.247-1.046 2.201.417.615 1.552 1.015 2.688 1.015 2.604 0 4.605-1.111 5.35-2.072a.987.987 0 0 0 .06-.085c.036-.055.006-.085-.04-.054-.608.416-3.31 2.069-6.2 1.571 0 0-.351-.057-.672-.182-.255-.1-.788-.344-.853-.891 2.333.72 3.801.039 3.801.039a.072.072 0 0 0 .042-.072.067.067 0 0 0-.074-.06s-1.911.283-3.718-.378c.197-.64.72-.408 1.51-.345a11.045 11.045 0 0 0 3.647-.394c.818-.234 1.892-.697 2.727-1.356.281.618.38 1.299.38 1.299s.219-.04.4.073c.173.106.299.326.213.895-.176 1.063-.628 1.926-1.387 2.72a5.714 5.714 0 0 1-1.666 1.244c-.34.18-.704.334-1.087.46-2.863.935-5.794-.093-6.739-2.3a3.545 3.545 0 0 1-.189-.522c-.403-1.455-.06-3.2 1.008-4.299.065-.07.132-.153.132-.256 0-.087-.055-.179-.102-.243-.374-.543-1.669-1.466-1.409-3.254.187-1.284 1.31-2.189 2.357-2.135.089.004.177.01.266.015.453.027.85.085 1.223.1.625.028 1.187-.063 1.853-.618.225-.187.405-.35.71-.401.028-.005.092-.028.215-.028zm.022 2.18a.42.42 0 0 0-.06.005c-.335.054-.347.468-.228 1.04.068.32.187.595.32.765.175-.02.343-.022.498 0 .089-.205.104-.557.024-.942-.112-.535-.261-.872-.554-.868zm-3.66 1.546a1.724 1.724 0 0 0-1.016.326c-.16.117-.311.28-.29.378.008.032.031.056.088.063.131.015.592-.217 1.122-.25.374-.023.684.094.923.2.239.104.386.173.443.113.037-.038.026-.11-.031-.204-.118-.192-.36-.387-.618-.497a1.601 1.601 0 0 0-.621-.129zm4.082.81c-.171-.003-.313.186-.317.42-.004.236.131.43.303.432.172.003.314-.185.318-.42.004-.236-.132-.429-.304-.432zm-3.58.172c-.05 0-.102.002-.155.008-.311.05-.483.152-.593.247-.094.082-.152.173-.152.237a.075.075 0 0 0 .075.076c.07 0 .228-.063.228-.063a1.98 1.98 0 0 1 1.001-.104c.157.018.23.027.265-.026.01-.016.022-.049-.01-.1-.063-.103-.311-.269-.66-.275zm2.26.4c-.127 0-.235.051-.283.148-.075.154.035.363.246.466.21.104.443.063.52-.09.075-.155-.035-.364-.246-.467a.542.542 0 0 0-.237-.058zm-11.635.024c.048 0 .098 0 .149.003.73.04 1.806.6 2.052 2.19.217 1.41-.128 2.843-1.449 3.069-.123.02-.248.029-.374.026-1.22-.033-2.539-1.132-2.67-2.435-.145-1.44.591-2.548 1.894-2.811.117-.024.252-.04.398-.042zm-.07.927a1.144 1.144 0 0 0-.847.364c-.38.418-.439.988-.366 1.19.027.073.07.094.1.098.064.008.16-.039.22-.2a1.2 1.2 0 0 0 .017-.052 1.58 1.58 0 0 1 .157-.37.689.689 0 0 1 .955-.199c.266.174.369.5.255.81-.058.161-.154.469-.133.721.043.511.357.717.64.738.274.01.466-.143.515-.256.029-.067.005-.107-.011-.125-.043-.053-.113-.037-.18-.021a.638.638 0 0 1-.16.022.347.347 0 0 1-.294-.148c-.078-.12-.073-.3.013-.504.011-.028.025-.058.04-.092.138-.308.368-.825.11-1.317-.195-.37-.513-.602-.894-.65a1.135 1.135 0 0 0-.138-.01z" />
      </svg>
      <svg className="cta__logo" role="img" aria-label="Google Calendar" viewBox="0 0 24 24">
        <path d="M18.316 5.684H24v12.632h-5.684V5.684zM5.684 24h12.632v-5.684H5.684V24zM18.316 5.684V0H1.895A1.894 1.894 0 0 0 0 1.895v16.421h5.684V5.684h12.632zm-7.207 6.25v-.065c.272-.144.5-.349.687-.617s.279-.595.279-.982c0-.379-.099-.72-.3-1.025a2.05 2.05 0 0 0-.832-.714 2.703 2.703 0 0 0-1.197-.257c-.6 0-1.094.156-1.481.467-.386.311-.65.671-.793 1.078l1.085.452c.086-.249.224-.461.413-.633.189-.172.445-.257.767-.257.33 0 .602.088.816.264a.86.86 0 0 1 .322.703c0 .33-.12.589-.36.778-.24.19-.535.284-.886.284h-.567v1.085h.633c.407 0 .748.109 1.02.327.272.218.407.499.407.843 0 .336-.129.614-.387.832s-.565.327-.924.327c-.351 0-.651-.103-.897-.311-.248-.208-.422-.502-.521-.881l-1.096.452c.178.616.505 1.082.977 1.401.472.319.984.478 1.538.477a2.84 2.84 0 0 0 1.293-.291c.382-.193.684-.458.902-.794.218-.336.327-.72.327-1.149 0-.429-.115-.797-.344-1.105a2.067 2.067 0 0 0-.881-.689zm2.093-1.931l.602.913L15 10.045v5.744h1.187V8.446h-.827l-2.158 1.557z" />
      </svg>
      <svg className="cta__logo" role="img" aria-label="WhatsApp" viewBox="0 0 24 24">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884M20.463 3.488A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
      </svg>
      <svg className="cta__logo" role="img" aria-label="Stripe" viewBox="0 0 24 24">
        <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.594-7.305h.003z" />
      </svg>
    </span>
  )
}
