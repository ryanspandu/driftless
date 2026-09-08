import { useEffect, useRef, useState, type FormEvent } from 'react'

/**
 * The site-wide "Book a free call" modal (ported from js/book-modal.js).
 *
 * Rendered once per page by <Shell>. A document-level click listener opens it
 * for any `a[href$="#contact"]` (progressive-enhancement parity with the source:
 * the links still point at #contact). No backend — submitting composes a
 * prefilled mailto to hello@aftrn.com, then shows a confirmation. Swap the
 * mailto step for a real form handler (Formspree/Netlify/Driftless Forms) later.
 */
export function BookModal() {
  const [open, setOpen] = useState(false)
  const [sent, setSent] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest('a[href$="#contact"]')
      if (!a) return
      e.preventDefault()
      setSent(null)
      setOpen(true)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  useEffect(() => {
    document.body.classList.toggle('bookm-open', open)
    if (open && !sent) window.setTimeout(() => nameRef.current?.focus(), 80)
    return () => document.body.classList.remove('bookm-open')
  }, [open, sent])

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = e.currentTarget
    const data = new FormData(f)
    const name = String(data.get('name') || '').trim()
    const email = String(data.get('email') || '').trim()
    if (!name) return nameRef.current?.focus()
    if (!email || !email.includes('@')) {
      return (f.querySelector('#bmEmail') as HTMLInputElement | null)?.focus()
    }
    const biz = String(data.get('business') || '').trim()
    const phone = String(data.get('phone') || '').trim()
    const svc = String(data.get('service') || '')
    const msg = String(data.get('message') || '').trim()
    const subject = `Free call request - ${name}${biz ? ` (${biz})` : ''}`
    const body =
      `Name: ${name}\nBusiness: ${biz}\nEmail: ${email}\nPhone: ${phone}` +
      `\nInterested in: ${svc}\n\n${msg || '(no message)'}`
    window.location.href = `mailto:hello@aftrn.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    setSent(name.split(' ')[0] || '')
  }

  return (
    <div
      className={`bookm${open ? ' is-open' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="bookmTitle"
      hidden={!open}
    >
      <div className="bookm__overlay" onClick={() => setOpen(false)} />
      <div className="bookm__dialog" role="document">
        <button
          className="bookm__close"
          type="button"
          aria-label="Close"
          onClick={() => setOpen(false)}
        >
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        <div className="bookm__body">
          {sent === null ? (
            <>
              <span className="bookm__eyebrow">Free 15-min call</span>
              <h2 className="bookm__title" id="bookmTitle">
                Book your free call
              </h2>
              <p className="bookm__sub">
                Tell us a bit about your business and we&rsquo;ll map how to get you more customers.
                No pressure, no contracts.
              </p>
              <form className="bookm__form" noValidate onSubmit={onSubmit}>
                <div className="bookm__row">
                  <div className="bookm__field">
                    <label htmlFor="bmName">
                      Name <span className="req">*</span>
                    </label>
                    <input ref={nameRef} id="bmName" name="name" type="text" required autoComplete="name" />
                  </div>
                  <div className="bookm__field">
                    <label htmlFor="bmBiz">Business</label>
                    <input id="bmBiz" name="business" type="text" autoComplete="organization" />
                  </div>
                </div>
                <div className="bookm__row">
                  <div className="bookm__field">
                    <label htmlFor="bmEmail">
                      Email <span className="req">*</span>
                    </label>
                    <input id="bmEmail" name="email" type="email" required autoComplete="email" />
                  </div>
                  <div className="bookm__field">
                    <label htmlFor="bmPhone">Phone</label>
                    <input id="bmPhone" name="phone" type="tel" autoComplete="tel" />
                  </div>
                </div>
                <div className="bookm__field">
                  <label htmlFor="bmService">What do you need?</label>
                  <select id="bmService" name="service" defaultValue="Not sure yet">
                    <option>Not sure yet</option>
                    <option>Web Development</option>
                    <option>AI Automation</option>
                    <option>SEO / GEO</option>
                    <option>All of the above</option>
                  </select>
                </div>
                <div className="bookm__field">
                  <label htmlFor="bmMsg">Anything else?</label>
                  <textarea
                    id="bmMsg"
                    name="message"
                    placeholder="Optional: tell us your goal or biggest bottleneck"
                  />
                </div>
                <button className="btn btn--primary btn--lg bookm__submit" type="submit">
                  Request my call
                </button>
                <p className="bookm__note">
                  <span className="tick">&#10003;</span> Replies within 1 business day. We never
                  share your details.
                </p>
              </form>
            </>
          ) : (
            <div className="bookm__success">
              <span className="bookm__success-ico" aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  width="28"
                  height="28"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m20 6-11 11-5-5" />
                </svg>
              </span>
              <h3>Almost there{sent ? `, ${sent}` : ''}</h3>
              <p>
                We&rsquo;ve opened your email app with the details filled in, just hit send. Prefer
                to reach us directly? Email <a href="mailto:hello@aftrn.com">hello@aftrn.com</a> or
                call <a href="tel:+14155550132">(415) 555-0132</a>.
              </p>
              <button
                className="btn btn--ghost"
                type="button"
                style={{ marginTop: 18 }}
                onClick={() => setOpen(false)}
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
