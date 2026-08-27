import { useCallback, useEffect, useRef, useState } from 'react'
import { Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { DismissRegular } from '@fluentui/react-icons'
import type { WatchlistGroupsDocument, WatchlistItem } from '../types/market'
import WatchlistGroupsPanel from './WatchlistGroupsPanel'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
import { motion, nativeIconInteractive } from '../theme/mixins'

const DRAWER_CLOSE_MS = 220

const useStyles = makeStyles({
  scrim: {
    position: 'absolute',
    inset: 0,
    zIndex: 29,
    border: 'none',
    padding: 0,
    margin: 0,
    backgroundColor: 'rgba(29, 29, 31, 0.05)',
    cursor: 'default',
    opacity: 0,
    pointerEvents: 'none',
    transitionProperty: 'opacity',
    transitionDuration: motion.normal,
    transitionTimingFunction: motion.ease,
  },
  scrimOpen: {
    opacity: 1,
    pointerEvents: 'auto',
  },
  drawerAnchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 30,
    display: 'flex',
    justifyContent: 'center',
    pointerEvents: 'none',
    padding: 0,
    boxSizing: 'border-box',
  },
  drawer: {
    width: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    maxHeight: 'min(88%, 560px)',
    borderRadius: `${opptrixTokens.radiusXl} ${opptrixTokens.radiusXl} 0 0`,
    borderTop: '1px solid rgba(255, 255, 255, 0.55)',
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    backdropFilter: 'blur(16px) saturate(160%)',
    WebkitBackdropFilter: 'blur(16px) saturate(160%)',
    boxShadow: '0 -4px 24px rgba(0, 0, 0, 0.08)',
    transform: 'translateY(100%)',
    transitionProperty: 'transform',
    transitionDuration: motion.normal,
    transitionTimingFunction: motion.easeOut,
    pointerEvents: 'auto',
    '@media (prefers-reduced-motion: reduce)': {
      transitionDuration: '1ms',
    },
  },
  drawerOpen: {
    transform: 'translateY(0)',
  },
  handle: {
    width: '32px',
    height: '4px',
    borderRadius: opptrixTokens.radiusFull,
    backgroundColor: opptrixCssVars.borderStrong,
    margin: '8px auto 0',
    flexShrink: 0,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    padding: '4px 12px 8px',
    flexShrink: 0,
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: 'var(--opptrix-font-lg)',
    fontWeight: 650,
    letterSpacing: '-0.02em',
    color: opptrixCssVars.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  closeBtn: {
    ...nativeIconInteractive,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    minWidth: '28px',
    minHeight: '28px',
    padding: 0,
    margin: 0,
    borderRadius: opptrixTokens.radiusFull,
    lineHeight: 0,
    flexShrink: 0,
    ':hover': {
      backgroundColor: 'rgba(29, 29, 31, 0.08)',
      color: opptrixCssVars.textPrimary,
    },
  },
  body: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    padding: '0 10px 10px',
    boxSizing: 'border-box',
  },
})

type Props = {
  open: boolean
  items: WatchlistItem[]
  doc: WatchlistGroupsDocument
  onClose: () => void
  onSave: (doc: WatchlistGroupsDocument) => Promise<void>
}

export default function WatchlistGroupsDrawer({ open, items, doc, onClose, onSave }: Props) {
  const s = useStyles()
  const [presented, setPresented] = useState(false)
  const closingRef = useRef(false)

  const finishClose = useCallback(() => {
    if (!closingRef.current) return
    closingRef.current = false
    onClose()
  }, [onClose])

  const beginClose = useCallback(() => {
    if (closingRef.current) return
    if (!presented) {
      onClose()
      return
    }
    closingRef.current = true
    setPresented(false)
  }, [presented, onClose])

  const handleDrawerTransitionEnd = useCallback((e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    if (e.propertyName !== 'transform') return
    finishClose()
  }, [finishClose])

  useEffect(() => {
    if (!open) return undefined
    closingRef.current = false
    setPresented(false)
    const id = requestAnimationFrame(() => setPresented(true))
    return () => cancelAnimationFrame(id)
  }, [open])

  useEffect(() => {
    if (presented || !closingRef.current) return undefined
    const timer = window.setTimeout(finishClose, DRAWER_CLOSE_MS + 40)
    return () => window.clearTimeout(timer)
  }, [presented, finishClose])

  if (!open && !presented && !closingRef.current) return null

  return (
    <>
      <button
        type="button"
        className={mergeClasses(s.scrim, 'opptrix-watchlist-groups-drawer-scrim', presented && s.scrimOpen)}
        aria-label="关闭"
        onClick={beginClose}
      />
      <div className={s.drawerAnchor}>
        <div
          className={mergeClasses(s.drawer, 'opptrix-watchlist-groups-drawer', presented && s.drawerOpen)}
          role="dialog"
          aria-modal="false"
          aria-hidden={!presented}
          aria-label="管理关注分组"
          onTransitionEnd={handleDrawerTransitionEnd}
        >
          <div className={s.handle} aria-hidden />
          <div className={s.header}>
            <Text className={s.title} as="span">管理分组</Text>
            <button
              type="button"
              className={mergeClasses(s.closeBtn, 'opptrix-focusable')}
              aria-label="关闭"
              onClick={beginClose}
            >
              <DismissRegular fontSize={14} />
            </button>
          </div>
          <div className={s.body}>
            <WatchlistGroupsPanel
              items={items}
              doc={doc}
              onClose={beginClose}
              onSave={onSave}
              variant="drawer"
            />
          </div>
        </div>
      </div>
    </>
  )
}
