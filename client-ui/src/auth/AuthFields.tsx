import { useState, type ReactNode } from 'react'
import {
  Input,
  Text,
  makeStyles,
  mergeClasses,
} from '@fluentui/react-components'
import {
  analyzePassword,
  analyzeUsername,
  type CredentialCheck,
} from '@opptrix/shared/auth-credentials'
import { inputShellInteractive } from '../theme/mixins'
import { opptrixCssVars } from '../theme/tokens'

const useStyles = makeStyles({
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    width: '100%',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    width: '100%',
  },
  label: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 500,
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.35,
  },
  hint: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.45,
  },
  error: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.error,
    lineHeight: 1.45,
  },
  /** Same chrome as settings SettingsInlineInput (wide) — keep auth out of settings imports. */
  controlShell: {
    ...inputShellInteractive,
    width: '100%',
    minWidth: 0,
    minHeight: '30px',
    padding: '0 10px',
    display: 'flex',
    alignItems: 'center',
    boxSizing: 'border-box',
  },
  /** Login / gate surfaces — visible border; size matches settings inline inputs. */
  controlShellEmphasized: {
    border: `1px solid ${opptrixCssVars.separatorStrong}`,
    backgroundColor: opptrixCssVars.canvas,
    minHeight: '30px',
    padding: '0 10px',
    ':hover': {
      border: `1px solid ${opptrixCssVars.borderStrong}`,
      backgroundColor: opptrixCssVars.inputBgHover,
    },
    ':focus-within': {
      border: `1px solid ${opptrixCssVars.borderStrong}`,
      backgroundColor: opptrixCssVars.inputBgFocus,
      boxShadow: 'none',
    },
  },
  input: {
    width: '100%',
  },
  codeInput: {
    fontFamily: 'var(--opptrix-font-mono)',
    letterSpacing: '0.22em',
    fontSize: 'var(--opptrix-font-md)',
  },
  codeComplete: {
    color: opptrixCssVars.success,
  },
  checks: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
    padding: '2px 0 0',
  },
  checkRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: 1.4,
  },
  checkIdle: {
    color: opptrixCssVars.textTertiary,
  },
  checkOk: {
    color: opptrixCssVars.success,
  },
  checkFail: {
    color: opptrixCssVars.error,
  },
  mark: {
    width: '12px',
    flexShrink: 0,
    textAlign: 'center',
    fontWeight: 600,
    fontSize: '11px',
  },
  matchHint: {
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: 1.4,
  },
  matchOk: {
    color: opptrixCssVars.success,
  },
  matchFail: {
    color: opptrixCssVars.error,
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    paddingTop: '4px',
    // Back/secondary stay left; primary (last) pins right.
    '> :last-child': {
      marginLeft: 'auto',
    },
  },
})

export function AuthFieldStack({ children }: { children: ReactNode }) {
  const s = useStyles()
  return <div className={s.stack}>{children}</div>
}

export function AuthFieldActions({ children }: { children: ReactNode }) {
  const s = useStyles()
  return <div className={s.actions}>{children}</div>
}

function CredentialChecks({
  checks,
  active,
}: {
  checks: CredentialCheck[]
  active: boolean
}) {
  const s = useStyles()
  return (
    <div className={s.checks} aria-live="polite">
      {checks.map((c) => {
        const tone = !active
          ? s.checkIdle
          : c.ok
            ? s.checkOk
            : s.checkFail
        return (
          <div key={c.key} className={mergeClasses(s.checkRow, tone)}>
            <span className={s.mark} aria-hidden>
              {!active ? '·' : c.ok ? '✓' : '○'}
            </span>
            <span>{c.label}</span>
          </div>
        )
      })}
    </div>
  )
}

function AuthControlShell({
  children,
  emphasized = false,
}: {
  children: ReactNode
  emphasized?: boolean
}) {
  const s = useStyles()
  return (
    <div
      className={mergeClasses(
        s.controlShell,
        emphasized && s.controlShellEmphasized,
        'opptrix-input-shell',
        'opptrix-settings-inline-input',
        emphasized && 'opptrix-auth-login-shell',
      )}
    >
      {children}
    </div>
  )
}

export function AuthUsernameField({
  value,
  onChange,
  disabled,
  autoComplete = 'username',
  showRules = false,
  emphasized = false,
  autoFocus = false,
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  autoComplete?: string
  showRules?: boolean
  /** Stronger border/bg for login gate and similar surfaces. */
  emphasized?: boolean
  autoFocus?: boolean
}) {
  const s = useStyles()
  const [touched, setTouched] = useState(false)
  const analyzed = analyzeUsername(value)
  const active = value.trim().length > 0
  const showError = showRules && touched && !analyzed.ok && active

  return (
    <div className={s.field}>
      <Text className={s.label} block>用户名</Text>
      <AuthControlShell emphasized={emphasized}>
        <Input
          className={mergeClasses(s.input, 'opptrix-settings-field-input')}
          appearance="filled-darker"
          size="small"
          value={value}
          disabled={disabled}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          spellCheck={false}
          onBlur={() => setTouched(true)}
          onChange={(_, d) => onChange(d.value ?? '')}
        />
      </AuthControlShell>
      {showError ? (
        <Text className={s.error} block role="alert">{analyzed.error}</Text>
      ) : showRules && !active ? (
        <Text className={s.hint} block>至少 5 位；英文+数字，可用邮箱与常用符号</Text>
      ) : null}
      {showRules ? <CredentialChecks checks={analyzed.checks} active={active} /> : null}
    </div>
  )
}

export function AuthPasswordField({
  label,
  value,
  onChange,
  disabled,
  autoComplete,
  mode = 'login',
  matchAgainst,
  emphasized = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  autoComplete: string
  mode?: 'login' | 'create' | 'confirm'
  matchAgainst?: string
  emphasized?: boolean
}) {
  const s = useStyles()
  const [touched, setTouched] = useState(false)
  const analyzed = analyzePassword(value)
  const active = value.length > 0
  const showCreateRules = mode === 'create'
  const showConfirm = mode === 'confirm'
  const matched =
    showConfirm && matchAgainst !== undefined && value === matchAgainst && active
  const mismatch =
    showConfirm && matchAgainst !== undefined && active && value !== matchAgainst
  const showCreateError = showCreateRules && touched && !analyzed.ok && active

  let footer: ReactNode = null
  if (showCreateError) {
    footer = <Text className={s.error} block role="alert">{analyzed.error}</Text>
  } else if (showConfirm && touched && mismatch) {
    footer = (
      <Text className={s.error} block role="alert">两次输入的密码不一致</Text>
    )
  } else if (showCreateRules && !active) {
    footer = (
      <Text className={s.hint} block>需含大小写字母、数字与特殊符号</Text>
    )
  } else if (showConfirm && active && matched) {
    footer = (
      <Text className={mergeClasses(s.matchHint, s.matchOk)} block aria-live="polite">
        两次密码一致
      </Text>
    )
  } else if (showConfirm && active && mismatch) {
    footer = (
      <Text className={mergeClasses(s.matchHint, s.matchFail)} block aria-live="polite">
        两次密码不一致
      </Text>
    )
  }

  return (
    <div className={s.field}>
      <Text className={s.label} block>{label}</Text>
      <AuthControlShell emphasized={emphasized}>
        <Input
          className={mergeClasses(s.input, 'opptrix-settings-field-input')}
          appearance="filled-darker"
          size="small"
          type="password"
          value={value}
          disabled={disabled}
          autoComplete={autoComplete}
          onBlur={() => setTouched(true)}
          onChange={(_, d) => onChange(d.value ?? '')}
        />
      </AuthControlShell>
      {footer}
      {showCreateRules ? <CredentialChecks checks={analyzed.checks} active={active} /> : null}
    </div>
  )
}

export function AuthCodeField({
  label = '验证码',
  value,
  onChange,
  disabled,
  hint,
  emphasized = false,
  autoFocus = false,
}: {
  label?: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  hint?: string
  emphasized?: boolean
  autoFocus?: boolean
}) {
  const s = useStyles()
  const filled = value.length
  const complete = filled === 6

  return (
    <div className={s.field}>
      <Text className={s.label} block>{label}</Text>
      <AuthControlShell emphasized={emphasized}>
        <Input
          className={mergeClasses(s.input, s.codeInput, 'opptrix-settings-field-input')}
          appearance="filled-darker"
          size="small"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={value}
          disabled={disabled}
          autoFocus={autoFocus}
          placeholder="••••••"
          spellCheck={false}
          onChange={(_, d) => onChange((d.value ?? '').replace(/\D/g, '').slice(0, 6))}
        />
      </AuthControlShell>
      <Text
        className={mergeClasses(s.hint, complete && s.codeComplete)}
        block
        aria-live="polite"
      >
        {hint
          ? `${hint} · ${filled}/6`
          : complete
            ? '验证码已填满'
            : `已输入 ${filled}/6 位`}
      </Text>
    </div>
  )
}
