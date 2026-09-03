import { useState } from 'react'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import { usePwaInstall } from '../../hooks/usePwaInstall'
import { isElectron } from '../../platform/detect'
import { resolvePwaInstallGuide } from '../../pwa/pwaInstallGuides'
import { SettingsGroup, SettingsRow, SettingsSectionLabel } from './SettingsPrimitives'
import { useSettingsToast } from './SettingsToast'

/**
 * Web 端：Chrome / Edge 一键安装；其余浏览器按分端步骤引导。
 * Electron 壳不展示。
 */
export default function PwaInstallSettingsSection() {
  const toast = useSettingsToast()
  const {
    canPrompt,
    isInstalled,
    promptInstall,
    mode,
    isIos,
    isSafari,
    isAndroid,
    isFirefox,
    isEdge,
    isChromium,
    isWindows,
  } = usePwaInstall()
  const [busy, setBusy] = useState(false)

  if (isElectron()) return null

  const guide = resolvePwaInstallGuide({
    isIos,
    isSafari,
    isAndroid,
    isFirefox,
    isEdge,
    isChromium,
    isWindows,
  })

  const handleInstall = async () => {
    setBusy(true)
    try {
      const result = await promptInstall()
      if (result === 'accepted') toast.showSuccess('已添加到桌面')
      else if (result === 'dismissed') toast.showError('未完成安装，可稍后在浏览器菜单中重试')
      else toast.showError('暂时无法完成安装，请按浏览器内的安装步骤操作')
    } catch {
      toast.showError('暂时无法完成安装，请稍后重试，或按浏览器内的安装步骤操作')
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
            desc="本机已安装，请从桌面或程序坞打开，获得独立窗口体验"
            last
          />
        </SettingsGroup>
      </div>
    )
  }

  if (canPrompt || mode === 'native') {
    return (
      <div>
        <SettingsSectionLabel spaced>本机应用</SettingsSectionLabel>
        <SettingsGroup>
          <SettingsRow
            title="安装到桌面"
            desc={isEdge
              ? '使用 Edge 安装后，可从桌面或任务栏以独立窗口打开'
              : '安装后可从桌面或程序坞打开，独立窗口使用'}
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
          title={guide.title}
          desc={guide.meta}
          last
        />
      </SettingsGroup>
    </div>
  )
}
