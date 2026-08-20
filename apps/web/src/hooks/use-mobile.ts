import * as React from "react"

// Must stay equal to Tailwind's `md` breakpoint (48rem = 768px). Layout is
// CSS-first throughout the app, so a JS breakpoint that drifts from `md` would
// mount one tree while the stylesheet lays out the other.
const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${String(MOBILE_BREAKPOINT - 1)}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => { mql.removeEventListener("change", onChange) }
  }, [])

  return !!isMobile
}
