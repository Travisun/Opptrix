import { useEffect, useState } from 'react'

export function useRotatingPhrase(phrases: readonly string[], active: boolean, intervalMs = 1800) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (!active) {
      setIndex(0)
      return
    }
    const timer = window.setInterval(() => {
      setIndex(prev => (prev + 1) % phrases.length)
    }, intervalMs)
    return () => window.clearInterval(timer)
  }, [active, intervalMs, phrases.length])

  return phrases[active ? index : 0] ?? phrases[0] ?? ''
}
