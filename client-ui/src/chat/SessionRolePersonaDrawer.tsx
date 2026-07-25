import { useEffect, useRef, useState } from 'react'
import { makeStyles, mergeClasses, Spinner, Text } from '@fluentui/react-components'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import OpptrixTextarea from '../components/opptrix/OpptrixTextarea'
import { getSessionRolePersona, updateSessionRolePersona } from '../api/client'
import { OPPTRIX_GLASS_PANEL_CLASS, motion } from '../theme/mixins'
import { opptrixCssVars, opptrixTokens } from '../theme/tokens'

/** 与 panel/scrim transition 对齐；关闭后再卸载 */
const DRAWER_MOTION_MS = 280

const useStyles = makeStyles({
  overlay: {
    position: 'absolute',
    inset: 0,
    zIndex: 40,
    pointerEvents: 'none',
    overflow: 'hidden',
  },
  scrim: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.14)',
    pointerEvents: 'auto',
    opacity: 0,
    transitionProperty: 'opacity',
    transitionDuration: `${DRAWER_MOTION_MS}ms`,
    transitionTimingFunction: motion.easeOut,
    '@media (prefers-reduced-motion: reduce)': {
      transitionDuration: '1ms',
    },
  },
  scrimOpen: {
    opacity: 1,
  },
  panel: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    maxHeight: 'min(52vh, 420px)',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '14px 16px 16px',
    boxSizing: 'border-box',
    pointerEvents: 'auto',
    borderBottomLeftRadius: opptrixTokens.radiusLg,
    borderBottomRightRadius: opptrixTokens.radiusLg,
    transform: 'translate3d(0, -104%, 0)',
    opacity: 0,
    transitionProperty: 'transform, opacity',
    transitionDuration: `${DRAWER_MOTION_MS}ms`,
    transitionTimingFunction: motion.easeOutStrong,
    willChange: 'transform, opacity',
    '@media (prefers-reduced-motion: reduce)': {
      transitionDuration: '1ms',
      transform: 'none',
      opacity: 0,
    },
  },
  panelOpen: {
    transform: 'translate3d(0, 0, 0)',
    opacity: 1,
    '@media (prefers-reduced-motion: reduce)': {
      opacity: 1,
    },
  },
  title: {
    fontSize: 'var(--opptrix-font-lg)',
    fontWeight: 650,
    color: opptrixCssVars.textPrimary,
  },
  hint: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.5,
  },
  body: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    overflow: 'hidden',
  },
  textarea: {
    minHeight: '140px',
    maxHeight: '220px',
  },
  error: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.error,
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    padding: '24px 0',
  },
})

interface Props {
  open: boolean
  sessionId: string | null
  onOpenChange: (open: boolean) => void
}

export default function SessionRolePersonaDrawer({ open, sessionId, onOpenChange }: Props) {
  const s = useStyles()
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(false)
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const closeTimerRef = useRef<number | null>(null)
  const openRafRef = useRef<number | null>(null)

  useEffect(() => {
    const clearTimers = () => {
      if (closeTimerRef.current != null) {
        window.clearTimeout(closeTimerRef.current)
        closeTimerRef.current = null
      }
      if (openRafRef.current != null) {
        window.cancelAnimationFrame(openRafRef.current)
        openRafRef.current = null
      }
    }

    if (open) {
      clearTimers()
      setMounted(true)
      // 双 rAF：先挂载闭合态，再切到展开态，确保 slide-down 可感知
      openRafRef.current = requestAnimationFrame(() => {
        openRafRef.current = requestAnimationFrame(() => {
          openRafRef.current = null
          setVisible(true)
        })
      })
      return clearTimers
    }

    setVisible(false)
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null
      setMounted(false)
    }, DRAWER_MOTION_MS)
    return clearTimers
  }, [open])

  useEffect(() => {
    if (!open || !sessionId) return
    let cancelled = false
    setLoading(true)
    setError('')
    void getSessionRolePersona(sessionId)
      .then(res => {
        if (!cancelled) setDraft(res.rolePersona)
      })
      .catch(e => {
        if (!cancelled) {
          setDraft('')
          setError(e instanceof Error ? e.message : '暂时无法加载技能专长')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [open, sessionId])

  useEffect(() => {
    if (!mounted || !visible) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onOpenChange(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mounted, visible, onOpenChange])

  if (!mounted || !sessionId) return null

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      await updateSessionRolePersona(sessionId, draft)
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败，请稍后重试')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={s.overlay} aria-hidden={!visible}>
      <div
        className={mergeClasses(s.scrim, visible && s.scrimOpen)}
        onClick={() => onOpenChange(false)}
      />
      <div
        className={mergeClasses(
          s.panel,
          OPPTRIX_GLASS_PANEL_CLASS,
          visible && s.panelOpen,
        )}
        role="dialog"
        aria-modal="true"
        aria-label="编辑技能专长"
      >
        <Text className={s.title} block>技能专长</Text>
        <Text className={s.hint} block>
          只影响当前对话。改这里不会改专家目录里的设定。
        </Text>
        <div className={s.body}>
          {loading ? (
            <div className={s.loading}>
              <Spinner size="tiny" label="正在加载…" />
            </div>
          ) : (
            <OpptrixTextarea
              className={s.textarea}
              value={draft}
              onChange={(_e, data) => setDraft(data.value)}
              placeholder="描述这位助手在本对话里怎么思考、怎么回答"
              rows={7}
              disabled={saving}
              aria-label="技能专长"
            />
          )}
          {error ? <Text className={s.error}>{error}</Text> : null}
        </div>
        <div className={s.actions}>
          <OpptrixButton variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>
            取消
          </OpptrixButton>
          <OpptrixButton
            variant="primary"
            disabled={saving || loading || !draft.trim()}
            onClick={() => { void handleSave() }}
          >
            {saving ? '保存中…' : '保存'}
          </OpptrixButton>
        </div>
      </div>
    </div>
  )
}
