import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { mergeClasses } from '@fluentui/react-components'
import { DismissRegular } from '@fluentui/react-icons'
import { OPPTRIX_GLASS_PANEL_CLASS } from '../theme/mixins'

export type ComposerTooltipAlign = 'start' | 'end'

interface Props {
  open: boolean
  anchorRef: React.RefObject<HTMLElement | null>
  align?: ComposerTooltipAlign
  width?: number
  maxHeight?: number
  title?: string
  ariaLabel: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  showClose?: boolean
}

export const COMPOSER_MENU_WIDTH = {
  quickTasks: 288,
  stockMention: 248,
  model: 232,
} as const

const DEFAULT_WIDTH = COMPOSER_MENU_WIDTH.quickTasks
const DEFAULT_MAX_HEIGHT = 280
const VIEWPORT_PAD = 12

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function resolveMenuWidth(width: number) {
  if (typeof window === 'undefined') return width
  return clamp(width, 200, window.innerWidth - VIEWPORT_PAD * 2)
}

export default function ComposerTooltipMenu({
  open,
  anchorRef,
  align = 'start',
  width = DEFAULT_WIDTH,
  maxHeight = DEFAULT_MAX_HEIGHT,
  title,
  ariaLabel,
  onClose,
  children,
  footer,
  showClose = false,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const menuWidth = resolveMenuWidth(width)
  const [style, setStyle] = useState<CSSProperties>(() => ({
    position: 'fixed',
    width: menuWidth,
    maxWidth: menuWidth,
    zIndex: 2000,
    visibility: 'hidden',
  }))

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current
    const panel = panelRef.current
    if (!open || !anchor || !panel) return

    const rect = anchor.getBoundingClientRect()
    const panelWidth = menuWidth
    const panelHeight = panel.offsetHeight
    const gap = 8

    let left = align === 'end'
      ? rect.right - panelWidth
      : rect.left

    left = clamp(left, VIEWPORT_PAD, window.innerWidth - panelWidth - VIEWPORT_PAD)

    let top = rect.top - gap - panelHeight
    if (top < VIEWPORT_PAD) {
      top = rect.bottom + gap
    }

    setStyle({
      position: 'fixed',
      top,
      left,
      width: panelWidth,
      maxWidth: panelWidth,
      zIndex: 2000,
      visibility: 'visible',
    })
  }, [align, anchorRef, menuWidth, open])

  useLayoutEffect(() => {
    if (!open) return
    updatePosition()
    const raf = window.requestAnimationFrame(updatePosition)
    return () => window.cancelAnimationFrame(raf)
  }, [open, updatePosition, children])

  useEffect(() => {
    if (!open) return
    const onResize = () => updatePosition()
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
    }
  }, [open, updatePosition])

  useEffect(() => {
    if (!open) return
    const onDocDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (panelRef.current?.contains(target)) return
      if (anchorRef.current?.contains(target)) return
      onClose()
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [anchorRef, onClose, open])

  if (!open) return null

  return createPortal(
    <div
      ref={panelRef}
      className={mergeClasses('opptrix-composer-tooltip-menu', OPPTRIX_GLASS_PANEL_CLASS)}
      style={{
        ...style,
        width: menuWidth,
        maxWidth: menuWidth,
        boxSizing: 'border-box',
      }}
      role="dialog"
      aria-label={ariaLabel}
    >
      {(title || showClose) && (
        <div className="opptrix-composer-tooltip-menu__head">
          {title ? (
            <span className="opptrix-composer-tooltip-menu__title">{title}</span>
          ) : <span />}
          {showClose ? (
            <button
              type="button"
              className="opptrix-composer-tooltip-menu__close opptrix-focusable"
              aria-label="关闭"
              onClick={onClose}
            >
              <DismissRegular fontSize={14} />
            </button>
          ) : null}
        </div>
      )}
      <div
        className="opptrix-composer-tooltip-menu__body opptrix-scroll"
        style={{ maxHeight }}
      >
        {children}
      </div>
      {footer ? (
        <div className="opptrix-composer-tooltip-menu__foot">
          {footer}
        </div>
      ) : null}
    </div>,
    document.body,
  )
}

/** Shared row button for tooltip menus */
export function ComposerTooltipMenuItem({
  active,
  onClick,
  onMouseEnter,
  children,
  className,
}: {
  active?: boolean
  onClick: () => void
  onMouseEnter?: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      className={mergeClasses(
        'opptrix-composer-tooltip-menu__item',
        active && 'opptrix-composer-tooltip-menu__item--active',
        className,
      )}
      onMouseDown={e => e.preventDefault()}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
