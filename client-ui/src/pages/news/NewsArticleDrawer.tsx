import { useCallback, useEffect, useRef, useState } from 'react'
import { Spinner, makeStyles, mergeClasses } from '@fluentui/react-components'
import type { FeedArticle } from '../../types/schemas'
import { opptrixTokens, opptrixCssVars } from '../../theme/tokens'
import { motion } from '../../theme/mixins'
import {
  MARKET_PANEL_DRAWER_CLOSE_MS,
  MARKET_PANEL_DRAWER_MAX_HEIGHT,
} from '../../market/marketPanelDrawer'
import NewsArticleDetail from './NewsArticleDetail'

const useStyles = makeStyles({
  scrim: {
    position: 'absolute',
    inset: 0,
    zIndex: 29,
    border: 'none',
    padding: 0,
    margin: 0,
    backgroundColor: 'rgba(29, 29, 31, 0.18)',
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
  anchor: {
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
    maxHeight: MARKET_PANEL_DRAWER_MAX_HEIGHT,
    borderRadius: `${opptrixTokens.radiusXl} ${opptrixTokens.radiusXl} 0 0`,
    borderTop: `1px solid ${opptrixCssVars.separatorStrong}`,
    backgroundColor: opptrixCssVars.canvas,
    boxShadow: '0 -8px 32px rgba(0, 0, 0, 0.12)',
    transform: 'translateY(100%)',
    transitionProperty: 'transform',
    transitionDuration: motion.normal,
    transitionTimingFunction: motion.easeOut,
    pointerEvents: 'auto',
    overflow: 'hidden',
  },
  drawerOpen: {
    transform: 'translateY(0)',
  },
  handle: {
    width: '36px',
    height: '4px',
    borderRadius: opptrixTokens.radiusFull,
    backgroundColor: opptrixCssVars.borderStrong,
    margin: '8px auto 0',
    flexShrink: 0,
  },
  body: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  loading: {
    flex: 1,
    minHeight: '240px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
})

type Props = {
  open: boolean
  article: FeedArticle | null
  loading?: boolean
  onClose: () => void
  onDiscussArticle?: (article: FeedArticle) => void
}

export default function NewsArticleDrawer({
  open,
  article,
  loading = false,
  onClose,
  onDiscussArticle,
}: Props) {
  const s = useStyles()
  const closingRef = useRef(false)
  const [presented, setPresented] = useState(false)

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
  }, [onClose, presented])

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
    const timer = window.setTimeout(finishClose, MARKET_PANEL_DRAWER_CLOSE_MS + 40)
    return () => window.clearTimeout(timer)
  }, [presented, finishClose])

  useEffect(() => {
    if (!open || !presented) return undefined
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') beginClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [beginClose, open, presented])

  useEffect(() => {
    if (open) return
    if (!presented) return
    closingRef.current = true
    setPresented(false)
  }, [open, presented])

  if (!open && !presented && !closingRef.current) return null

  return (
    <>
      <button
        type="button"
        className={mergeClasses(s.scrim, 'opptrix-news-drawer-scrim', presented && s.scrimOpen)}
        aria-label="关闭文章"
        onClick={beginClose}
      />
      <div className={s.anchor}>
        <div
          className={mergeClasses(s.drawer, 'opptrix-news-article-drawer', presented && s.drawerOpen)}
          role="dialog"
          aria-modal="true"
          aria-label={article?.title ?? '资讯详情'}
          onTransitionEnd={handleDrawerTransitionEnd}
        >
          <div className={s.handle} aria-hidden />
          <div className={s.body}>
            {loading && !article ? (
              <div className={s.loading}>
                <Spinner size="medium" label="正在加载资讯…" />
              </div>
            ) : article ? (
              <NewsArticleDetail article={article} onDiscussArticle={onDiscussArticle} />
            ) : null}
          </div>
        </div>
      </div>
    </>
  )
}
