import { useCallback, useEffect, useRef, useState } from 'react'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import { opptrixTokens } from '../theme/tokens'
import {
  DESKTOP_TITLEBAR_HEIGHT,
  WORKSPACE_SPLITTER_HIT_SLOP,
  WORKSPACE_SPLITTER_WIDTH,
  WORKSPACE_SPLITTER_Z_INDEX,
} from '../desktop/constants'

const FOCUS_FADE_PERCENT = 14

function buildLineBackground(focusRatio: number | null): string {
  const normal = opptrixTokens.separatorStrong
  if (focusRatio == null) return normal

  const y = focusRatio * 100
  const fade = FOCUS_FADE_PERCENT
  const active = opptrixTokens.textTertiary
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
    backgroundColor: opptrixTokens.separatorStrong,
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
  dividerElectron: {
    marginTop: `-${DESKTOP_TITLEBAR_HEIGHT}px`,
    height: `calc(100% + ${DESKTOP_TITLEBAR_HEIGHT}px)`,
  },
})

interface Props {
  electronChrome?: boolean
  isDragging?: boolean
  onBeginDrag: (clientX: number) => void
}

export default function WorkspaceSplitDivider({
  electronChrome = false,
  isDragging = false,
  onBeginDrag,
}: Props) {
  const s = useStyles()
  const dividerRef = useRef<HTMLDivElement>(null)
  const [focusRatio, setFocusRatio] = useState<number | null>(null)
  const active = focusRatio != null

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
      className={mergeClasses(s.divider, electronChrome && s.dividerElectron)}
      role="separator"
      aria-orientation="vertical"
      aria-label="调整聊天区与右侧面板宽度"
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
