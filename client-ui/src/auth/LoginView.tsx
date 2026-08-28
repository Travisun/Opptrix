import { useCallback, useState, type FormEvent, type ReactNode } from 'react'
import { Spinner, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { loginWithPassword, loginWithTotp } from '../api/auth'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import MacTrafficLights from '../desktop/MacTrafficLights'
import { desktopFrameTitlebarHeight } from '../desktop/layout'
import { useElectronFullscreen } from '../hooks/useElectronFullscreen'
import { electronPlatform, isElectron } from '../platform/detect'
import { opptrixCssVars } from '../theme/tokens'
import { useOnboardingShellStyles } from '../onboarding/OnboardingShell'
import {
  AuthCodeField,
  AuthFieldStack,
  AuthPasswordField,
  AuthUsernameField,
} from './AuthFields'
import { formatAuthError } from './authErrors'

/** Electron shell chrome shared by login / loading / error (mac drag + traffic lights). */
function AuthWindowShell({ children }: { children: ReactNode }) {
  const shell = useOnboardingShellStyles()
  const macFullscreen = useElectronFullscreen()
  const electronChrome = isElectron()
  const electronWin = electronChrome && electronPlatform() !== 'darwin'
  const showTitleBar = electronChrome && desktopFrameTitlebarHeight() === 0
  const showTrafficLights =
    showTitleBar && electronPlatform() === 'darwin' && !macFullscreen

  return (
    <div
      className={mergeClasses(
        shell.root,
        electronWin && shell.rootFrameTitlebar,
        'opptrix-onboarding-shell',
      )}
    >
      {showTitleBar ? (
        <header
          className={mergeClasses(
            shell.electronTitleBar,
            'opptrix-onboarding-title-bar',
            electronWin ? shell.electronTitleBarWin : shell.electronTitleBarMac,
          )}
        >
          <div
            className={mergeClasses(shell.titleBarDragOverlay, 'opptrix-onboarding-title-drag')}
            aria-hidden
          />
          {showTrafficLights ? <MacTrafficLights /> : null}
          <Text className={shell.titleBarBrand} block>
            Opptrix
          </Text>
        </header>
      ) : null}
      {children}
    </div>
  )
}

const useStyles = makeStyles({
  form: {
    marginTop: '10px',
    width: '100%',
    maxWidth: '400px',
  },
  loginHero: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '100%',
    padding: '0 4px 4px',
    textAlign: 'center',
  },
  loginTitle: {
    fontSize: 'clamp(1.25rem, 2.2vw, 1.5rem)',
    fontWeight: 650,
    letterSpacing: '-0.02em',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.3,
  },
  loginLead: {
    marginTop: '6px',
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.5,
  },
  actions: {
    marginTop: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
    width: '100%',
    '> :last-child': {
      marginLeft: 'auto',
    },
  },
  hint: {
    marginTop: '8px',
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.45,
  },
})

export function LoginView({ onSuccess }: { onSuccess: () => void }) {
  const shell = useOnboardingShellStyles()
  const s = useStyles()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [ticket, setTicket] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const totpStep = ticket != null

  const submitPassword = useCallback(async () => {
    if (!username.trim() || !password) {
      setError('请填写用户名和密码')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await loginWithPassword(username.trim(), password)
      if (result.totp_required) {
        if (!result.ticket) {
          setError('无法开始两步验证，请重试')
          return
        }
        setTicket(result.ticket)
        setCode('')
        return
      }
      onSuccess()
    } catch (err) {
      setError(formatAuthError(err))
    } finally {
      setBusy(false)
    }
  }, [username, password, onSuccess])

  const submitTotp = useCallback(async () => {
    if (!ticket) return
    if (!/^\d{6}$/.test(code)) {
      setError('请输入身份验证器中的 6 位数字')
      return
    }
    setBusy(true)
    setError('')
    try {
      await loginWithTotp(ticket, code)
      onSuccess()
    } catch (err) {
      setError(formatAuthError(err))
    } finally {
      setBusy(false)
    }
  }, [ticket, code, onSuccess])

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (totpStep) void submitTotp()
    else void submitPassword()
  }

  return (
    <AuthWindowShell>
      <div className={shell.stage}>
        <div className={mergeClasses(shell.scrollViewport, 'opptrix-onboarding-scroll')}>
          <div className={mergeClasses(shell.scrollInner, shell.scrollInnerDisplay)}>
            <div className={mergeClasses(shell.content, shell.contentDisplay)}>
              <div className={s.loginHero}>
                <Text className={s.loginTitle} block>
                  {totpStep ? '两步验证' : 'Opptrix 投研工作台'}
                </Text>
                <Text className={s.loginLead} block>
                  {totpStep
                    ? '打开身份验证器，输入当前显示的 6 位数字。'
                    : '输入用户名和密码，继续你的投研工作。'}
                </Text>
              </div>
              <form className={s.form} onSubmit={handleSubmit}>
                <AuthFieldStack>
                  {!totpStep && (
                    <>
                      <AuthUsernameField
                        value={username}
                        onChange={setUsername}
                        disabled={busy}
                        emphasized
                        autoFocus
                      />
                      <AuthPasswordField
                        label="密码"
                        value={password}
                        onChange={setPassword}
                        disabled={busy}
                        autoComplete="current-password"
                        emphasized
                      />
                    </>
                  )}
                  {totpStep && (
                    <AuthCodeField
                      value={code}
                      onChange={setCode}
                      disabled={busy}
                      hint="来自身份验证器，约每 30 秒更新一次"
                      emphasized
                      autoFocus
                    />
                  )}
                </AuthFieldStack>
                {error ? (
                  <Text className={shell.error} block role="alert">{error}</Text>
                ) : null}
                <Text className={s.hint} block>
                  {totpStep
                    ? '验证码不正确时可返回上一步，重新输入密码。'
                    : '登录状态仅保存在你的这台设备上。'}
                </Text>
                <div className={s.actions}>
                  {totpStep && (
                  <OpptrixButton
                    variant="ghost"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setTicket(null)
                      setCode('')
                      setError('')
                    }}
                  >
                    返回
                  </OpptrixButton>
                  )}
                  <OpptrixButton
                    variant="primary"
                    type="submit"
                    disabled={busy}
                  >
                    {busy ? '正在验证…' : totpStep ? '继续' : '登录'}
                  </OpptrixButton>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </AuthWindowShell>
  )
}

export function AuthLoadingScreen({ label }: { label: string }) {
  const shell = useOnboardingShellStyles()
  return (
    <AuthWindowShell>
      <div className={shell.centerLoading}>
        <Spinner size="medium" label={label} />
      </div>
    </AuthWindowShell>
  )
}

export { AuthWindowShell }
