import { useCallback, useState } from 'react'
import { Text, makeStyles } from '@fluentui/react-components'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import { setupOwnerAccount } from '../../api/auth'
import { useAuthStatus } from '../../auth/AuthGate'
import {
  AuthFieldActions,
  AuthFieldStack,
  AuthPasswordField,
  AuthUsernameField,
} from '../../auth/AuthFields'
import { formatAuthError, validateOwnerCredentials } from '../../auth/authErrors'
import { opptrixCssVars } from '../../theme/tokens'
import { SettingsGroup, SettingsStaticBlock } from './SettingsPrimitives'
import { useSettingsToast } from './SettingsToast'
import {
  AccountSecurityBenefits,
  AccountSecurityFlowRoot,
  AccountSecurityHero,
  AccountSecurityStepRail,
} from './AccountSecurityStepChrome'

const CREATE_STEPS = ['了解保护', '设置登录', '完成'] as const

const useStyles = makeStyles({
  tip: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.5,
    padding: '0 2px',
  },
  introActions: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '8px',
    width: '100%',
  },
})

export function CreateAccountCard({
  onCreated,
}: {
  /** After account exists — parent can nudge 2FA */
  onCreated?: () => void
}) {
  const s = useStyles()
  const toast = useSettingsToast()
  const { reload } = useAuthStatus()
  const [phase, setPhase] = useState<'intro' | 'form'>('intro')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  const handleCreate = useCallback(async () => {
    const invalid = validateOwnerCredentials(username, password, confirm)
    if (invalid) {
      toast.showToast(invalid, 'error')
      return
    }
    setBusy(true)
    try {
      await setupOwnerAccount(username.trim(), password)
      await reload()
      toast.showToast('账户已创建，这台设备已登录', 'success')
      onCreated?.()
    } catch (err) {
      toast.showToast(formatAuthError(err), 'error')
    } finally {
      setBusy(false)
    }
  }, [username, password, confirm, reload, toast, onCreated])

  if (phase === 'intro') {
    return (
      <AccountSecurityFlowRoot>
        <AccountSecurityStepRail steps={[...CREATE_STEPS]} activeIndex={0} />
        <AccountSecurityHero lead="创建本地账户后，打开 Opptrix 需要登录。适合自托管或希望防止他人误入的场景。" />
        <AccountSecurityBenefits
          items={[
            {
              title: '防止未授权访问',
              desc: '只有知道密码的人能进入你的投研工作台。',
            },
            {
              title: '可再加强一层',
              desc: '创建后可开启两步验证，即使密码泄露也更安心。',
            },
            {
              title: '本机仍可先不建',
              desc: '若暂时只在本机使用，可以稍后再创建。',
            },
          ]}
        />
        <div className={s.introActions}>
          <OpptrixButton variant="primary" onClick={() => setPhase('form')}>
            开始创建
          </OpptrixButton>
        </div>
      </AccountSecurityFlowRoot>
    )
  }

  return (
    <AccountSecurityFlowRoot>
      <AccountSecurityStepRail steps={[...CREATE_STEPS]} activeIndex={1} />
      <AccountSecurityHero lead="用户名至少 5 位（英文+数字或邮箱）；密码需含大小写字母、数字与特殊符号。创建后这台设备会自动登录。" />
      <SettingsGroup>
        <SettingsStaticBlock>
          <AuthFieldStack>
            <AuthUsernameField
              value={username}
              onChange={setUsername}
              disabled={busy}
              showRules
            />
            <AuthPasswordField
              label="密码"
              value={password}
              onChange={setPassword}
              disabled={busy}
              autoComplete="new-password"
              mode="create"
            />
            <AuthPasswordField
              label="确认密码"
              value={confirm}
              onChange={setConfirm}
              disabled={busy}
              autoComplete="new-password"
              mode="confirm"
              matchAgainst={password}
            />
            <AuthFieldActions>
              <OpptrixButton
                variant="ghost"
                disabled={busy}
                onClick={() => setPhase('intro')}
              >
                返回
              </OpptrixButton>
              <OpptrixButton
                variant="primary"
                disabled={busy}
                onClick={() => { void handleCreate() }}
              >
                {busy ? '正在创建…' : '创建并登录'}
              </OpptrixButton>
            </AuthFieldActions>
          </AuthFieldStack>
        </SettingsStaticBlock>
      </SettingsGroup>
      <Text className={s.tip} block>
        创建成功后，将引导你开启两步验证（可用手机身份验证器）。
      </Text>
    </AccountSecurityFlowRoot>
  )
}
