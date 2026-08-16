import { useCallback, useEffect, useMemo, useState } from 'react'
import { Spinner, Switch, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { ArrowClockwiseRegular } from '@fluentui/react-icons'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import { useOpptrixDialogAlert } from '../../components/opptrix/OpptrixDialogAlert'
import { getConfig, type PublicProvider } from '../../api/client'
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
  SettingsListPanel,
  SettingsListRow,
  SettingsRow,
  SettingsSectionLabel,
} from './SettingsPrimitives'
import SettingsRemoteModelSelector, {
  buildRemoteModelsFromProviders,
  parseRemoteModelRef,
  remoteModelRef,
} from './SettingsRemoteModelSelector'
import { useSettingsToast } from './SettingsToast'
import { listRowKey } from '../../utils/listRowKey'

const AUDIT_LIMIT = 50

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  sectionBlock: {
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
  remoteModelControl: {
    display: 'flex',
    justifyContent: 'flex-end',
    minWidth: '140px',
    maxWidth: '240px',
  },
  errorHint: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.5,
    padding: '8px 2px',
  },
  auditHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
  },
  auditPanel: {
    maxHeight: '320px',
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

function shortModelRef(ref: string | undefined): string | null {
  if (!ref || !ref.trim()) return null
  const trimmed = ref.trim()
  const colon = trimmed.indexOf(':')
  if (colon > 0 && colon < trimmed.length - 1) {
    return trimmed.slice(colon + 1)
  }
  return trimmed.length > 24 ? `${trimmed.slice(0, 22)}…` : trimmed
}

function auditActionLabel(action: string): string {
  switch (action) {
    case 'promote_manual':
    case 'promote_auto':
      return '已合入新习惯'
    case 'rollback_model':
    case 'rollback_default':
      return '已恢复默认'
    case 'set_auto_promote':
      return '已调整自进化开关'
    case 'skip_auto_promote':
      return '已跳过本次合入'
    default:
      return '习惯有更新'
  }
}

/** 将 AvailableModel 合成 PublicProvider 列表，供 SettingsRemoteModelSelector 复用。 */
function providersFromAvailableModels(models: AvailableModel[]): PublicProvider[] {
  const byId = new Map<string, PublicProvider>()
  for (const m of models) {
    const existing = byId.get(m.providerId)
    if (existing) {
      if (!existing.models.includes(m.model)) existing.models.push(m.model)
    } else {
      byId.set(m.providerId, {
        id: m.providerId,
        name: m.providerName,
        base_url: '',
        models: [m.model],
        api_key_configured: true,
      })
    }
  }
  return [...byId.values()]
}

export default function SelfEvolveSettingsSection() {
  const s = useStyles()
  const toast = useSettingsToast()
  const { confirm } = useOpptrixDialogAlert()

  const [habitsLoading, setHabitsLoading] = useState(true)
  const [habitsError, setHabitsError] = useState(false)
  const [models, setModels] = useState<AvailableModel[]>([])
  const [modelRef, setModelRef] = useState('')
  const [active, setActive] = useState<HarnessActiveVersion | null>(null)
  const [hasVersions, setHasVersions] = useState(false)
  const [autoPromote, setAutoPromote] = useState(true)
  const [envForcedOff, setEnvForcedOff] = useState(false)
  const [rollingBack, setRollingBack] = useState(false)

  const [auditLoading, setAuditLoading] = useState(true)
  const [auditError, setAuditError] = useState(false)
  const [auditEntries, setAuditEntries] = useState<HarnessAuditEntry[]>([])

  const providers = useMemo(() => providersFromAvailableModels(models), [models])
  const selectedParsed = useMemo(() => parseRemoteModelRef(modelRef), [modelRef])
  const selectedProvider = useMemo(
    () => providers.find(p => p.id === selectedParsed?.providerId) ?? null,
    [providers, selectedParsed?.providerId],
  )

  const applyAutoPromoteState = useCallback((pref: {
    enabled: boolean
    envForcedOff?: boolean
  }) => {
    setAutoPromote(pref.enabled)
    setEnvForcedOff(Boolean(pref.envForcedOff))
  }, [])

  const loadAudit = useCallback(async () => {
    setAuditLoading(true)
    setAuditError(false)
    try {
      const res = await harnessSettings.listAudit(AUDIT_LIMIT)
      setAuditEntries(res.entries)
    } catch {
      setAuditError(true)
      setAuditEntries([])
    } finally {
      setAuditLoading(false)
    }
  }, [])

  const initialize = useCallback(async () => {
    setHabitsLoading(true)
    setHabitsError(false)
    try {
      const [available, cfg] = await Promise.all([
        listModelsForHarnessHabits(),
        getConfig().catch(() => null),
      ])

      const merged = buildRemoteModelsFromProviders(cfg?.providers ?? [])
      const refs = new Set(merged.map(m => m.ref))
      for (const m of available.models) {
        if (!refs.has(m.ref)) {
          merged.push(m)
          refs.add(m.ref)
        }
      }
      setModels(merged)

      const initial = available.default_model && refs.has(available.default_model)
        ? available.default_model
        : (merged[0]?.ref ?? '')
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
      setHabitsError(true)
      setActive(null)
      setHasVersions(false)
    } finally {
      setHabitsLoading(false)
    }
  }, [applyAutoPromoteState])

  const loadForModel = useCallback(async (ref: string) => {
    if (!ref) return
    setHabitsLoading(true)
    setHabitsError(false)
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
      setHabitsError(true)
      setActive(null)
      setHasVersions(false)
    } finally {
      setHabitsLoading(false)
    }
  }, [applyAutoPromoteState])

  useEffect(() => {
    void initialize()
    void loadAudit()
  }, [initialize, loadAudit])

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
      await Promise.all([loadForModel(modelRef), loadAudit()])
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
      void loadAudit()
    } catch (e) {
      setAutoPromote(prev)
      toast.showError(e instanceof Error ? e.message : '暂时无法保存偏好，请稍后重试')
    }
  }

  const versionLine = active
    ? `当前习惯版本 · ${formatRelativeOrShortId(active.createdAt, active.id)}`
    : '正在使用默认习惯'

  const showHabitsEmpty = !habitsLoading && !habitsError && !hasVersions && !active

  const autoPromoteDesc = envForcedOff
    ? '当前环境已关闭自进化；开关不可用。'
    : '开启后，使用过程中可能自动合入更稳妥的分析习惯；关闭后不再自动合入，你仍可手动恢复默认。'

  return (
    <div className={s.root}>
      <div className={s.sectionBlock}>
        <SettingsSectionLabel spaced>自进化</SettingsSectionLabel>
        <Text className={s.hint} block>
          使用中可自动优化分析习惯；关闭后不再自动合入。安全底线不会改。
        </Text>
        <SettingsGroup>
          <SettingsRow
            title="开启自进化"
            desc={autoPromoteDesc}
            control={(
              <Switch
                checked={autoPromote}
                disabled={envForcedOff}
                onChange={(_, data) => {
                  void handleAutoPromoteChange(Boolean(data.checked))
                }}
                aria-label="开启自进化"
              />
            )}
            last
          />
        </SettingsGroup>
      </div>

      <div className={s.sectionBlock}>
        <SettingsSectionLabel spaced>按模型习惯</SettingsSectionLabel>
        <Text className={s.hint} block>
          不同模型可保留各自的分析习惯；可随时恢复默认。
        </Text>

        {habitsLoading && models.length === 0 ? (
          <Spinner size="tiny" label="正在加载分析习惯…" />
        ) : habitsError && models.length === 0 ? (
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
        ) : habitsLoading ? (
          <Spinner size="tiny" label="正在加载分析习惯…" />
        ) : habitsError ? (
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
            {models.length === 0 ? (
              <SettingsRow
                title="当前模型"
                desc="尚未配置模型。请先在「大模型」页添加后，再回来查看对应习惯。"
              />
            ) : (
              <SettingsRow
                title="当前模型"
                desc={selectedProvider
                  ? `${versionLine} · ${selectedProvider.name}`
                  : versionLine}
                control={(
                  <div className={s.remoteModelControl}>
                    <SettingsRemoteModelSelector
                      providers={providers}
                      providerId={selectedParsed?.providerId ?? null}
                      model={selectedParsed?.model ?? null}
                      disabled={habitsLoading}
                      onChange={({ providerId, model }) => {
                        const next = remoteModelRef(providerId, model)
                        if (next) handleModelChange(next)
                      }}
                    />
                  </div>
                )}
              />
            )}
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
                  恢复默认
                </OpptrixButton>
              )}
              last
            />
          </SettingsGroup>
        )}

        {showHabitsEmpty && (
          <SettingsEmptyState
            title="还没有为此模型保存过分析习惯"
            desc="使用过程中合入的习惯会出现在这里；你也可以随时恢复默认。"
          />
        )}
      </div>

      <div className={s.sectionBlock}>
        <div className={s.auditHeader}>
          <SettingsSectionLabel spaced>更新记录</SettingsSectionLabel>
          <OpptrixButton
            variant="icon"
            size="small"
            icon={<ArrowClockwiseRegular fontSize={14} />}
            aria-label="刷新更新记录"
            disabled={auditLoading}
            onClick={() => { void loadAudit() }}
          />
        </div>

        {auditLoading ? (
          <Spinner size="tiny" label="正在加载更新记录…" />
        ) : auditError ? (
          <>
            <Text className={s.errorHint} block>
              暂时无法加载更新记录。请稍后重试。
            </Text>
            <OpptrixButton
              variant="secondary"
              size="small"
              onClick={() => { void loadAudit() }}
            >
              重试
            </OpptrixButton>
          </>
        ) : auditEntries.length === 0 ? (
          <SettingsEmptyState
            title="还没有更新记录"
            desc="开启自进化并使用一段时间后，合入与恢复操作会出现在这里。"
          />
        ) : (
          <SettingsListPanel className={mergeClasses(s.auditPanel, 'opptrix-scroll')}>
            {auditEntries.map((e, i) => {
              const modelHint = shortModelRef(e.modelRef)
              const title = modelHint
                ? `${formatRelativeOrShortId(e.at, e.at)} · ${auditActionLabel(e.action)} · ${modelHint}`
                : `${formatRelativeOrShortId(e.at, e.at)} · ${auditActionLabel(e.action)}`
              return (
                <SettingsListRow
                  key={listRowKey(i, e.at, e.action, e.modelRef ?? '', e.versionId ?? '')}
                  title={title}
                />
              )
            })}
          </SettingsListPanel>
        )}
      </div>
    </div>
  )
}
