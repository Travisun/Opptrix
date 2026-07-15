import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Text,
  makeStyles,
  mergeClasses,
} from '@fluentui/react-components'
import { opptrixCssVars } from '../../theme/tokens'
import OpptrixButton from './OpptrixButton'

export type OpptrixDialogAlertTone = 'default' | 'danger'

export interface OpptrixDialogAlertOptions {
  title: string
  message?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  confirmTone?: OpptrixDialogAlertTone
  confirmDisabled?: boolean
}

export interface OpptrixDialogAlertProps extends OpptrixDialogAlertOptions {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
}

interface PendingAlert extends OpptrixDialogAlertOptions {
  resolve: (confirmed: boolean) => void
}

interface OpptrixDialogAlertContextValue {
  /** 二次确认，返回用户是否点击确认 */
  confirm: (options: OpptrixDialogAlertOptions) => Promise<boolean>
}

const OpptrixDialogAlertContext = createContext<OpptrixDialogAlertContextValue | null>(null)

const useStyles = makeStyles({
  message: {
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.55,
    whiteSpace: 'pre-wrap',
  },
})

export function OpptrixDialogAlert({
  open,
  title,
  message,
  confirmLabel = '确定',
  cancelLabel = '取消',
  confirmTone = 'default',
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: OpptrixDialogAlertProps) {
  const s = useStyles()

  return (
    <Dialog
      open={open}
      modalType="alert"
      onOpenChange={(_, data) => {
        if (!data.open) onCancel()
      }}
    >
      <DialogSurface className="opptrix-glass-dialog-surface opptrix-dialog-alert-surface">
        <DialogBody className="opptrix-dialog-alert-body">
          <DialogTitle className="opptrix-dialog-alert-title">{title}</DialogTitle>
          {message != null && message !== '' && (
            <DialogContent className="opptrix-dialog-alert-content">
              {typeof message === 'string'
                ? <Text className={s.message} block>{message}</Text>
                : message}
            </DialogContent>
          )}
          <DialogActions className="opptrix-dialog-alert-actions">
            <OpptrixButton variant="ghost" onClick={onCancel}>
              {cancelLabel}
            </OpptrixButton>
            <OpptrixButton
              variant="primary"
              disabled={confirmDisabled}
              className={mergeClasses(
                confirmTone === 'danger' && 'opptrix-btn-danger',
              )}
              onClick={onConfirm}
            >
              {confirmLabel}
            </OpptrixButton>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}

export function OpptrixDialogAlertProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingAlert | null>(null)

  const confirm = useCallback((options: OpptrixDialogAlertOptions) => {
    return new Promise<boolean>(resolve => {
      setPending({ ...options, resolve })
    })
  }, [])

  const finish = useCallback((confirmed: boolean) => {
    setPending(current => {
      current?.resolve(confirmed)
      return null
    })
  }, [])

  const value = useMemo<OpptrixDialogAlertContextValue>(() => ({ confirm }), [confirm])

  return (
    <OpptrixDialogAlertContext.Provider value={value}>
      {children}
      {pending && (
        <OpptrixDialogAlert
          open
          title={pending.title}
          message={pending.message}
          confirmLabel={pending.confirmLabel}
          cancelLabel={pending.cancelLabel}
          confirmTone={pending.confirmTone}
          confirmDisabled={pending.confirmDisabled}
          onConfirm={() => finish(true)}
          onCancel={() => finish(false)}
        />
      )}
    </OpptrixDialogAlertContext.Provider>
  )
}

export function useOpptrixDialogAlert(): OpptrixDialogAlertContextValue {
  const ctx = useContext(OpptrixDialogAlertContext)
  if (!ctx) {
    throw new Error('useOpptrixDialogAlert must be used within OpptrixDialogAlertProvider')
  }
  return ctx
}
