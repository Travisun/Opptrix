/**
 * Lightweight platform-alerts poll + toast (Wave 32A).
 * Not a notification center — additive overlay while AuthGate children are mounted.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Text, mergeClasses, makeStyles } from '@fluentui/react-components'
import { DismissRegular, InfoRegular } from '@fluentui/react-icons'
import {
  acknowledgePlatformAlert,
  fetchPlatformAlerts,
  type PlatformAlert,
} from '../api/client'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import { DESKTOP_TITLEBAR_HEIGHT } from '../desktop/constants'
import { glassPanel, motion } from '../theme/mixins'
import { opptrixCssVars, opptrixTokens } from '../theme/tokens'
import { isElectron } from './detect'

const POLL_MS = 20_000
const TOAST_DURATION_MS = 8_000
const EXIT_ANIMATION_MS = 180
const MAX_VISIBLE = 3

type ToastItem = {
  alertId: string
  message: string
  exiting?: boolean
}

const useStyles = makeStyles({
  viewport: {
    position: 'fixed',
    zIndex: 2050,
    top: '12px',
    right: '16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '8px',
    pointerEvents: 'none',
    maxWidth: 'min(380px, calc(100vw - 32px))',
  },
  viewportElectron: {
    top: `calc(${DESKTOP_TITLEBAR_HEIGHT}px + 10px)`,
  },
  toast: {
    pointerEvents: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    width: '100%',
    padding: '12px 12px 10px',
    borderRadius: opptrixTokens.radiusMd,
    border: `1px solid ${opptrixCssVars.separator}`,
    borderLeft: `3px solid ${opptrixCssVars.textTertiary}`,
    ...glassPanel,
    boxShadow: opptrixTokens.shadowPanel,
    animationName: {
      from: { opacity: 0, transform: 'translateX(12px)' },
      to: { opacity: 1, transform: 'translateX(0)' },
    },
    animationDuration: motion.normal,
    animationTimingFunction: motion.easeOut,
    animationFillMode: 'both',
  },
  toastExiting: {
    animationName: {
      from: { opacity: 1, transform: 'translateX(0)' },
      to: { opacity: 0, transform: 'translateX(12px)' },
    },
    animationDuration: `${EXIT_ANIMATION_MS}ms`,
    animationTimingFunction: motion.ease,
    animationFillMode: 'forwards',
  },
  row: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
  },
  icon: {
    flexShrink: 0,
    marginTop: '1px',
    lineHeight: 0,
    color: opptrixCssVars.textSecondary,
  },
  message: {
    flex: 1,
    minWidth: 0,
    fontSize: 'var(--opptrix-font-base)',
    lineHeight: 1.45,
    color: opptrixCssVars.textPrimary,
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    paddingLeft: '28px',
  },
})

/** Map known technical titles/kinds to product Chinese; otherwise use alert.title. */
export function productAlertTitle(alert: Pick<PlatformAlert, 'kind' | 'title'>): string {
  const kind = alert.kind.trim()
  const title = alert.title.trim()

  if (kind === 'job.terminal') {
    if (!title || /^Job\s+/i.test(title) || /job\.terminal/i.test(title)) {
      return '后台任务已结束'
    }
  }
  if (kind === 'extension.crashed') {
    if (!title || /^Extension\s+/i.test(title) || /crashed/i.test(title)) {
      return '扩展服务异常退出'
    }
  }

  if (!title || title === kind) {
    if (kind === 'job.terminal') return '后台任务已结束'
    if (kind === 'extension.crashed') return '扩展服务异常退出'
    return '有一条新提醒'
  }

  return title
}

async function ackQuiet(id: string): Promise<void> {
  try {
    await acknowledgePlatformAlert(id)
  } catch {
    /* fail-open */
  }
}

/**
 * Polls unacked platform alerts while the authenticated app shell is mounted.
 * Shows one product-language toast per alert (session-deduped); dismiss → acknowledge.
 */
export default function PlatformAlertsHost() {
  const s = useStyles()
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const shownRef = useRef<Set<string>>(new Set())
  const timersRef = useRef<Map<string, number>>(new Map())
  const mountedRef = useRef(true)
  const toastsRef = useRef(toasts)
  toastsRef.current = toasts

  const removeToast = useCallback((alertId: string) => {
    const timer = timersRef.current.get(alertId)
    if (timer != null) {
      window.clearTimeout(timer)
      timersRef.current.delete(alertId)
    }
    setToasts(prev => prev.filter(t => t.alertId !== alertId))
  }, [])

  const dismissAndAck = useCallback((alertId: string) => {
    setToasts(prev => prev.map(t => (t.alertId === alertId ? { ...t, exiting: true } : t)))
    window.setTimeout(() => removeToast(alertId), EXIT_ANIMATION_MS)
    void ackQuiet(alertId)
  }, [removeToast])

  const enqueue = useCallback((alert: PlatformAlert) => {
    if (shownRef.current.has(alert.id)) return
    if (toastsRef.current.some(t => t.alertId === alert.id)) return
    if (toastsRef.current.length >= MAX_VISIBLE) return

    shownRef.current.add(alert.id)
    setToasts(prev => [...prev, { alertId: alert.id, message: productAlertTitle(alert) }])
    const timer = window.setTimeout(() => dismissAndAck(alert.id), TOAST_DURATION_MS)
    timersRef.current.set(alert.id, timer)
  }, [dismissAndAck])

  useEffect(() => {
    mountedRef.current = true

    const poll = async () => {
      try {
        const result = await fetchPlatformAlerts({ includeAcknowledged: false })
        if (!mountedRef.current) return
        for (const alert of result.alerts) {
          if (alert.acknowledged) continue
          enqueue(alert)
        }
      } catch {
        /* fail-open: silent */
      }
    }

    void poll()
    const id = window.setInterval(() => {
      void poll()
    }, POLL_MS)

    return () => {
      mountedRef.current = false
      window.clearInterval(id)
      for (const timer of timersRef.current.values()) {
        window.clearTimeout(timer)
      }
      timersRef.current.clear()
    }
  }, [enqueue])

  if (!toasts.length) return null

  return (
    <div
      className={mergeClasses(s.viewport, isElectron() && s.viewportElectron)}
      aria-live="polite"
      aria-relevant="additions text"
    >
      {toasts.map(item => (
        <div
          key={item.alertId}
          className={mergeClasses(s.toast, item.exiting && s.toastExiting)}
          role="status"
        >
          <div className={s.row}>
            <InfoRegular className={s.icon} fontSize={18} />
            <Text className={s.message} block>{item.message}</Text>
            <OpptrixButton
              variant="icon"
              size="small"
              aria-label="关闭提示"
              icon={<DismissRegular fontSize={14} />}
              onClick={() => dismissAndAck(item.alertId)}
            />
          </div>
          <div className={s.actions}>
            <OpptrixButton
              variant="secondary"
              size="small"
              onClick={() => dismissAndAck(item.alertId)}
            >
              知道了
            </OpptrixButton>
          </div>
        </div>
      ))}
    </div>
  )
}
