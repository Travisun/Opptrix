import { useCallback, useEffect, useRef, useState } from 'react'

/** Button label flash after copy — success / failure, then back to idle. */
export function useCopyButtonFeedback(
  idleLabel = '一键复制',
  successLabel = '已复制',
  failLabel = '复制失败',
  resetMs = 2000,
) {
  const [label, setLabel] = useState(idleLabel)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timerRef.current != null) clearTimeout(timerRef.current)
  }, [])

  const flash = useCallback((ok: boolean) => {
    if (timerRef.current != null) clearTimeout(timerRef.current)
    setLabel(ok ? successLabel : failLabel)
    timerRef.current = setTimeout(() => {
      setLabel(idleLabel)
      timerRef.current = null
    }, resetMs)
  }, [idleLabel, successLabel, failLabel, resetMs])

  return { label, flash }
}
