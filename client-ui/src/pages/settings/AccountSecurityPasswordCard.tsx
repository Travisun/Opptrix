import { useCallback, useState } from 'react'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import { changeOwnerPassword } from '../../api/auth'
import {
  AuthFieldActions,
  AuthFieldStack,
  AuthPasswordField,
} from '../../auth/AuthFields'
import { formatAuthError, validatePassword } from '../../auth/authErrors'
import { SettingsGroup, SettingsStaticBlock } from './SettingsPrimitives'
import { useSettingsToast } from './SettingsToast'

export function ChangePasswordCard(_props?: {
  totpEnabled?: boolean
  compact?: boolean
}) {
  const toast = useSettingsToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  const handleSave = useCallback(async () => {
    if (!current) {
      toast.showToast('请填写当前密码', 'error')
      return
    }
    const invalid = validatePassword(next, confirm)
    if (invalid) {
      toast.showToast(invalid, 'error')
      return
    }
    setBusy(true)
    try {
      await changeOwnerPassword(current, next)
      setCurrent('')
      setNext('')
      setConfirm('')
      toast.showToast('密码已更新', 'success')
    } catch (err) {
      toast.showToast(formatAuthError(err), 'error')
    } finally {
      setBusy(false)
    }
  }, [current, next, confirm, toast])

  return (
    <SettingsGroup>
      <SettingsStaticBlock>
        <AuthFieldStack>
          <AuthPasswordField
            label="当前密码"
            value={current}
            onChange={setCurrent}
            disabled={busy}
            autoComplete="current-password"
          />
          <AuthPasswordField
            label="新密码"
            value={next}
            onChange={setNext}
            disabled={busy}
            autoComplete="new-password"
            mode="create"
          />
          <AuthPasswordField
            label="确认新密码"
            value={confirm}
            onChange={setConfirm}
            disabled={busy}
            autoComplete="new-password"
            mode="confirm"
            matchAgainst={next}
          />
          <AuthFieldActions>
            <OpptrixButton
              variant="primary"
              disabled={busy}
              onClick={() => { void handleSave() }}
            >
              {busy ? '正在保存…' : '更新密码'}
            </OpptrixButton>
          </AuthFieldActions>
        </AuthFieldStack>
      </SettingsStaticBlock>
    </SettingsGroup>
  )
}
