import { useEffect, useState } from 'react'
import { Spinner, makeStyles, mergeClasses } from '@fluentui/react-components'
import { useAuthStatus } from '../../auth/AuthGate'
import { ghostInteractive, motion } from '../../theme/mixins'
import { opptrixCssVars, opptrixTokens } from '../../theme/tokens'
import { CreateAccountCard } from './AccountSecurityCreateCard'
import { ChangePasswordCard } from './AccountSecurityPasswordCard'
import { RecoveryCodesBlock } from './AccountSecurityRecoveryCodes'
import { SessionsCard } from './AccountSecuritySessionsCard'
import { TotpSettingsCard } from './AccountSecurityTotpCard'
import { SettingsGroup, SettingsRow } from './SettingsPrimitives'
import { useSettingsToast } from './SettingsToast'
import { AccountSecurityStatusPills } from './AccountSecurityStepChrome'

type AccountSecurityTab = 'overview' | 'password' | 'totp' | 'sessions'

const TABS: Array<{ id: AccountSecurityTab; label: string }> = [
  { id: 'overview', label: '概览' },
  { id: 'password', label: '密码' },
  { id: 'totp', label: '两步验证' },
  { id: 'sessions', label: '登录设备' },
]

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  headerMeta: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '10px',
  },
  tabRow: {
    display: 'flex',
    gap: '4px',
    padding: '3px',
    backgroundColor: opptrixCssVars.canvasAlt,
    borderRadius: opptrixTokens.radiusFull,
    width: 'fit-content',
    maxWidth: '100%',
    flexWrap: 'wrap',
  },
  tab: {
    ...ghostInteractive,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '5px 14px',
    borderRadius: opptrixTokens.radiusFull,
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 500,
    border: 'none',
    cursor: 'pointer',
    color: opptrixCssVars.textTertiary,
    transitionProperty: 'background-color, color',
    transitionDuration: motion.fast,
    whiteSpace: 'nowrap',
  },
  tabActive: {
    backgroundColor: opptrixCssVars.surface,
    color: opptrixCssVars.textPrimary,
    boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
  },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    minWidth: 0,
  },
})

export default function AccountSecuritySettingsSection() {
  const s = useStyles()
  const toast = useSettingsToast()
  const { status } = useAuthStatus()
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)
  const [nudgeTotp, setNudgeTotp] = useState(false)
  const [tab, setTab] = useState<AccountSecurityTab>('overview')

  useEffect(() => {
    if (nudgeTotp) setTab('totp')
  }, [nudgeTotp])

  useEffect(() => {
    if (tab !== 'totp') setNudgeTotp(false)
  }, [tab])

  useEffect(() => {
    if (recoveryCodes && recoveryCodes.length > 0) setTab('totp')
  }, [recoveryCodes])

  if (!status) {
    return <Spinner size="small" label="正在加载账户信息…" />
  }

  if (!status.claimed) {
    return (
      <div className={s.root}>
        <CreateAccountCard onCreated={() => setNudgeTotp(true)} />
      </div>
    )
  }

  const totpOn = Boolean(status.totp_enabled)
  const showingRecovery = Boolean(recoveryCodes && recoveryCodes.length > 0)

  return (
    <div className={s.root}>
      <div className={s.headerMeta}>
        <AccountSecurityStatusPills
          items={[
            {
              label: totpOn ? '两步验证已开启' : '两步验证未开启',
              tone: totpOn ? 'ok' : 'warn',
            },
          ]}
        />
      </div>

      <div className={s.tabRow} role="tablist" aria-label="账户与安全分类">
        {TABS.map(item => {
          const active = tab === item.id
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={mergeClasses(s.tab, active && s.tabActive, 'opptrix-focusable')}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          )
        })}
      </div>

      <div className={s.panel} role="tabpanel">
        {showingRecovery ? (
          <RecoveryCodesBlock
            codes={recoveryCodes ?? []}
            onCopied={() => toast.showToast('恢复码已复制，请妥善保存', 'success')}
            onDownloaded={() => toast.showToast('备份文件已开始下载', 'success')}
            onDone={() => {
              setRecoveryCodes(null)
              setNudgeTotp(false)
              setTab('totp')
            }}
          />
        ) : null}

        {!showingRecovery && tab === 'overview' ? (
          <SettingsGroup>
            <SettingsRow
              title="用户名"
              desc={status.username ?? '—'}
              last
            />
          </SettingsGroup>
        ) : null}

        {!showingRecovery && tab === 'password' ? (
          <ChangePasswordCard />
        ) : null}

        {!showingRecovery && tab === 'totp' ? (
          <TotpSettingsCard
            key={nudgeTotp ? 'totp-nudge' : 'totp-idle'}
            enabled={totpOn}
            autoStart={nudgeTotp && !totpOn}
            onRecoveryCodes={setRecoveryCodes}
            onDismissNudge={() => setNudgeTotp(false)}
          />
        ) : null}

        {!showingRecovery && tab === 'sessions' ? (
          <SessionsCard currentSessionId={status.session?.id} compact />
        ) : null}
      </div>
    </div>
  )
}
