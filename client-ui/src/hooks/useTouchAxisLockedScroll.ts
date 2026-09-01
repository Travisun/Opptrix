import { useEffect, type RefObject } from 'react'

const AXIS_LOCK_SLOP_PX = 8

/**
 * 双轴 overflow 容器上，按手势主轴锁定滚动（只上下或只左右，禁止斜向同滚）。
 * 须在 touchmove 上 preventDefault，故 listener 为非 passive。
 */
export function useTouchAxisLockedScroll(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current
    if (!el) return

    let axis: 'x' | 'y' | null = null
    let startX = 0
    let startY = 0
    let startLeft = 0
    let startTop = 0

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        axis = null
        return
      }
      const t = e.touches[0]
      axis = null
      startX = t.clientX
      startY = t.clientY
      startLeft = el.scrollLeft
      startTop = el.scrollTop
    }

    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      const t = e.touches[0]
      const dx = t.clientX - startX
      const dy = t.clientY - startY

      if (!axis) {
        if (Math.abs(dx) < AXIS_LOCK_SLOP_PX && Math.abs(dy) < AXIS_LOCK_SLOP_PX) return
        axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      }

      e.preventDefault()
      if (axis === 'x') {
        el.scrollLeft = startLeft - dx
        el.scrollTop = startTop
      } else {
        el.scrollTop = startTop - dy
        el.scrollLeft = startLeft
      }
    }

    const onEnd = () => {
      axis = null
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    el.addEventListener('touchcancel', onEnd, { passive: true })

    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [ref])
}
