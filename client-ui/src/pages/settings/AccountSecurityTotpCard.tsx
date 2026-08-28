import { useCallback, useState } from 'react'
import { Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import {
  beginTotpSetup,
  confirmTotpSetup,
  disableTotp,
} from '../../api/auth'
import { useAuthStatus } from '../../auth/AuthGate'
import {
  AuthCodeField,
  AuthFieldActions,
  AuthFieldStack,
  AuthPasswordField,
} from '../../auth/AuthFields'
import { TotpQrCanvas } from '../../auth/TotpQrCanvas'
import { formatAuthError } from '../../auth/authErrors'
import { inputShellInteractive } from '../../theme/mixins'
import { opptrixCssVars, opptrixTokens } from '../../theme/tokens'
import { SettingsGroup, SettingsRow, SettingsStaticBlock } from './SettingsPrimitives'
import { useSettingsToast } from './SettingsToast'
import {
  AccountSecurityActions,
  AccountSecurityBenefits,
  AccountSecurityFlowRoot,
  AccountSecurityHero,
  AccountSecurityRecommendBanner,
  AccountSecurityStepRail,
} from './AccountSecurityStepChrome'

const TOTP_STEPS = ['了解', '添加验证器', '确认开启'] as const

const useStyles = makeStyles({
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
  disableLead: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.5,
    padding: '0 2px',
  },
})

type TotpPhase = 'idle' | 'intro' | 'scan' | 'disable'

export function TotpSettingsCard({
  enabled,
  autoStart,
  onRecoveryCodes,
  onDismissNudge,
}: {
  enabled: boolean
  autoStart?: boolean
  onRecoveryCodes: (codes: string[]) => void
  onDismissNudge?: () => void
}) {
  const s = useStyles()
  const toast = useSettingsToast()
  const { reload } = useAuthStatus()
  const [phase, setPhase] = useState<TotpPhase>(autoStart && !enabled ? 'intro' : 'idle')
  const [setupUrl, setSetupUrl] = useState('')
  const [secret, setSecret] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [disableCode, setDisableCode] = useState('')
  const [busy, setBusy] = useState(false)

  const resetSetup = useCallback(() => {
    setSetupUrl('')
    setSecret('')
    setCode('')
    setPhase('idle')
    onDismissNudge?.()
  }, [onDismissNudge])

  const begin = useCallback(async () => {
    setBusy(true)
    try {
      const result = await beginTotpSetup()
      setSetupUrl(result.otpauth_url)
      setSecret(result.secret)
      setCode('')
      setPhase('scan')
    } catch (err) {
      toast.showToast(formatAuthError(err), 'error')
    } finally {
      setBusy(false)
    }
  }, [toast])

  const confirm = useCallback(async () => {
    if (!/^\d{6}$/.test(code)) {
      toast.showToast('请输入身份验证器中的 6 位数字', 'error')
      return
    }
    setBusy(true)
    try {
      const result = await confirmTotpSetup(code)
      setSetupUrl('')
      setSecret('')
      setCode('')
      setPhase('idle')
      onRecoveryCodes(result.recovery_codes)
      await reload()
      toast.showToast('两步验证已开启', 'success')
      onDismissNudge?.()
    } catch (err) {
      toast.showToast(formatAuthError(err), 'error')
    } finally {
      setBusy(false)
    }
  }, [code, onRecoveryCodes, reload, toast, onDismissNudge])

  const disable = useCallback(async () => {
    if (!password || !disableCode) {
      toast.showToast('请填写密码和验证码', 'error')
      return
    }
    setBusy(true)
    try {
      await disableTotp(password, disableCode)
      setPassword('')
      setDisableCode('')
      setPhase('idle')
      await reload()
      toast.showToast('两步验证已关闭', 'success')
    } catch (err) {
      toast.showToast(formatAuthError(err), 'error')
    } finally {
      setBusy(false)
    }
  }, [password, disableCode, reload, toast])

  const copySecret = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(secret)
      toast.showToast('密钥已复制', 'success')
    } catch {
      toast.showToast('无法复制，请手动选中密钥', 'error')
    }
  }, [secret, toast])

  if (phase === 'intro' && !enabled) {
    return (
      <AccountSecurityFlowRoot>
        <AccountSecurityStepRail steps={[...TOTP_STEPS]} activeIndex={0} />
        <AccountSecurityHero lead="登录时除密码外，还需手机身份验证器中的动态验证码。" />
        <AccountSecurityBenefits
          items={[
            {
              title: '兼容主流验证器',
              desc: 'Google Authenticator、微软 Authenticator、1Password 等均可。',
            },
            {
              title: '提供恢复码',
              desc: '开启时会给出一次性恢复码，手机不可用时也能找回访问。',
            },
            {
              title: '敏感操作再确认',
              desc: '修改密钥、关闭验证等重要操作会再次要求验证码。',
            },
          ]}
        />
        <AccountSecurityActions>
          <OpptrixButton variant="ghost" disabled={busy} onClick={resetSetup}>
            稍后再说
          </OpptrixButton>
          <OpptrixButton
            variant="primary"
            disabled={busy}
            onClick={() => { void begin() }}
          >
            {busy ? '正在准备…' : '下一步'}
          </OpptrixButton>
        </AccountSecurityActions>
      </AccountSecurityFlowRoot>
    )
  }

  if (phase === 'scan' && setupUrl) {
    const codeReady = /^\d{6}$/.test(code)
    return (
      <AccountSecurityFlowRoot>
        <AccountSecurityStepRail
          steps={[...TOTP_STEPS]}
          activeIndex={codeReady ? 2 : 1}
        />
        <AccountSecurityHero
          lead={
            codeReady
              ? '核对验证码后确认开启。成功后会显示恢复码，请务必保存。'
              : '用身份验证器扫描二维码；无法扫码时复制密钥手动添加。'
          }
        />
        <SettingsGroup>
          <SettingsStaticBlock>
            <div className={s.setup}>
              <div className={s.setupSide}>
                <Text className={s.fieldLabel} block>扫描二维码</Text>
                <div className={s.qrFrame}>
                  <TotpQrCanvas otpauthUrl={setupUrl} />
                </div>
              </div>

              <div className={s.setupMain}>
                <div className={s.sectionGap}>
                  <Text className={s.fieldLabel} block>或手动输入密钥</Text>
                  <div className={mergeClasses(s.secretCombo, 'opptrix-input-shell')}>
                    <Text className={s.secretText} block>{secret}</Text>
                    <div className={s.secretSegment}>
                      <OpptrixButton
                        variant="ghost"
                        size="small"
                        disabled={busy || !secret}
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
                  disabled={busy}
                  hint="来自身份验证器，约每 30 秒更新"
                />

                <AuthFieldActions>
                  <OpptrixButton variant="ghost" disabled={busy} onClick={resetSetup}>
                    取消
                  </OpptrixButton>
                  <OpptrixButton
                    variant="primary"
                    disabled={busy || !codeReady}
                    onClick={() => { void confirm() }}
                  >
                    {busy ? '正在开启…' : '确认开启'}
                  </OpptrixButton>
                </AuthFieldActions>
              </div>
            </div>
          </SettingsStaticBlock>
        </SettingsGroup>
      </AccountSecurityFlowRoot>
    )
  }

  if (enabled && phase === 'disable') {
    return (
      <SettingsGroup>
        <SettingsStaticBlock>
          <AuthFieldStack>
            <Text className={s.disableLead} block>
              关闭后登录将只需要密码。请确认是你本人操作。
            </Text>
            <AuthPasswordField
              label="当前密码"
              value={password}
              onChange={setPassword}
              disabled={busy}
              autoComplete="current-password"
            />
            <AuthCodeField
              value={disableCode}
              onChange={setDisableCode}
              disabled={busy}
              hint="来自身份验证器"
            />
            <AuthFieldActions>
              <OpptrixButton variant="ghost" disabled={busy} onClick={() => setPhase('idle')}>
                取消
              </OpptrixButton>
              <OpptrixButton
                variant="danger"
                disabled={busy || !password || !/^\d{6}$/.test(disableCode)}
                onClick={() => { void disable() }}
              >
                {busy ? '正在关闭…' : '确认关闭'}
              </OpptrixButton>
            </AuthFieldActions>
          </AuthFieldStack>
        </SettingsStaticBlock>
      </SettingsGroup>
    )
  }

  if (enabled) {
    return (
      <SettingsGroup>
        <SettingsRow
          title="状态"
          desc="已开启。登录与敏感操作需要身份验证器中的验证码。"
          last
          control={(
            <OpptrixButton variant="ghost" onClick={() => setPhase('disable')}>
              关闭…
            </OpptrixButton>
          )}
        />
      </SettingsGroup>
    )
  }

  return (
    <AccountSecurityRecommendBanner
      desc="用身份验证器在登录时再确认一次，显著提升账户安全。"
    >
      <AccountSecurityActions>
        <OpptrixButton
          variant="primary"
          disabled={busy}
          onClick={() => setPhase('intro')}
        >
          开始设置
        </OpptrixButton>
      </AccountSecurityActions>
    </AccountSecurityRecommendBanner>
  )
}
