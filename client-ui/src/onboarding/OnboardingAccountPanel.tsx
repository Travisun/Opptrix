import { useCallback, useEffect, useState } from 'react'
import { Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import {
  beginTotpSetup,
  confirmTotpSetup,
  setupOwnerAccount,
} from '../api/auth'
import {
  AuthCodeField,
  AuthFieldStack,
  AuthPasswordField,
  AuthUsernameField,
} from '../auth/AuthFields'
import { TotpInstallGuide, type TotpInstallDevice } from '../auth/TotpInstallGuide'
import { TotpQrCanvas } from '../auth/TotpQrCanvas'
import {
  copyRecoveryCodes,
  downloadRecoveryCodesTxt,
} from '../auth/recoveryCodesExport'
import { useCopyButtonFeedback } from '../auth/useCopyButtonFeedback'
import { formatAuthError, validateOwnerCredentials } from '../auth/authErrors'
import { useAuthStatus } from '../auth/AuthGate'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import { inputShellInteractive } from '../theme/mixins'
import { opptrixCssVars, opptrixTokens } from '../theme/tokens'
import {
  AccountSecurityBenefits,
  AccountSecurityStepRail,
} from '../pages/settings/AccountSecurityStepChrome'
import { ONBOARDING_COPY } from './manifest'
import { useOnboardingShellStyles } from './OnboardingShell'

const ACCOUNT_RAIL = ['创建账户', '安装验证器', '扫码开启'] as const

type AccountSubStep = 'credentials' | 'install' | 'scan' | 'recovery'

export type OnboardingAccountNavState = {
  canAdvance: boolean
  advancing: boolean
  advanceLabel: string
  advance: () => Promise<void>
}

const useStyles = makeStyles({
  accountTitle: {
    marginTop: '15px',
    marginBottom: '10px',
  },
  accountLead: {
    marginTop: '0',
    marginBottom: '14px',
    fontSize: 'clamp(15px, 2vw, 17px)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.7,
  },
  accountBenefits: {
    marginBottom: '16px',
  },
  installBlock: {
    marginBottom: '4px',
  },
  setup: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: '20px',
    width: '100%',
    '@media (max-width: 640px)': {
      flexDirection: 'column',
    },
  },
  setupSide: {
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  setupMain: {
    flex: '1 1 0',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    width: '100%',
  },
  qrFrame: {
    padding: '12px',
    borderRadius: opptrixTokens.radiusMd,
    border: `1px solid ${opptrixCssVars.separator}`,
    backgroundColor: opptrixCssVars.canvasAlt,
  },
  secretCombo: {
    ...inputShellInteractive,
    width: '100%',
    minHeight: '34px',
    display: 'flex',
    alignItems: 'stretch',
    padding: 0,
    overflow: 'hidden',
    boxSizing: 'border-box',
  },
  secretText: {
    flex: '1 1 0',
    minWidth: 0,
    fontFamily: 'var(--opptrix-font-mono)',
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.45,
    padding: '8px 10px',
    wordBreak: 'break-all',
    alignSelf: 'center',
  },
  secretSegment: {
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
    borderLeft: `1px solid ${opptrixCssVars.separator}`,
  },
  fieldLabel: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 500,
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.35,
  },
  sectionGap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    width: '100%',
  },
  recoveryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '8px',
    padding: '4px 0 8px',
    '@media (max-width: 520px)': {
      gridTemplateColumns: '1fr',
    },
  },
  recoveryCode: {
    fontFamily: 'var(--opptrix-font-mono)',
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.5,
    padding: '8px 10px',
    borderRadius: opptrixTokens.radiusMd,
    border: `1px solid ${opptrixCssVars.separator}`,
    backgroundColor: opptrixCssVars.canvasAlt,
    textAlign: 'center',
    letterSpacing: '0.04em',
  },
  recoveryWarn: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.warning,
    lineHeight: 1.5,
    marginBottom: '8px',
  },
  recoveryActions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginTop: '4px',
  },
})

function railIndex(step: AccountSubStep): number {
  if (step === 'credentials') return 0
  if (step === 'install') return 1
  return 2
}

function resolveAdvanceLabel(step: AccountSubStep, advancing: boolean): string {
  if (advancing) {
    if (step === 'credentials') return '正在创建…'
    if (step === 'install') return '正在准备…'
    if (step === 'scan') return '正在验证…'
    return '正在继续…'
  }
  if (step === 'credentials') return '创建账户'
  if (step === 'install') return '继续'
  if (step === 'scan') return '完成验证'
  return '我已妥善保存'
}

export function OnboardingAccountPanel({
  onCreated,
  onNavChange,
}: {
  onCreated: () => void
  onNavChange: (nav: OnboardingAccountNavState | null) => void
}) {
  const shell = useOnboardingShellStyles()
  const styles = useStyles()
  const copy = ONBOARDING_COPY.account
  const { status: authStatus } = useAuthStatus()

  const [subStep, setSubStep] = useState<AccountSubStep>('credentials')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [installDevice, setInstallDevice] = useState<TotpInstallDevice>('wechat')
  const [installConfirmed, setInstallConfirmed] = useState(false)
  const [setupUrl, setSetupUrl] = useState('')
  const [secret, setSecret] = useState('')
  const [code, setCode] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [advancing, setAdvancing] = useState(false)
  const [error, setError] = useState('')
  const { label: copyRecoveryLabel, flash: flashCopyRecovery } = useCopyButtonFeedback()

  useEffect(() => {
    if (authStatus?.claimed && !authStatus.totp_enabled && subStep === 'credentials') {
      setSubStep('install')
    }
  }, [authStatus?.claimed, authStatus?.totp_enabled, subStep])

  const copySecret = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(secret)
    } catch {
      setError('无法复制，请手动选中密钥')
    }
  }, [secret])

  const copyRecovery = useCallback(async () => {
    const ok = await copyRecoveryCodes(recoveryCodes)
    flashCopyRecovery(ok)
    if (!ok) setError('无法复制，请手动选中恢复码或改用下载备份')
    else setError('')
  }, [recoveryCodes, flashCopyRecovery])

  const downloadRecovery = useCallback(() => {
    if (!downloadRecoveryCodesTxt(recoveryCodes)) {
      setError('无法下载备份文件，请改用一键复制')
    } else {
      setError('')
    }
  }, [recoveryCodes])

  const advance = useCallback(async () => {
    setError('')

    if (subStep === 'credentials') {
      const invalid = validateOwnerCredentials(username, password, confirm)
      if (invalid) {
        setError(invalid)
        return
      }
      setAdvancing(true)
      try {
        await setupOwnerAccount(username.trim(), password)
        setSubStep('install')
      } catch (err) {
        setError(formatAuthError(err))
      } finally {
        setAdvancing(false)
      }
      return
    }

    if (subStep === 'install') {
      if (!installConfirmed) {
        setError(installDevice === 'wechat' ? '请先确认已打开小程序' : '请先确认已安装并打开 App')
        return
      }
      setAdvancing(true)
      try {
        const result = await beginTotpSetup()
        setSetupUrl(result.otpauth_url)
        setSecret(result.secret)
        setCode('')
        setSubStep('scan')
      } catch (err) {
        setError(formatAuthError(err))
      } finally {
        setAdvancing(false)
      }
      return
    }

    if (subStep === 'scan') {
      if (!/^\d{6}$/.test(code)) {
        setError('请输入身份验证器中的 6 位数字')
        return
      }
      setAdvancing(true)
      try {
        const result = await confirmTotpSetup(code)
        setSetupUrl('')
        setSecret('')
        setCode('')
        setRecoveryCodes(result.recovery_codes)
        setSubStep('recovery')
      } catch (err) {
        setError(formatAuthError(err))
      } finally {
        setAdvancing(false)
      }
      return
    }

    onCreated()
  }, [subStep, username, password, confirm, code, installDevice, installConfirmed, onCreated])

  useEffect(() => {
    let canAdvance = false
    if (subStep === 'credentials') {
      canAdvance = validateOwnerCredentials(username, password, confirm) == null && !advancing
    } else if (subStep === 'install') {
      canAdvance = installConfirmed && !advancing
    } else if (subStep === 'scan') {
      canAdvance = /^\d{6}$/.test(code) && !advancing
    } else {
      canAdvance = recoveryCodes.length > 0 && !advancing
    }

    onNavChange({
      canAdvance,
      advancing,
      advanceLabel: resolveAdvanceLabel(subStep, advancing),
      advance,
    })
    return () => onNavChange(null)
  }, [
    subStep,
    username,
    password,
    confirm,
    code,
    installDevice,
    installConfirmed,
    recoveryCodes.length,
    advancing,
    advance,
    onNavChange,
  ])

  return (
    <>
      <AccountSecurityStepRail
        steps={[...ACCOUNT_RAIL]}
        activeIndex={railIndex(subStep)}
      />
      <Text className={mergeClasses(shell.sectionTitle, styles.accountTitle)} block>
        {copy.title}
      </Text>
      <Text className={styles.accountLead} block>
        {subStep === 'credentials' && copy.desc}
        {subStep === 'install' && copy.installDesc}
        {subStep === 'scan' && copy.scanDesc}
        {subStep === 'recovery' && copy.recoveryDesc}
      </Text>

      {subStep === 'credentials' ? (
        <>
          <div className={styles.accountBenefits}>
            <AccountSecurityBenefits
              items={[
                {
                  title: '保护投研数据与密钥',
                  desc: '登录后才能进入工作台，降低误入与未授权访问风险。',
                },
                {
                  title: '两步验证一并开启',
                  desc: '创建账户后需用身份验证器完成验证，即使密码泄露也更安心。',
                },
              ]}
            />
          </div>
          <AuthFieldStack>
            <AuthUsernameField
              value={username}
              onChange={setUsername}
              disabled={advancing}
              autoComplete="username"
              showRules
            />
            <AuthPasswordField
              label="密码"
              value={password}
              onChange={setPassword}
              disabled={advancing}
              autoComplete="new-password"
              mode="create"
            />
            <AuthPasswordField
              label="确认密码"
              value={confirm}
              onChange={setConfirm}
              disabled={advancing}
              autoComplete="new-password"
              mode="confirm"
              matchAgainst={password}
            />
          </AuthFieldStack>
        </>
      ) : null}

      {subStep === 'install' ? (
        <div className={styles.installBlock}>
          <TotpInstallGuide
            device={installDevice}
            onDeviceChange={next => {
              setInstallDevice(next)
              setInstallConfirmed(false)
              setError('')
            }}
            confirmed={installConfirmed}
            onConfirmedChange={next => {
              setInstallConfirmed(next)
              setError('')
            }}
            disabled={advancing}
          />
        </div>
      ) : null}

      {subStep === 'scan' && setupUrl ? (
        <div className={styles.setup}>
          <div className={styles.setupSide}>
            <Text className={styles.fieldLabel} block>扫描二维码</Text>
            <div className={styles.qrFrame}>
              <TotpQrCanvas otpauthUrl={setupUrl} />
            </div>
          </div>
          <div className={styles.setupMain}>
            <div className={styles.sectionGap}>
              <Text className={styles.fieldLabel} block>或手动输入密钥</Text>
              <div className={mergeClasses(styles.secretCombo, 'opptrix-input-shell')}>
                <Text className={styles.secretText} block>{secret}</Text>
                <div className={styles.secretSegment}>
                  <OpptrixButton
                    variant="ghost"
                    size="small"
                    disabled={advancing || !secret}
                    onClick={() => { void copySecret() }}
                  >
                    复制
                  </OpptrixButton>
                </div>
              </div>
            </div>
            <AuthCodeField
              label="验证码"
              value={code}
              onChange={setCode}
              disabled={advancing}
              hint="来自身份验证器，约每 30 秒更新"
            />
          </div>
        </div>
      ) : null}

      {subStep === 'recovery' ? (
        <>
          <Text className={styles.recoveryWarn} block role="status">
            离开本页后将无法再次查看。每条恢复码只能使用一次，请立即保存。
          </Text>
          <div className={styles.recoveryGrid}>
            {recoveryCodes.map(item => (
              <span key={item} className={styles.recoveryCode}>{item}</span>
            ))}
          </div>
          <div className={styles.recoveryActions}>
            <OpptrixButton variant="secondary" onClick={() => { void copyRecovery() }}>
              {copyRecoveryLabel}
            </OpptrixButton>
            <OpptrixButton variant="secondary" onClick={downloadRecovery}>
              下载备份文件
            </OpptrixButton>
          </div>
        </>
      ) : null}

      {error ? (
        <Text className={shell.error} block role="alert">{error}</Text>
      ) : null}
    </>
  )
}
