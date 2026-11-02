import { ArrowUp } from 'lucide-react'
import { useEffect, useState } from 'react'

const SHOW_AFTER_PX = 320

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Round "back to top" button that appears once the page has been scrolled down. */
export function ScrollToTopButton() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const update = () => setVisible(window.scrollY > SHOW_AFTER_PX)
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  if (!visible) return null

  return (
    <button
      type="button"
      className="scroll-top-button"
      aria-label="Scroll to top"
      title="Scroll to top"
      onClick={() => {
        window.scrollTo({
          top: 0,
          behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        })
        // The button unmounts at the top; hand focus to the active tab so keyboard users keep their place.
        document
          .querySelector<HTMLElement>('.main-tabs button.is-active')
          ?.focus({ preventScroll: true })
      }}
    >
      <ArrowUp size={20} aria-hidden="true" />
    </button>
  )
}
