import { useCallback, useEffect, useState } from 'react'
import { Text } from '@fluentui/react-components'
import { setupOwnerAccount } from '../api/auth'
import {
  AuthFieldStack,
  AuthPasswordField,
  AuthUsernameField,
} from '../auth/AuthFields'
import { formatAuthError, validateOwnerCredentials } from '../auth/authErrors'
import { ONBOARDING_COPY } from './manifest'
import { useOnboardingShellStyles } from './OnboardingShell'
import {
  AccountSecurityBenefits,
  AccountSecurityStepRail,
} from '../pages/settings/AccountSecurityStepChrome'

export type OnboardingAccountNavState = {
  canAdvance: boolean
  advancing: boolean
  advance: () => Promise<void>
}

export function OnboardingAccountPanel({
  onCreated,
  onNavChange,
}: {
  onCreated: () => void
  onNavChange: (nav: OnboardingAccountNavState | null) => void
}) {
  const shell = useOnboardingShellStyles()
  const copy = ONBOARDING_COPY.account
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [advancing, setAdvancing] = useState(false)
  const [error, setError] = useState('')

  const advance = useCallback(async () => {
    const invalid = validateOwnerCredentials(username, password, confirm)
    if (invalid) {
      setError(invalid)
      return
    }
    setAdvancing(true)
    setError('')
    try {
      await setupOwnerAccount(username.trim(), password)
      onCreated()
    } catch (err) {
      setError(formatAuthError(err))
    } finally {
      setAdvancing(false)
    }
  }, [username, password, confirm, onCreated])

  useEffect(() => {
    const ready = validateOwnerCredentials(username, password, confirm) == null
    onNavChange({
      canAdvance: ready && !advancing,
      advancing,
      advance,
    })
    return () => onNavChange(null)
  }, [username, password, confirm, advancing, advance, onNavChange])

  return (
    <>
      <AccountSecurityStepRail
        steps={['了解保护', '设置登录', '可选两步验证']}
        activeIndex={1}
      />
      <Text className={shell.sectionTitle} block>{copy.title}</Text>
      <Text className={shell.sectionLead} block>{copy.desc}</Text>
      <AccountSecurityBenefits
        items={[
          {
            title: '保护投研数据与密钥',
            desc: '登录后才能进入工作台，降低误入与未授权访问风险。',
          },
          {
            title: '稍后仍可加强',
            desc: '创建账户后，可在设置中开启两步验证。',
          },
        ]}
      />
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
      {error ? (
        <Text className={shell.error} block role="alert">{error}</Text>
      ) : null}
    </>
  )
}
