import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import {
  CheckmarkCircleRegular,
  DismissRegular,
  ErrorCircleRegular,
  InfoRegular,
  WarningRegular,
} from '@fluentui/react-icons'
import { isElectron } from '../../platform/detect'
import { DESKTOP_TITLEBAR_HEIGHT } from '../../desktop/constants'
import { opptrixTokens } from '../../theme/tokens'
import { glassPanel, motion } from '../../theme/mixins'

export type SettingsToastTone = 'success' | 'error' | 'info' | 'warning'

interface ToastItem {
  id: string
  message: string
  tone: SettingsToastTone
  exiting?: boolean
}

interface SettingsToastContextValue {
  showToast: (message: string, tone?: SettingsToastTone) => void
  showSuccess: (message: string) => void
  showError: (message: string) => void
  showInfo: (message: string) => void
  showWarning: (message: string) => void
}

const SettingsToastContext = createContext<SettingsToastContextValue | null>(null)

const MAX_TOASTS = 3
const TOAST_DURATION_MS: Record<SettingsToastTone, number> = {
  success: 3500,
  error: 5200,
  info: 4000,
  warning: 4500,
}
const EXIT_ANIMATION_MS = 180

const useStyles = makeStyles({
  viewport: {
    position: 'fixed',
    zIndex: 1400,
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
    alignItems: 'flex-start',
    gap: '10px',
    width: '100%',
    padding: '10px 12px',
    borderRadius: opptrixTokens.radiusMd,
    border: `1px solid ${opptrixTokens.separator}`,
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
  icon: {
    flexShrink: 0,
    marginTop: '1px',
    lineHeight: 0,
  },
  message: {
    flex: 1,
    minWidth: 0,
    fontSize: '13px',
    lineHeight: 1.45,
    color: opptrixTokens.textPrimary,
  },
  dismissBtn: {
    flexShrink: 0,
    border: 'none',
    background: 'transparent',
    color: opptrixTokens.textTertiary,
    cursor: 'pointer',
    padding: '2px',
    lineHeight: 0,
    borderRadius: opptrixTokens.radiusSm,
    ':hover': {
      color: opptrixTokens.textPrimary,
      backgroundColor: 'rgba(29, 29, 31, 0.06)',
    },
  },
  toneSuccess: {
    borderLeft: `3px solid ${opptrixTokens.success}`,
  },
  toneError: {
    borderLeft: `3px solid ${opptrixTokens.error}`,
  },
  toneInfo: {
    borderLeft: `3px solid ${opptrixTokens.textTertiary}`,
  },
  toneWarning: {
    borderLeft: `3px solid ${opptrixTokens.warning}`,
  },
  iconSuccess: { color: opptrixTokens.success },
  iconError: { color: opptrixTokens.error },
  iconInfo: { color: opptrixTokens.textSecondary },
  iconWarning: { color: opptrixTokens.warning },
})

function toneClass(s: ReturnType<typeof useStyles>, tone: SettingsToastTone) {
  if (tone === 'success') return s.toneSuccess
  if (tone === 'error') return s.toneError
  if (tone === 'warning') return s.toneWarning
  return s.toneInfo
}

function toneIcon(s: ReturnType<typeof useStyles>, tone: SettingsToastTone) {
  const cls = s.icon
  if (tone === 'success') return <CheckmarkCircleRegular className={mergeClasses(cls, s.iconSuccess)} fontSize={18} />
  if (tone === 'error') return <ErrorCircleRegular className={mergeClasses(cls, s.iconError)} fontSize={18} />
  if (tone === 'warning') return <WarningRegular className={mergeClasses(cls, s.iconWarning)} fontSize={18} />
  return <InfoRegular className={mergeClasses(cls, s.iconInfo)} fontSize={18} />
}

function SettingsToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[]
  onDismiss: (id: string) => void
}) {
  const s = useStyles()
  if (!toasts.length) return null

  return (
    <div
      className={mergeClasses(s.viewport, isElectron() && s.viewportElectron)}
      aria-live="polite"
      aria-relevant="additions text"
    >
      {toasts.map(item => (
        <div
          key={item.id}
          className={mergeClasses(s.toast, toneClass(s, item.tone), item.exiting && s.toastExiting)}
          role="status"
        >
          {toneIcon(s, item.tone)}
          <Text className={s.message} block>{item.message}</Text>
          <button
            type="button"
            className={s.dismissBtn}
            aria-label="关闭提示"
            onClick={() => onDismiss(item.id)}
          >
            <DismissRegular fontSize={14} />
          </button>
        </div>
      ))}
    </div>
  )
}

export function SettingsToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timersRef = useRef<Map<string, number>>(new Map())

  const removeToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id)
    if (timer != null) {
      window.clearTimeout(timer)
      timersRef.current.delete(id)
    }
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.map(t => (t.id === id ? { ...t, exiting: true } : t)))
    window.setTimeout(() => removeToast(id), EXIT_ANIMATION_MS)
  }, [removeToast])

  const showToast = useCallback((message: string, tone: SettingsToastTone = 'info') => {
    const trimmed = message.trim()
    if (!trimmed) return
    const id = crypto.randomUUID()
    setToasts(prev => [...prev.slice(-(MAX_TOASTS - 1)), { id, message: trimmed, tone }])
    const timer = window.setTimeout(() => dismissToast(id), TOAST_DURATION_MS[tone])
    timersRef.current.set(id, timer)
  }, [dismissToast])

  const value = useMemo<SettingsToastContextValue>(() => ({
    showToast,
    showSuccess: (message: string) => showToast(message, 'success'),
    showError: (message: string) => showToast(message, 'error'),
    showInfo: (message: string) => showToast(message, 'info'),
    showWarning: (message: string) => showToast(message, 'warning'),
  }), [showToast])

  return (
    <SettingsToastContext.Provider value={value}>
      {children}
      <SettingsToastViewport toasts={toasts} onDismiss={dismissToast} />
    </SettingsToastContext.Provider>
  )
}

export function useSettingsToast(): SettingsToastContextValue {
  const ctx = useContext(SettingsToastContext)
  if (!ctx) {
    throw new Error('useSettingsToast must be used within SettingsToastProvider')
  }
  return ctx
}
