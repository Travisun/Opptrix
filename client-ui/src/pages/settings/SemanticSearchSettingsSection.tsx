/**
 * 设置 · 研报检索：安装/卸载语义检索模型（Phase B API）。
 * 文案面向用户，不暴露模型目录与引擎专名。
 */
import { useCallback, useEffect, useState } from 'react'
import { Spinner, Text, makeStyles } from '@fluentui/react-components'
import {
  semanticModelSettings,
  parseEnginesSettings,
  type ParseEnginesStatus,
  type SemanticModelStatus,
} from '../../api/client'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import { opptrixCssVars } from '../../theme/tokens'
import {
  SettingsGroup,
  SettingsRow,
  SettingsStaticBlock,
} from './SettingsPrimitives'
import { useSettingsToast } from './SettingsToast'
import { useOpptrixDialogAlert } from '../../components/opptrix/OpptrixDialogAlert'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '20px',
  },
  sectionLabel: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    color: opptrixCssVars.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    padding: '0 2px 8px',
  },
  hint: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.55,
    padding: '0 2px 4px',
  },
  status: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textPrimary,
  },
  muted: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
  },
})

export default function SemanticSearchSettingsSection() {
  const s = useStyles()
  const toast = useSettingsToast()
  const { confirm } = useOpptrixDialogAlert()
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [semantic, setSemantic] = useState<SemanticModelStatus | null>(null)
  const [engines, setEngines] = useState<ParseEnginesStatus | null>(null)

  const refresh = useCallback(async () => {
    const [sem, eng] = await Promise.all([
      semanticModelSettings.getStatus(),
      parseEnginesSettings.getStatus().catch(() => null),
    ])
    setSemantic(sem)
    setEngines(eng)
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    refresh()
      .catch(() => {
        if (active) toast.showError('暂时无法读取检索能力状态，请稍后重试')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [refresh, toast])

  const handleInstallSemantic = async () => {
    setBusy(true)
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
      setBusy(false)
    }
  }

  const handleUninstallSemantic = async () => {
    const ok = await confirm({
      title: '卸下语义检索？',
      message: '卸下后研报仍可按关键词查找；需要时再安装即可。',
      confirmLabel: '卸下',
      confirmTone: 'danger',
    })
    if (!ok) return
    setBusy(true)
    try {
      await semanticModelSettings.uninstall()
      toast.showSuccess('已卸下语义检索')
      await refresh()
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '卸下失败，请稍后重试')
    } finally {
      setBusy(false)
    }
  }

  const handlePrepareLayout = async () => {
    setBusy(true)
    try {
      const res = await parseEnginesSettings.prepareLayout()
      if (!res.ok) {
        toast.showError(res.error ?? '版面增强准备失败')
      } else if (res.layout?.available) {
        toast.showSuccess('版面增强已就绪')
      } else {
        toast.showSuccess('版面增强已准备，请按本机说明完成后续准备')
      }
      await refresh()
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '准备失败')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <Spinner size="tiny" label="正在加载检索能力…" />
  }

  const installed = semantic?.installed ?? false

  return (
    <div className={s.root}>
      <Text className={s.sectionLabel} block>研报检索</Text>
      <Text className={s.hint} block>
        安装语义检索后，在会话里查找研报内容时更懂语义；未安装时仍可用关键词查找。
      </Text>
      <SettingsGroup>
        <SettingsRow
          title="语义检索"
          desc={installed ? '已就绪，可在对话中混合查找研报' : '尚未安装，当前仅支持关键词查找'}
          control={(
            installed ? (
              <OpptrixButton
                variant="secondary"
                disabled={busy}
                onClick={() => { void handleUninstallSemantic() }}
              >
                卸下
              </OpptrixButton>
            ) : (
              <OpptrixButton
                variant="primary"
                disabled={busy}
                onClick={() => { void handleInstallSemantic() }}
              >
                {busy ? '正在安装…' : '安装'}
              </OpptrixButton>
            )
          )}
          last={!engines}
        />
        {engines ? (
          <SettingsStaticBlock>
            <Text className={s.status} block>
              {engines.layout.label}
              {' · '}
              {engines.layout.available ? '可用' : '未就绪'}
            </Text>
            <Text className={s.muted} block>{engines.layout.hint}</Text>
            {!engines.layout.available ? (
              <OpptrixButton
                variant="secondary"
                disabled={busy}
                onClick={() => { void handlePrepareLayout() }}
                style={{ marginTop: 8 }}
              >
                准备版面增强
              </OpptrixButton>
            ) : null}
            <Text className={s.status} block style={{ marginTop: 12 }}>
              {engines.deep.label}
              {' · '}
              {engines.deep.available ? '可用' : '未启用'}
            </Text>
            <Text className={s.muted} block>{engines.deep.hint}</Text>
          </SettingsStaticBlock>
        ) : null}
      </SettingsGroup>
    </div>
  )
}
