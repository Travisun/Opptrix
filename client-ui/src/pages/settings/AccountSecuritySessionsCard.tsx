import { useCallback, useEffect, useState } from 'react'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import { useOpptrixDialogAlert } from '../../components/opptrix/OpptrixDialogAlert'
import {
  listAuthSessions,
  logout,
  revokeAuthSession,
  type AuthDeviceSession,
} from '../../api/auth'
import { emitAuthRequired } from '../../auth/authEvents'
import { formatAuthError } from '../../auth/authErrors'
import { listRowKey } from '../../utils/listRowKey'
import {
  SettingsEmptyState,
  SettingsGroup,
  SettingsListPanel,
  SettingsListRow,
  SettingsRow,
  SettingsSectionLabel,
} from './SettingsPrimitives'
import { useSettingsToast } from './SettingsToast'

function formatWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '时间未知'
  return date.toLocaleString('zh-CN', { hour12: false })
}

function sessionTitle(session: AuthDeviceSession): string {
  if (session.label && session.label.trim()) return session.label.trim()
  return session.desktop ? '本机应用' : '浏览器'
}

function sessionMeta(session: AuthDeviceSession, isCurrent: boolean): string {
  const parts = [
    isCurrent ? '当前设备' : null,
    session.desktop ? '本机应用' : null,
    session.client_ip || '地址未知',
    `最近活动 ${formatWhen(session.last_seen_at)}`,
    `有效至 ${formatWhen(session.expires_at)}`,
  ]
  return parts.filter(Boolean).join(' · ')
}

export function SessionsCard({
  currentSessionId,
  compact = false,
}: {
  currentSessionId?: string
  /** When true, skip the section label (tab host provides context). */
  compact?: boolean
}) {
  const toast = useSettingsToast()
  const { confirm } = useOpptrixDialogAlert()
  const [sessions, setSessions] = useState<AuthDeviceSession[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const result = await listAuthSessions()
      setSessions(result.sessions)
    } catch (err) {
      toast.showToast(formatAuthError(err), 'error')
    }
  }, [toast])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleRevoke = useCallback(async (session: AuthDeviceSession, isCurrent: boolean) => {
    const ok = await confirm({
      title: isCurrent ? '退出此设备？' : '退出这台设备？',
      message: isCurrent
        ? '退出后需要重新登录才能继续使用。'
        : '该设备将立即退出，下次打开时需要重新登录。',
      confirmLabel: '退出此设备',
      confirmTone: 'danger',
    })
    if (!ok) return
    setBusyId(session.id)
    try {
      await revokeAuthSession(session.id)
      if (isCurrent) {
        emitAuthRequired()
        return
      }
      await refresh()
      toast.showToast('已退出该设备', 'success')
    } catch (err) {
      toast.showToast(formatAuthError(err), 'error')
    } finally {
      setBusyId(null)
    }
  }, [confirm, refresh, toast])

  const handleLogout = useCallback(async () => {
    const ok = await confirm({
      title: '退出此设备？',
      message: '退出后需要重新登录才能继续使用。',
      confirmLabel: '退出此设备',
      confirmTone: 'danger',
    })
    if (!ok) return
    try {
      await logout()
      emitAuthRequired()
    } catch (err) {
      toast.showToast(formatAuthError(err), 'error')
    }
  }, [confirm, toast])

  return (
    <>
      {compact ? null : <SettingsSectionLabel spaced>会话与设备</SettingsSectionLabel>}
      <SettingsListPanel>
        {sessions.length === 0 ? (
          <SettingsEmptyState
            title="还没有登录记录"
            desc="登录后，这里会列出正在使用的设备，方便你随时退出。"
          />
        ) : (
          sessions.map((session, index) => {
            const isCurrent = session.id === currentSessionId
            return (
              <SettingsListRow
                key={listRowKey(index, session.id)}
                title={sessionTitle(session)}
                meta={sessionMeta(session, isCurrent)}
                trailing={(
                  <OpptrixButton
                    variant="ghost"
                    size="small"
                    disabled={busyId === session.id}
                    onClick={() => { void handleRevoke(session, isCurrent) }}
                  >
                    退出此设备
                  </OpptrixButton>
                )}
              />
            )
          })
        )}
      </SettingsListPanel>
      <SettingsGroup>
        <SettingsRow
          title="退出当前登录"
          desc="仅退出这台设备，其他设备不受影响"
          last
          control={(
            <OpptrixButton variant="danger" onClick={() => { void handleLogout() }}>
              退出此设备
            </OpptrixButton>
          )}
        />
      </SettingsGroup>
    </>
  )
}
