import { useCallback, useEffect, useState } from 'react'
import { Spinner, Switch, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import {
  ArrowSyncRegular,
  CalendarClockRegular,
  CheckmarkCircleRegular,
  DismissCircleRegular,
} from '@fluentui/react-icons'
import {
  scheduleApi,
  type ScheduleJobSummary,
  type ScheduleOsHealth,
  type ScheduleSettings,
  type ScheduledJob,
} from '../../api/client'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import { opptrixCssVars, opptrixTokens } from '../../theme/tokens'
import {
  SettingsGroup,
  SettingsRow,
  SettingsStaticBlock,
} from './SettingsPrimitives'
import { useSettingsToast } from './SettingsToast'
import { listRowKey } from '../../utils/listRowKey'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  sectionLabel: {
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 600,
    color: opptrixCssVars.textSecondary,
    letterSpacing: '-0.01em',
    paddingLeft: '2px',
  },
  statusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textSecondary,
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  statusReady: {
    color: opptrixCssVars.success,
  },
  statusWarn: {
    color: opptrixCssVars.warning,
  },
  statusError: {
    color: opptrixCssVars.error,
  },
  listPanel: {
    border: opptrixCssVars.settingsPanelBorder,
    borderRadius: opptrixTokens.radiusLg,
    backgroundColor: opptrixCssVars.canvas,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  listHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '10px 14px',
    minHeight: '44px',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
  },
  listHeaderMeta: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.45,
    flex: 1,
    minWidth: 0,
  },
  listRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
    padding: '8px 14px',
    minHeight: '38px',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    ':last-child': {
      borderBottom: 'none',
    },
  },
  listRowMain: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  listRowTitle: {
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.35,
  },
  listRowMeta: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.45,
  },
  emptyHint: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.5,
  },
})

function formatNextRun(iso: string | null): string {
  if (!iso) return '暂无安排'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '暂无安排'
  return d.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function jobKindLabel(kind: ScheduledJob['kind']): string {
  return kind === 'shell_script' ? '脚本' : '智能体'
}

function lastStatusLabel(status: string | null): string {
  switch (status) {
    case 'ok': return '上次成功'
    case 'error': return '上次失败'
    case 'skipped': return '上次跳过'
    case 'running': return '正在执行'
    default: return '尚未执行'
  }
}

function osStatusBadge(os: ScheduleOsHealth | null, s: ReturnType<typeof useStyles>) {
  if (!os) return null
  switch (os.status) {
    case 'synced':
      return (
        <span className={mergeClasses(s.statusBadge, s.statusReady)}>
          <CheckmarkCircleRegular fontSize={14} />
          已同步
        </span>
      )
    case 'pending':
      return (
        <span className={mergeClasses(s.statusBadge, s.statusWarn)}>
          同步中
        </span>
      )
    case 'error':
      return (
        <span className={mergeClasses(s.statusBadge, s.statusError)}>
          <DismissCircleRegular fontSize={14} />
          同步失败
        </span>
      )
    default:
      return (
        <span className={s.statusBadge}>
          应用内定时
        </span>
      )
  }
}

export default function ScheduleSettingsSection() {
  const s = useStyles()
  const toast = useSettingsToast()
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [settings, setSettings] = useState<ScheduleSettings | null>(null)
  const [jobs, setJobs] = useState<ScheduledJob[]>([])
  const [os, setOs] = useState<ScheduleOsHealth | null>(null)
  const [summary, setSummary] = useState<ScheduleJobSummary | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [settingsResp, statusResp, jobsResp] = await Promise.all([
        scheduleApi.getSettings(),
        scheduleApi.getStatus(),
        scheduleApi.listJobs(),
      ])
      setSettings(settingsResp.settings)
      setOs(statusResp.os)
      setSummary(statusResp.jobs)
      setJobs(jobsResp.jobs)
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '暂时无法加载计划任务')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { void load() }, [load])

  const patchSettings = useCallback(async (patch: Partial<ScheduleSettings>) => {
    try {
      const resp = await scheduleApi.patchSettings(patch)
      setSettings(resp.settings)
      if (resp.os) setOs(resp.os)
      toast.showSuccess('已保存')
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '保存失败，请稍后重试')
    }
  }, [toast])

  const toggleJob = useCallback(async (job: ScheduledJob, enabled: boolean) => {
    try {
      const resp = enabled
        ? await scheduleApi.enableJob(job.id)
        : await scheduleApi.disableJob(job.id)
      setJobs(prev => prev.map(j => (j.id === job.id ? resp.job : j)))
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '暂时无法更新任务')
    }
  }, [toast])

  const handleResync = useCallback(async () => {
    setSyncing(true)
    try {
      const resp = await scheduleApi.patchSettings({ resync_os: true })
      setSettings(resp.settings)
      if (resp.os) setOs(resp.os)
      toast.showSuccess('已重新注册系统定时')
      await load()
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '重新注册失败，请稍后重试')
    } finally {
      setSyncing(false)
    }
  }, [load, toast])

  if (loading) {
    return <Spinner size="tiny" label="正在加载计划任务…" />
  }

  if (!settings) {
    return (
      <SettingsStaticBlock>
        <Text className={s.emptyHint} block>
          暂时无法加载计划任务，请确认服务已启动后重试。
        </Text>
        <OpptrixButton variant="secondary" onClick={() => { void load() }}>
          重试
        </OpptrixButton>
      </SettingsStaticBlock>
    )
  }

  return (
    <div className={s.root}>
      <div>
        <Text className={s.sectionLabel} block>总开关</Text>
        <SettingsGroup>
          <SettingsRow
            title="计划任务"
            desc="关闭后，所有任务都不会自动执行"
            control={(
              <Switch
                checked={settings.master_enabled}
                onChange={(_, data) => { void patchSettings({ master_enabled: Boolean(data.checked) }) }}
                aria-label="计划任务总开关"
              />
            )}
          />
          <SettingsRow
            title="允许运行脚本"
            desc="开启后，计划任务可执行受控脚本（默认仅智能体提示词）"
            control={(
              <Switch
                checked={settings.allow_shell_scripts}
                onChange={(_, data) => { void patchSettings({ allow_shell_scripts: Boolean(data.checked) }) }}
                aria-label="允许运行脚本"
              />
            )}
            last
          />
        </SettingsGroup>
      </div>

      <div>
        <Text className={s.sectionLabel} block>后台常驻</Text>
        <SettingsGroup>
          <SettingsRow
            title="随应用启动"
            desc={settings.autostart ? '应用启动后会尝试注册系统定时' : '当前由应用内定时扫描执行'}
            control={(
              <Text style={{ fontSize: 'var(--opptrix-font-sm)', color: opptrixCssVars.textTertiary }}>
                {settings.autostart ? '已开启' : '未开启'}
              </Text>
            )}
            last
          />
        </SettingsGroup>
      </div>

      <div>
        <Text className={s.sectionLabel} block>系统定时</Text>
        <div className={s.listPanel}>
          <div className={s.listHeader}>
            <Text className={s.listHeaderMeta} block>
              {os?.message ?? '正在获取同步状态…'}
            </Text>
            <OpptrixButton
              variant="ghost"
              size="small"
              icon={<ArrowSyncRegular fontSize={14} />}
              disabled={syncing}
              onClick={() => { void handleResync() }}
            >
              {syncing ? '注册中…' : '重新注册'}
            </OpptrixButton>
          </div>
          <div className={s.listRow}>
            <div className={s.listRowMain}>
              <Text className={s.listRowTitle} block>同步状态</Text>
              <Text className={s.listRowMeta} block>
                {summary
                  ? `共 ${summary.total} 个任务，${summary.enabled} 个启用`
                  : '暂无任务摘要'}
              </Text>
            </div>
            {osStatusBadge(os, s)}
          </div>
          {os?.error && (
            <div className={s.listRow}>
              <Text className={s.listRowMeta} block>{os.error}</Text>
            </div>
          )}
        </div>
      </div>

      <div>
        <Text className={s.sectionLabel} block>任务列表</Text>
        {jobs.length === 0 ? (
          <SettingsStaticBlock>
            <Text className={s.emptyHint} block>
              还没有计划任务。
              你可以让助手帮你创建，例如「每个交易日收盘后总结大盘」。
            </Text>
          </SettingsStaticBlock>
        ) : (
          <div className={s.listPanel}>
            {jobs.map((job, index) => (
              <div
                key={listRowKey(index, job.id, job.title)}
                className={s.listRow}
              >
                <div className={s.listRowMain}>
                  <Text className={s.listRowTitle} block>
                    <CalendarClockRegular fontSize={14} style={{ marginRight: 6, verticalAlign: '-2px' }} />
                    {job.title}
                  </Text>
                  <Text className={s.listRowMeta} block>
                    {jobKindLabel(job.kind)} · 下次 {formatNextRun(job.next_run_at)} · {lastStatusLabel(job.last_status)}
                  </Text>
                </div>
                <Switch
                  checked={job.enabled}
                  disabled={!settings.master_enabled}
                  onChange={(_, data) => { void toggleJob(job, Boolean(data.checked)) }}
                  aria-label={`${job.title} 启用开关`}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
