import { useEffect, useRef } from 'react'

/** Run effect after `delayMs` when deps change; skips the first run when `skipInitial` is true. */
export function useDebouncedEffect(
  effect: () => void | (() => void),
  deps: readonly unknown[],
  delayMs: number,
  skipInitial = true,
) {
  const isFirst = useRef(skipInitial)

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false
      return undefined
    }

    const timer = window.setTimeout(() => {
      effect()
    }, delayMs)

    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounced snapshot of deps
  }, deps)
}
