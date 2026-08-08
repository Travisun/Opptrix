import { useCallback, useEffect, useState } from 'react'
import { makeStyles, Spinner, Text } from '@fluentui/react-components'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import { useOpptrixDialogAlert } from '../../components/opptrix/OpptrixDialogAlert'
import { opptrixCssVars } from '../../theme/tokens'
import {
  parseEnginesSettings,
  semanticModelSettings,
  type ParseEnginesStatus,
  type SemanticModelStatus,
} from '../../api/client'
import { SettingsGroup, SettingsRow, SettingsSectionLabel } from './SettingsPrimitives'
import { useSettingsToast } from './SettingsToast'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '20px',
  },
  hint: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.55,
    padding: '0 2px 4px',
  },
  statusReady: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textSecondary,
    whiteSpace: 'nowrap',
  },
})

type BusyKey = 'semantic-install' | 'semantic-uninstall' | 'deep-prepare' | 'deep-uninstall' | null

function semanticReadyDesc(source: SemanticModelStatus['source']): string {
  if (source === 'bundled') return '已就绪（应用已自带）'
  if (source === 'user') return '已就绪（本机已安装）'
  return '已就绪'
}

function deepReadyDesc(deep: ParseEnginesStatus['deep']): string {
  if (deep.source === 'bundled') return '已就绪（应用已自带）'
  if (deep.source === 'user') return '已就绪（本机已准备）'
  if (deep.available || deep.installed) return '已就绪'
  return '尚未就绪，扫描件需先完成准备'
}

export default function DocLibrarySettingsSection() {
  const s = useStyles()
  const toast = useSettingsToast()
  const { confirm } = useOpptrixDialogAlert()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<BusyKey>(null)
  const [semantic, setSemantic] = useState<SemanticModelStatus | null>(null)
  const [parseEngines, setParseEngines] = useState<ParseEnginesStatus | null>(null)

  const refresh = useCallback(async () => {
    const [sem, engines] = await Promise.all([
      semanticModelSettings.getStatus(),
      parseEnginesSettings.getStatus(),
    ])
    setSemantic(sem)
    setParseEngines(engines)
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    refresh()
      .catch(() => {
        if (active) toast.showError('暂时无法读取研报库状态，请稍后重试')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [refresh, toast])

  const handleInstallSemantic = async () => {
    setBusy('semantic-install')
    try {
      const res = await semanticModelSettings.install()
      if (!res.ok && res.error) {
        toast.showError(res.error)
      } else {
        toast.showSuccess('语义检索已就绪')
      }
      await refresh()
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '安装失败，请稍后重试')
    } finally {
      setBusy(null)
    }
  }

  const handleUninstallSemantic = async () => {
    const ok = await confirm({
      title: '移除本机语义检索？',
      message: '移除后将不再使用本机副本；若应用仍自带该能力，语义检索会继续可用。',
      confirmLabel: '移除',
      confirmTone: 'danger',
    })
    if (!ok) return
    setBusy('semantic-uninstall')
    try {
      const res = await semanticModelSettings.uninstall()
      if (!res.ok && res.error) {
        toast.showError(res.error)
      } else {
        toast.showSuccess(res.installed ? '已移除本机副本，仍可使用应用自带能力' : '已移除本机语义检索')
      }
      await refresh()
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '移除失败，请稍后重试')
    } finally {
      setBusy(null)
    }
  }

  const handlePrepareDeep = async () => {
    setBusy('deep-prepare')
    try {
      const res = await parseEnginesSettings.prepareDeep()
      if (res.error) {
        toast.showError(res.error)
      } else if (res.ok === false || !(res.deep?.available || res.deep?.installed)) {
        toast.showError(res.message || '扫描件文字识别尚未就绪，请稍后重试')
      } else {
        toast.showSuccess(res.message || '扫描件文字识别已就绪')
      }
      await refresh()
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '准备失败，请稍后重试')
    } finally {
      setBusy(null)
    }
  }

  const handleUninstallDeep = async () => {
    const ok = await confirm({
      title: '移除本机扫描件识别？',
      message: '移除后将清除本机准备的识别资源；应用自带能力不受影响。',
      confirmLabel: '移除',
      confirmTone: 'danger',
    })
    if (!ok) return
    setBusy('deep-uninstall')
    try {
      const res = await parseEnginesSettings.uninstallDeep()
      if (res.error) {
        toast.showError(res.error)
      } else {
        toast.showSuccess('已移除本机扫描件识别资源')
      }
      await refresh()
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '移除失败，请稍后重试')
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return <Spinner size="tiny" label="正在加载研报库…" />
  }

  const semanticReady = semantic?.installed ?? false
  const semanticSource = semantic?.source
  const deep = parseEngines?.deep
  const deepReady = Boolean(deep?.available || deep?.installed)
  const deepSource = deep?.source
  const anyBusy = busy !== null

  return (
    <div className={s.root}>
      <SettingsSectionLabel spaced>研报检索</SettingsSectionLabel>
      <Text className={s.hint} block>
        研报与资讯入库后，可在对话中按含义或关键词查找；扫描件需先完成文字识别准备。
      </Text>

      <SettingsGroup>
        <SettingsRow
          title="语义检索"
          desc={
            semanticReady
              ? semanticReadyDesc(semanticSource)
              : '尚未就绪，当前仅支持关键词查找'
          }
          control={(
            semanticReady
              ? (
                semanticSource === 'user'
                  ? (
                    <OpptrixButton
                      variant="ghost"
                      disabled={anyBusy}
                      onClick={() => { void handleUninstallSemantic() }}
                    >
                      {busy === 'semantic-uninstall' ? '正在移除…' : '移除'}
                    </OpptrixButton>
                  )
                  : (
                    <Text className={s.statusReady}>
                      {semanticSource === 'bundled' ? '应用已自带' : '已就绪'}
                    </Text>
                  )
              )
              : (
                <OpptrixButton
                  variant="primary"
                  disabled={anyBusy}
                  onClick={() => { void handleInstallSemantic() }}
                >
                  {busy === 'semantic-install' ? '正在安装…' : '安装'}
                </OpptrixButton>
              )
          )}
        />
        <SettingsRow
          title="扫描件文字识别"
          desc={deep ? deepReadyDesc(deep) : '正在读取状态…'}
          control={(
            deepReady
              ? (
                deepSource === 'user'
                  ? (
                    <OpptrixButton
                      variant="ghost"
                      disabled={anyBusy}
                      onClick={() => { void handleUninstallDeep() }}
                    >
                      {busy === 'deep-uninstall' ? '正在移除…' : '移除'}
                    </OpptrixButton>
                  )
                  : (
                    <Text className={s.statusReady}>
                      {deepSource === 'bundled' ? '应用已自带' : '已就绪'}
                    </Text>
                  )
              )
              : (
                <OpptrixButton
                  variant="primary"
                  disabled={anyBusy}
                  onClick={() => { void handlePrepareDeep() }}
                >
                  {busy === 'deep-prepare' ? '正在准备…' : '准备'}
                </OpptrixButton>
              )
          )}
          last
        />
      </SettingsGroup>
    </div>
  )
}
