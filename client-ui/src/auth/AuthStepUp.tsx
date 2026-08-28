import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
} from '@fluentui/react-components'
import { submitAuthStepUp } from '../api/auth'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import { opptrixCssVars } from '../theme/tokens'
import { resolveStepUp, subscribeStepUpRequired } from './authEvents'
import { AuthCodeField } from './AuthFields'
import { formatAuthError } from './authErrors'

const useStyles = makeStyles({
  lead: {
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.55,
    marginBottom: '12px',
  },
  error: {
    marginTop: '10px',
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.error,
    lineHeight: 1.45,
  },
})

interface AuthStepUpContextValue {
  runWithStepUp: <T>(action: () => Promise<T>) => Promise<T>
}

const AuthStepUpContext = createContext<AuthStepUpContextValue | null>(null)

export function AuthStepUpProvider({ children }: { children: ReactNode }) {
  const s = useStyles()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const close = useCallback((ok: boolean) => {
    setOpen(false)
    setCode('')
    setError('')
    setBusy(false)
    resolveStepUp(ok)
  }, [])

  useEffect(() => {
    return subscribeStepUpRequired(() => {
      setCode('')
      setError('')
      setOpen(true)
    })
  }, [])

  const confirm = useCallback(async () => {
    if (!/^\d{6}$/.test(code)) {
      setError('请输入身份验证器中的 6 位数字')
      return
    }
    setBusy(true)
    setError('')
    try {
      await submitAuthStepUp(code)
      close(true)
    } catch (err) {
      setError(formatAuthError(err))
      setBusy(false)
    }
  }, [code, close])

  const runWithStepUp = useCallback(async <T,>(action: () => Promise<T>): Promise<T> => {
    return action()
  }, [])

  const value = useMemo<AuthStepUpContextValue>(() => ({ runWithStepUp }), [runWithStepUp])

  return (
    <AuthStepUpContext.Provider value={value}>
      {children}
      <Dialog
        open={open}
        modalType="alert"
        onOpenChange={(_, data) => {
          if (!data.open) close(false)
        }}
      >
        <DialogSurface className="opptrix-glass-dialog-surface opptrix-dialog-alert-surface">
          <DialogBody className="opptrix-dialog-alert-body">
            <DialogTitle className="opptrix-dialog-alert-title">敏感操作需验证</DialogTitle>
            <DialogContent className="opptrix-dialog-alert-content">
              <Text className={s.lead} block>
                打开身份验证器，输入当前显示的 6 位数字后再继续。
              </Text>
              <AuthCodeField value={code} onChange={setCode} disabled={busy} />
              {error ? <Text className={s.error} block role="alert">{error}</Text> : null}
            </DialogContent>
            <DialogActions className="opptrix-dialog-alert-actions">
              <OpptrixButton variant="ghost" disabled={busy} onClick={() => close(false)}>
                取消
              </OpptrixButton>
              <OpptrixButton variant="primary" disabled={busy} onClick={() => { void confirm() }}>
                {busy ? '正在验证…' : '继续'}
              </OpptrixButton>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </AuthStepUpContext.Provider>
  )
}

export function useAuthStepUp(): AuthStepUpContextValue {
  const ctx = useContext(AuthStepUpContext)
  if (!ctx) {
    throw new Error('useAuthStepUp must be used within AuthStepUpProvider')
  }
  return ctx
}
