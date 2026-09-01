import { useState } from 'react'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import { usePwaInstall } from '../../hooks/usePwaInstall'
import { isElectron } from '../../platform/detect'
import { SettingsGroup, SettingsRow, SettingsSectionLabel } from './SettingsPrimitives'
import { useSettingsToast } from './SettingsToast'

/**
 * Web 端：Chrome 一键安装到桌面；Safari / iOS 引导「添加到主屏幕」。
 * Electron 壳不展示。
 */
export default function PwaInstallSettingsSection() {
  const toast = useSettingsToast()
  const { canPrompt, isInstalled, promptInstall } = usePwaInstall()
  const [busy, setBusy] = useState(false)

  if (isElectron()) return null

  const handleInstall = async () => {
    setBusy(true)
    try {
      const ok = await promptInstall()
      if (ok) toast.showSuccess('已添加到桌面')
    } catch {
      toast.showError('暂时无法完成安装，请稍后重试，或使用浏览器菜单添加')
    } finally {
      setBusy(false)
    }
  }

  if (isInstalled) {
    return (
      <div>
        <SettingsSectionLabel spaced>本机应用</SettingsSectionLabel>
        <SettingsGroup>
          <SettingsRow
            title="桌面应用"
            desc="已从浏览器安装到本机，可从桌面或程序坞直接打开"
            last
          />
        </SettingsGroup>
      </div>
    )
  }

  if (canPrompt) {
    return (
      <div>
        <SettingsSectionLabel spaced>本机应用</SettingsSectionLabel>
        <SettingsGroup>
          <SettingsRow
            title="安装到桌面"
            desc="安装后可从桌面或程序坞打开，独立窗口使用"
            control={(
              <OpptrixButton
                variant="secondary"
                size="small"
                disabled={busy}
                onClick={() => { void handleInstall() }}
              >
                {busy ? '正在安装…' : '安装'}
              </OpptrixButton>
            )}
            last
          />
        </SettingsGroup>
      </div>
    )
  }

  return (
    <div>
      <SettingsSectionLabel spaced>本机应用</SettingsSectionLabel>
      <SettingsGroup>
        <SettingsRow
          title="添加到主屏幕"
          desc="在浏览器菜单中选择「添加到主屏幕」或「安装应用」，即可像本地应用一样打开"
          last
        />
      </SettingsGroup>
    </div>
  )
}
