import { useCallback, useEffect, useState } from 'react'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import { isElectron } from '../platform/detect'
import { DESKTOP_FRAME_TITLEBAR_HEIGHT } from './constants'

/** Win11 caption button width — fixed across titlebar heights. */
const WIN_CAPTION_WIDTH = 46

const useStyles = makeStyles({
  controls: {
    display: 'flex',
    alignItems: 'stretch',
    alignSelf: 'stretch',
    height: '100%',
    margin: 0,
    padding: 0,
    gap: '0',
    WebkitAppRegion: 'no-drag',
  },
  btn: {
    appearance: 'none',
    border: 'none',
    margin: 0,
    padding: 0,
    width: `${WIN_CAPTION_WIDTH}px`,
    height: '100%',
    minHeight: `${DESKTOP_FRAME_TITLEBAR_HEIGHT}px`,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    color: 'var(--opptrix-text-primary, #1a1a1a)',
    cursor: 'default',
    borderRadius: 0,
    flexShrink: 0,
    ':hover': {
      backgroundColor: 'rgba(0, 0, 0, 0.06)',
      color: 'var(--opptrix-text-primary, #1a1a1a)',
    },
    ':active': {
      backgroundColor: 'rgba(0, 0, 0, 0.04)',
    },
  },
  btnDarkHover: {
    ':hover': {
      backgroundColor: 'rgba(255, 255, 255, 0.08)',
      color: 'var(--opptrix-text-primary, #f3f3f3)',
    },
    ':active': {
      backgroundColor: 'rgba(255, 255, 255, 0.06)',
    },
  },
  closeBtn: {
    ':hover': {
      backgroundColor: '#C42B1C',
      color: '#FFFFFF',
    },
    ':active': {
      backgroundColor: '#B22519',
      color: '#FFFFFF',
    },
  },
  glyph: {
    display: 'block',
    width: '12px',
    height: '12px',
    flexShrink: 0,
  },
})

type WindowControlsProps = {
  className?: string
}

function MinimizeGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 12 12" aria-hidden>
      <path
        d="M1.5 6h9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  )
}

function MaximizeGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 12 12" aria-hidden>
      <rect
        x="1.5"
        y="1.5"
        width="9"
        height="9"
        rx="1.5"
        ry="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
      />
    </svg>
  )
}

function RestoreGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 12 12" aria-hidden>
      {/* Rear window: only the visible top + right edges with rounded corner */}
      <path
        d="M4.2 3.35V2.7c0-.72.58-1.3 1.3-1.3h4c.72 0 1.3.58 1.3 1.3v4c0 .72-.58 1.3-1.3 1.3H8.55"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Front window */}
      <rect
        x="1.45"
        y="3.7"
        width="7.1"
        height="7.1"
        rx="1.4"
        ry="1.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
      />
    </svg>
  )
}

function CloseGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 12 12" aria-hidden>
      <path
        d="M2.2 2.2l7.6 7.6M9.8 2.2L2.2 9.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  )
}

function usePrefersDarkChrome(): boolean {
  const [dark, setDark] = useState(() => {
    if (typeof document === 'undefined') return false
    return document.documentElement.getAttribute('data-theme') === 'dark'
  })

  useEffect(() => {
    const root = document.documentElement
    const sync = () => setDark(root.getAttribute('data-theme') === 'dark')
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  return dark
}

/** Win11-style caption buttons for non-mac Electron — full titlebar height, 46px wide. */
export default function WindowControls({ className }: WindowControlsProps) {
  const s = useStyles()
  const api = window.electronAPI
  const dark = usePrefersDarkChrome()
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (!api?.getIsMaximized) return
    let cancelled = false
    void api.getIsMaximized().then((v) => {
      if (!cancelled) setMaximized(Boolean(v))
    })
    return () => { cancelled = true }
  }, [api])

  const onMinimize = useCallback(() => {
    api?.windowMinimize?.()
  }, [api])

  const onMaximize = useCallback(() => {
    api?.windowMaximize?.()
    // Toggle is handled in main; refresh state after a tick.
    window.setTimeout(() => {
      void api?.getIsMaximized?.().then((v) => setMaximized(Boolean(v)))
    }, 50)
  }, [api])

  const onClose = useCallback(() => {
    api?.windowClose?.()
  }, [api])

  if (!isElectron() || !api || api.platform === 'darwin') return null

  const chromeBtn = mergeClasses(s.btn, dark && s.btnDarkHover)

  return (
    <div className={mergeClasses(s.controls, className)}>
      <button type="button" className={chromeBtn} aria-label="Minimize" title="最小化" onClick={onMinimize}>
        <MinimizeGlyph className={s.glyph} />
      </button>
      <button
        type="button"
        className={chromeBtn}
        aria-label={maximized ? 'Restore' : 'Maximize'}
        title={maximized ? '向下还原' : '最大化'}
        onClick={onMaximize}
      >
        {maximized ? <RestoreGlyph className={s.glyph} /> : <MaximizeGlyph className={s.glyph} />}
      </button>
      <button
        type="button"
        className={mergeClasses(s.btn, s.closeBtn)}
        aria-label="Close"
        title="关闭"
        onClick={onClose}
      >
        <CloseGlyph className={s.glyph} />
      </button>
    </div>
  )
}
