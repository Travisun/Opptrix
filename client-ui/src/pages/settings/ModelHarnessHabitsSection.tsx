import { useCallback, useEffect, useState } from 'react'
import { Spinner, Switch, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import OpptrixSelect, { OpptrixOption } from '../../components/opptrix/OpptrixSelect'
import { useOpptrixDialogAlert } from '../../components/opptrix/OpptrixDialogAlert'
import {
  harnessSettings,
  listModelsForHarnessHabits,
  type HarnessActiveVersion,
  type HarnessAuditEntry,
} from '../../api/harnessSettings'
import type { AvailableModel } from '../../types/chat'
import { opptrixCssVars } from '../../theme/tokens'
import {
  SettingsEmptyState,
  SettingsGroup,
  SettingsRow,
  SettingsSectionLabel,
} from './SettingsPrimitives'
import { useSettingsToast } from './SettingsToast'
import { listRowKey } from '../../utils/listRowKey'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  hint: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.5,
    padding: '0 2px 4px',
  },
  modelSelect: {
    minWidth: '180px',
    maxWidth: '280px',
  },
  auditBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '4px 2px 0',
  },
  auditToggle: {
    alignSelf: 'flex-start',
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textSecondary,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px 0',
  },
  auditList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    maxHeight: '160px',
    overflowY: 'auto',
  },
  auditItem: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.4,
  },
  errorHint: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.5,
    padding: '8px 2px',
  },
})

function formatRelativeOrShortId(iso: string, id: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) {
    return id.length > 12 ? `${id.slice(0, 10)}…` : id
  }
  const diffMs = Date.now() - t
  const abs = Math.abs(diffMs)
  const minutes = Math.round(abs / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours} 小时前`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} 天前`
  return id.length > 12 ? `${id.slice(0, 10)}…` : id
}

function modelLabel(m: AvailableModel): string {
  return `${m.providerName} · ${m.model}`
}

function auditActionLabel(action: string): string {
  switch (action) {
    case 'promote_manual':
    case 'promote_auto':
      return '已更新习惯'
    case 'rollback_model':
    case 'rollback_default':
      return '已恢复默认'
    case 'set_auto_promote':
      return '已调整合入偏好'
    default:
      return '习惯有更新'
  }
}

export default function ModelHarnessHabitsSection() {
  const s = useStyles()
  const toast = useSettingsToast()
  const { confirm } = useOpptrixDialogAlert()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [models, setModels] = useState<AvailableModel[]>([])
  const [modelRef, setModelRef] = useState('')
  const [active, setActive] = useState<HarnessActiveVersion | null>(null)
  const [hasVersions, setHasVersions] = useState(false)
  const [autoPromote, setAutoPromote] = useState(true)
  const [envForcedOff, setEnvForcedOff] = useState(false)
  const [auditOpen, setAuditOpen] = useState(false)
  const [auditEntries, setAuditEntries] = useState<HarnessAuditEntry[]>([])
  const [rollingBack, setRollingBack] = useState(false)

  const applyAutoPromoteState = useCallback((pref: {
    enabled: boolean
    envForcedOff?: boolean
  }) => {
    setAutoPromote(pref.enabled)
    setEnvForcedOff(Boolean(pref.envForcedOff))
  }, [])

  /** 完整初始化：模型列表 + auto-promote +（有模型时）active/versions */
  const initialize = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const { models: list, default_model } = await listModelsForHarnessHabits()
      setModels(list)
      const initial = default_model && list.some(m => m.ref === default_model)
        ? default_model
        : (list[0]?.ref ?? '')
      setModelRef(initial)

      if (initial) {
        const [activeRes, versionsRes, autoRes] = await Promise.all([
          harnessSettings.getActive(initial),
          harnessSettings.listVersions(initial),
          harnessSettings.getAutoPromote(),
        ])
        setActive(activeRes.version)
        setHasVersions(versionsRes.versions.length > 0)
        applyAutoPromoteState(autoRes)
      } else {
        const autoRes = await harnessSettings.getAutoPromote()
        applyAutoPromoteState(autoRes)
        setActive(null)
        setHasVersions(false)
      }
    } catch {
      setError(true)
      setActive(null)
      setHasVersions(false)
    } finally {
      setLoading(false)
    }
  }, [applyAutoPromoteState])

  const loadForModel = useCallback(async (ref: string) => {
    if (!ref) return
    setLoading(true)
    setError(false)
    try {
      const [activeRes, versionsRes, autoRes] = await Promise.all([
        harnessSettings.getActive(ref),
        harnessSettings.listVersions(ref),
        harnessSettings.getAutoPromote(),
      ])
      setActive(activeRes.version)
      setHasVersions(versionsRes.versions.length > 0)
      applyAutoPromoteState(autoRes)
    } catch {
      setError(true)
      setActive(null)
      setHasVersions(false)
    } finally {
      setLoading(false)
    }
  }, [applyAutoPromoteState])

  useEffect(() => {
    void initialize()
  }, [initialize])

  const handleModelChange = (next: string) => {
    if (next === modelRef) return
    setModelRef(next)
    void loadForModel(next)
  }

  const handleRollback = async () => {
    const ok = await confirm({
      title: '恢复默认习惯？',
      message: '将清除此模型的自定义分析习惯，之后按默认方式分析。此操作可再通过新习惯更新覆盖。',
      confirmLabel: '恢复默认',
      confirmTone: 'danger',
    })
    if (!ok) return
    setRollingBack(true)
    try {
      await harnessSettings.rollback(modelRef)
      toast.showSuccess('已恢复默认习惯')
      await loadForModel(modelRef)
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '暂时无法恢复默认习惯，请稍后重试')
    } finally {
      setRollingBack(false)
    }
  }

  const handleAutoPromoteChange = async (next: boolean) => {
    if (envForcedOff) return
    const prev = autoPromote
    setAutoPromote(next)
    try {
      const pref = await harnessSettings.setAutoPromote(next)
      applyAutoPromoteState(pref)
    } catch (e) {
      setAutoPromote(prev)
      toast.showError(e instanceof Error ? e.message : '暂时无法保存偏好，请稍后重试')
    }
  }

  const loadAudit = async () => {
    if (auditOpen) {
      setAuditOpen(false)
      return
    }
    try {
      const res = await harnessSettings.listAudit(20)
      setAuditEntries(res.entries)
      setAuditOpen(true)
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '暂时无法加载更新记录')
    }
  }

  if (loading && models.length === 0) {
    return (
      <div className={s.root}>
        <SettingsSectionLabel spaced>此模型的分析习惯</SettingsSectionLabel>
        <Spinner size="tiny" label="正在加载分析习惯…" />
      </div>
    )
  }

  if (error && models.length === 0) {
    return (
      <div className={s.root}>
        <SettingsSectionLabel spaced>此模型的分析习惯</SettingsSectionLabel>
        <Text className={s.errorHint} block>
          暂时无法加载分析习惯。请稍后重试。
        </Text>
        <OpptrixButton
          variant="secondary"
          size="small"
          onClick={() => {
            void initialize()
          }}
        >
          重试
        </OpptrixButton>
      </div>
    )
  }

  const versionLine = active
    ? `当前习惯版本 · ${formatRelativeOrShortId(active.createdAt, active.id)}`
    : '正在使用默认习惯'

  const showEmpty = !loading && !error && !hasVersions && !active

  const autoPromoteDesc = envForcedOff
    ? '当前环境已关闭自动合入；偏好仍可保存，但不会生效。'
    : '默认开启：使用过程中可能自动合入更稳妥的分析习惯；关闭后不再自动更新，你仍可手动恢复默认。'

  return (
    <div className={s.root}>
      <SettingsSectionLabel spaced>此模型的分析习惯</SettingsSectionLabel>
      <Text className={s.hint} block>
        习惯会随使用逐步优化（回合结束后在后台合入）；下方开关可随时关掉自动更新。安全底线不会改。
      </Text>

      {loading ? (
        <Spinner size="tiny" label="正在加载分析习惯…" />
      ) : error ? (
        <>
          <Text className={s.errorHint} block>
            暂时无法加载分析习惯。请稍后重试。
          </Text>
          <OpptrixButton
            variant="secondary"
            size="small"
            onClick={() => {
              void initialize()
            }}
          >
            重试
          </OpptrixButton>
        </>
      ) : (
        <SettingsGroup>
          <SettingsRow
            title="当前模型"
            desc={versionLine}
            control={(
              models.length > 0 ? (
                <OpptrixSelect
                  className={s.modelSelect}
                  size="small"
                  selectedOptions={modelRef ? [modelRef] : []}
                  onOptionSelect={(_, d) => {
                    if (d.optionValue) handleModelChange(d.optionValue)
                  }}
                >
                  {models.map(m => (
                    <OpptrixOption key={m.ref} value={m.ref}>
                      {modelLabel(m)}
                    </OpptrixOption>
                  ))}
                </OpptrixSelect>
              ) : undefined
            )}
          />
          <SettingsRow
            title="允许自动更新习惯"
            desc={autoPromoteDesc}
            control={(
              <Switch
                checked={autoPromote}
                disabled={envForcedOff}
                onChange={(_, data) => {
                  void handleAutoPromoteChange(Boolean(data.checked))
                }}
                aria-label="允许自动更新习惯"
              />
            )}
          />
          <SettingsRow
            title="恢复默认习惯"
            desc={active ? '清除此模型的自定义分析习惯' : '当前已是默认习惯'}
            control={(
              <OpptrixButton
                variant="secondary"
                size="small"
                disabled={!active || rollingBack || !modelRef}
                onClick={() => { void handleRollback() }}
              >
                恢复默认习惯
              </OpptrixButton>
            )}
            last
          />
        </SettingsGroup>
      )}

      {showEmpty && (
        <SettingsEmptyState
          title="还没有为此模型保存过分析习惯"
          desc="本地已晋升的跑法会出现在这里；你也可以随时恢复默认习惯。"
        />
      )}

      <div className={s.auditBlock}>
        <button
          type="button"
          className={mergeClasses(s.auditToggle, 'opptrix-focusable')}
          onClick={() => { void loadAudit() }}
        >
          {auditOpen ? '收起最近更新记录' : '最近更新记录'}
        </button>
        {auditOpen && (
          auditEntries.length === 0 ? (
            <Text className={s.auditItem} block>还没有更新记录</Text>
          ) : (
            <div className={mergeClasses(s.auditList, 'opptrix-scroll')}>
              {auditEntries.map((e, i) => (
                <Text key={listRowKey(i, e.at, e.action)} className={s.auditItem} block>
                  {formatRelativeOrShortId(e.at, e.at)} · {auditActionLabel(e.action)}
                </Text>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}
