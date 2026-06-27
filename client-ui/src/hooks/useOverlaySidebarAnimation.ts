import { useEffect, useState } from 'react'

export const OVERLAY_SIDEBAR_MS = 340

/** Keep overlay mounted through exit transition, then unmount. */
export function useOverlaySidebarAnimation(open: boolean) {
  const [mounted, setMounted] = useState(open)
  const [presented, setPresented] = useState(open)

  useEffect(() => {
    if (open) {
      setMounted(true)
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => setPresented(true))
      })
      return () => cancelAnimationFrame(raf)
    }

    setPresented(false)
    const timer = window.setTimeout(() => setMounted(false), OVERLAY_SIDEBAR_MS)
    return () => window.clearTimeout(timer)
  }, [open])

  return { mounted, presented }
}
