import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { Text, mergeClasses } from '@fluentui/react-components'
import { getAuthStatus, type AuthStatus } from '../api/auth'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import {
  OnboardingHeroBlock,
  useOnboardingShellStyles,
} from '../onboarding/OnboardingShell'
import { AuthStepUpProvider } from './AuthStepUp'
import { subscribeAuthRequired } from './authEvents'
import { formatAuthError } from './authErrors'
import { AuthLoadingScreen, AuthWindowShell, LoginView } from './LoginView'

interface AuthContextValue {
  status: AuthStatus | null
  reload: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuthStatus(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuthStatus must be used within AuthGate')
  }
  return ctx
}

function needsLogin(status: AuthStatus): boolean {
  return status.auth_required && !status.session
}

function AuthLoadError({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  const shell = useOnboardingShellStyles()
  return (
    <AuthWindowShell>
      <div className={shell.stage}>
        <div className={mergeClasses(shell.scrollViewport, 'opptrix-onboarding-scroll')}>
          <div className={mergeClasses(shell.scrollInner, shell.scrollInnerDisplay)}>
            <div className={mergeClasses(shell.content, shell.contentDisplay)}>
              <OnboardingHeroBlock>
                <Text className={shell.displayTitle} block>暂时无法连接</Text>
                <Text className={shell.displayLead} block>
                  {message}请确认服务已启动后重试。
                </Text>
              </OnboardingHeroBlock>
            </div>
          </div>
        </div>
        <div className={mergeClasses(shell.footerDock, 'opptrix-onboarding-footer-dock')}>
          <div className={mergeClasses(shell.chromeRail, shell.chromeRailDisplay)}>
            <footer className={shell.footerSingle}>
              <OpptrixButton variant="primary" onClick={onRetry}>重试</OpptrixButton>
            </footer>
          </div>
        </div>
      </div>
    </AuthWindowShell>
  )
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [forceLogin, setForceLogin] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const next = await getAuthStatus()
      setStatus(next)
      if (next.session) setForceLogin(false)
    } catch (err) {
      setError(formatAuthError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    return subscribeAuthRequired(() => {
      setForceLogin(true)
    })
  }, [])

  const value = useMemo<AuthContextValue>(() => ({ status, reload }), [status, reload])

  if (loading && !status) {
    return <AuthLoadingScreen label="正在准备…" />
  }

  if (error && !status) {
    return <AuthLoadError message={`${error}。`} onRetry={() => { void reload() }} />
  }

  const showLogin = forceLogin || (status != null && needsLogin(status))

  if (showLogin) {
    return (
      <AuthContext.Provider value={value}>
        <LoginView onSuccess={() => { void reload() }} />
      </AuthContext.Provider>
    )
  }

  return (
    <AuthContext.Provider value={value}>
      <AuthStepUpProvider>
        {children}
      </AuthStepUpProvider>
    </AuthContext.Provider>
  )
}
