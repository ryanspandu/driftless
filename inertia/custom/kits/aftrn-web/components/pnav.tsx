import { logoMark, logoWord, logoWordLight } from '../lib/assets'

/**
 * The minimal portfolio header (`.pnav`) — a back-to-site bar over the dark
 * hero. Carries three logo images (mark + light + dark wordmark) that CSS
 * toggles by scroll state. `usePnav()` wires the scroll state. The back link
 * varies per page (site vs "All work"), so it is a prop.
 */
export function Pnav({
  backHref = '/aftrn',
  backLabel = 'Back to site',
}: {
  backHref?: string
  backLabel?: string
} = {}) {
  return (
    <header className="pnav" id="pnav">
      <div className="container pnav__inner">
        <a href="/aftrn" className="pnav__logo" aria-label="AFTRN home">
          <img src={logoMark} alt="" className="pnav__mark" width={32} height={32} />
          <img
            src={logoWordLight}
            alt="AFTRN"
            className="pnav__word pnav__word--light"
            width={69}
            height={39}
          />
          <img
            src={logoWord}
            alt="AFTRN"
            className="pnav__word pnav__word--dark"
            width={69}
            height={39}
          />
        </a>
        <div className="pnav__right">
          <a href={backHref} className="pnav__back">
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            <span className="pnav__back-label">{backLabel}</span>
          </a>
          <a href="#contact" className="btn btn--sm btn--primary">
            Book a free call
          </a>
        </div>
      </div>
    </header>
  )
}
