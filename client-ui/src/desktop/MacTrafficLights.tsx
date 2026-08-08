import { useCallback, useEffect, useState, type MouseEvent } from 'react'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import { isElectron, electronPlatform } from '../platform/detect'
import {
  DESKTOP_CHROME_BAND_HEIGHT,
  DESKTOP_CHROME_TOP_OFFSET,
  DESKTOP_Z_CHROME_TOOLS,
} from './constants'

/** Visual diameter — compact but readable in the secondary chrome band. */
const DOT = 14
/** Click / hover hit box (slightly larger than the painted circle). */
const HIT = 16
const GAP = 6

const useStyles = makeStyles({
  root: {
    position: 'absolute',
    left: '13px',
    top: `${DESKTOP_CHROME_TOP_OFFSET}px`,
    height: `${DESKTOP_CHROME_BAND_HEIGHT}px`,
    display: 'flex',
    alignItems: 'center',
    gap: `${GAP}px`,
    zIndex: DESKTOP_Z_CHROME_TOOLS + 20,
    pointerEvents: 'auto',
    WebkitAppRegion: 'no-drag',
    // Native macOS: glyphs appear when hovering the traffic-light cluster.
    ':hover .opptrix-mac-tl-glyph': {
      opacity: 1,
    },
  },
  btn: {
    appearance: 'none',
    border: 'none',
    margin: 0,
    padding: 0,
    width: `${HIT}px`,
    height: `${HIT}px`,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'default',
    flexShrink: 0,
    boxSizing: 'border-box',
    backgroundColor: 'transparent',
    WebkitAppRegion: 'no-drag',
    position: 'relative',
    color: 'rgba(0, 0, 0, 0.55)',
  },
  dot: {
    width: `${DOT}px`,
    height: `${DOT}px`,
    borderRadius: '50%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
    pointerEvents: 'none',
  },
  close: {
    backgroundColor: '#FF5F57',
  },
  minimize: {
    backgroundColor: '#FEBC2E',
  },
  zoom: {
    backgroundColor: '#28C840',
  },
  muted: {
    backgroundColor: '#D0D0D0',
  },
  mutedDark: {
    backgroundColor: '#636366',
  },
  glyph: {
    width: '8px',
    height: '8px',
    opacity: 0,
    display: 'block',
    flexShrink: 0,
    transitionProperty: 'opacity',
    transitionDuration: '80ms',
  },
  glyphForced: {
    opacity: 1,
  },
  rootMuted: {
    // Unfocused window: never show glyphs (matches system chrome).
    ':hover .opptrix-mac-tl-glyph': {
      opacity: 0,
    },
  },
})

function CloseGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 6 6" aria-hidden>
      <path
        d="M1.1 1.1l3.8 3.8M4.9 1.1L1.1 4.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinecap="round"
      />
    </svg>
  )
}

function MinimizeGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 6 6" aria-hidden>
      <path
        d="M1 3h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Two opposing triangles — macOS zoom affordance. */
function ZoomGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 6 6" aria-hidden>
      <path d="M1.1 3.7V1.1H3.7" fill="currentColor" />
      <path d="M4.9 2.3V4.9H2.3" fill="currentColor" />
    </svg>
  )
}

/** Collapsed / restore affordance when already zoomed. */
function RestoreGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 6 6" aria-hidden>
      <path d="M3.7 1.1v2.6H1.1" fill="currentColor" />
      <path d="M2.3 4.9V2.3H4.9" fill="currentColor" />
    </svg>
  )
}

/**
 * Compact HTML stand-ins for macOS traffic lights.
 * Native buttons stay hidden (`setWindowButtonVisibility(false)`).
 * Must sit above title-bar drag regions (`-webkit-app-region: drag` steals clicks).
 */
export default function MacTrafficLights() {
  const s = useStyles()
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined
  const [focused, setFocused] = useState(true)
  const [maximized, setMaximized] = useState(false)
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    if (!isElectron() || electronPlatform() !== 'darwin') return undefined
    let cancelled = false
    const syncFocus = () => {
      void api?.windowIsFocused?.().then((v) => {
        if (!cancelled) setFocused(Boolean(v))
      }).catch(() => {
        if (!cancelled) setFocused(document.hasFocus())
      })
    }
    const syncMax = () => {
      void api?.getIsMaximized?.().then((v) => {
        if (!cancelled) setMaximized(Boolean(v))
      }).catch(() => { /* ignore */ })
    }
    syncFocus()
    syncMax()
    window.addEventListener('focus', syncFocus)
    window.addEventListener('blur', syncFocus)
    window.addEventListener('resize', syncMax)
    return () => {
      cancelled = true
      window.removeEventListener('focus', syncFocus)
      window.removeEventListener('blur', syncFocus)
      window.removeEventListener('resize', syncMax)
    }
  }, [api])

  const onClose = useCallback((e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    api?.windowClose?.()
  }, [api])

  const onMinimize = useCallback((e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    api?.windowMinimize?.()
  }, [api])

  const onZoom = useCallback((e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    api?.windowMaximize?.()
    window.setTimeout(() => {
      void api?.getIsMaximized?.().then((v) => setMaximized(Boolean(v)))
    }, 80)
  }, [api])

  if (!isElectron() || electronPlatform() !== 'darwin') return null

  const muted = !focused
  const dark =
    typeof document !== 'undefined' &&
    document.documentElement.getAttribute('data-theme') === 'dark'
  // React hover flag as fallback when CSS :hover is unreliable under Electron drag regions.
  const showGlyph = !muted && hovered
  const glyphClass = mergeClasses(
    s.glyph,
    'opptrix-mac-tl-glyph',
    showGlyph && s.glyphForced,
  )
  const muteDot = muted ? mergeClasses(s.muted, dark && s.mutedDark) : undefined

  return (
    <div
      className={mergeClasses(s.root, muted && s.rootMuted)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label="窗口控制"
      data-opptrix-mac-traffic-lights=""
    >
      <button
        type="button"
        className={s.btn}
        aria-label="关闭"
        title="关闭"
        onClick={onClose}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span className={mergeClasses(s.dot, s.close, muteDot)}>
          <CloseGlyph className={glyphClass} />
        </span>
      </button>
      <button
        type="button"
        className={s.btn}
        aria-label="最小化"
        title="最小化"
        onClick={onMinimize}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span className={mergeClasses(s.dot, s.minimize, muteDot)}>
          <MinimizeGlyph className={glyphClass} />
        </span>
      </button>
      <button
        type="button"
        className={s.btn}
        aria-label={maximized ? '还原' : '缩放'}
        title={maximized ? '还原' : '缩放'}
        onClick={onZoom}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span className={mergeClasses(s.dot, s.zoom, muteDot)}>
          {maximized
            ? <RestoreGlyph className={glyphClass} />
            : <ZoomGlyph className={glyphClass} />}
        </span>
      </button>
    </div>
  )
}
