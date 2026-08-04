import { useCallback, useEffect, useRef, useState } from 'react'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import { opptrixCssVars } from '../theme/tokens'
import {
  DESKTOP_TITLEBAR_HEIGHT,
  WORKSPACE_SPLITTER_HIT_SLOP,
  WORKSPACE_SPLITTER_WIDTH,
  WORKSPACE_SPLITTER_Z_INDEX,
} from '../desktop/constants'
import { electronPlatform } from '../platform/detect'

const FOCUS_FADE_PERCENT = 10

function buildLineBackground(focusRatio: number | null): string {
  const normal = opptrixCssVars.separatorStrong
  if (focusRatio == null) return normal

  const y = focusRatio * 100
  const fade = FOCUS_FADE_PERCENT
  const active = opptrixCssVars.textTertiary
  const topFade = Math.max(0, y - fade)
  const bottomFade = Math.min(100, y + fade)

  return `linear-gradient(to bottom, ${normal} 0%, ${normal} ${topFade}%, ${active} ${y}%, ${normal} ${bottomFade}%, ${normal} 100%)`
}

const useStyles = makeStyles({
  divider: {
    flexShrink: 0,
    width: `${WORKSPACE_SPLITTER_WIDTH}px`,
    alignSelf: 'stretch',
    position: 'relative',
    zIndex: WORKSPACE_SPLITTER_Z_INDEX,
    boxSizing: 'border-box',
    pointerEvents: 'none',
    backgroundColor: 'transparent',
  },
  line: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: `${WORKSPACE_SPLITTER_WIDTH}px`,
    pointerEvents: 'none',
    backgroundColor: opptrixCssVars.separatorStrong,
  },
  hitZone: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: `-${WORKSPACE_SPLITTER_HIT_SLOP}px`,
    right: `-${WORKSPACE_SPLITTER_HIT_SLOP}px`,
    cursor: 'col-resize',
    pointerEvents: 'auto',
    backgroundColor: 'transparent',
  },
  /** Extend into secondary content chrome (mac always; non-mac when requested). */
  dividerElectronChrome: {
    marginTop: `-${DESKTOP_TITLEBAR_HEIGHT}px`,
    height: `calc(100% + ${DESKTOP_TITLEBAR_HEIGHT}px)`,
  },
})

interface Props {
  electronChrome?: boolean
  /**
   * Extend the split into the secondary content chrome (title band).
   * - Left sidebar on non-mac: leave false so the line stops under the frame titlebar.
   * - Chat / right panel: true so the line meets the secondary headers.
   * Default: mac-only when `electronChrome` is set.
   */
  extendIntoSecondaryChrome?: boolean
  isDragging?: boolean
  onBeginDrag: (clientX: number) => void
  ariaLabel?: string
}

export default function WorkspaceSplitDivider({
  electronChrome = false,
  extendIntoSecondaryChrome,
  isDragging = false,
  onBeginDrag,
  ariaLabel = '调整聊天区与右侧面板宽度',
}: Props) {
  const s = useStyles()
  const dividerRef = useRef<HTMLDivElement>(null)
  const [focusRatio, setFocusRatio] = useState<number | null>(null)
  const active = focusRatio != null
  const extendIntoChrome = extendIntoSecondaryChrome
    ?? (electronChrome && electronPlatform() === 'darwin')

  const syncFocusFromClientY = useCallback((clientY: number) => {
    const el = dividerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.height <= 0) return
    const ratio = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
    setFocusRatio(ratio)
  }, [])

  useEffect(() => {
    if (!isDragging) return

    const onMove = (e: MouseEvent) => syncFocusFromClientY(e.clientY)
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [isDragging, syncFocusFromClientY])

  const bindHitZonePointer = {
    onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => syncFocusFromClientY(e.clientY),
    onMouseMove: (e: React.MouseEvent<HTMLDivElement>) => syncFocusFromClientY(e.clientY),
    onMouseLeave: () => {
      if (!isDragging) setFocusRatio(null)
    },
    onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault()
      syncFocusFromClientY(e.clientY)
      onBeginDrag(e.clientX)
    },
  }

  return (
    <div
      ref={dividerRef}
      className={mergeClasses(s.divider, extendIntoChrome && s.dividerElectronChrome)}
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
    >
      <div
        className={s.line}
        aria-hidden
        style={{ background: buildLineBackground(active ? focusRatio : null) }}
      />
      <div className={s.hitZone} aria-hidden {...bindHitZonePointer} />
    </div>
  )
}
