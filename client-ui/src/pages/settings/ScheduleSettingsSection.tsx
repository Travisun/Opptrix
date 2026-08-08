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
import { opptrixCssVars } from '../../theme/tokens'
import {
  SettingsAddBar,
  SettingsEmptyState,
  SettingsGroup,
  SettingsListPanel,
  SettingsListRow,
  SettingsRow,
  SettingsSectionLabel,
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
  sectionBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
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
  emptyHint: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.5,
  },
  jobTitle: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    minWidth: 0,
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
      <div className={s.sectionBlock}>
        <SettingsSectionLabel>总开关</SettingsSectionLabel>
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

      <div className={s.sectionBlock}>
        <SettingsSectionLabel>后台常驻</SettingsSectionLabel>
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

      <div className={s.sectionBlock}>
        <SettingsSectionLabel>系统定时</SettingsSectionLabel>
        <SettingsListPanel>
          <SettingsAddBar
            meta={os?.message ?? '正在获取同步状态…'}
            actions={(
              <OpptrixButton
                variant="ghost"
                size="small"
                icon={<ArrowSyncRegular fontSize={14} />}
                disabled={syncing}
                onClick={() => { void handleResync() }}
              >
                {syncing ? '注册中…' : '重新注册'}
              </OpptrixButton>
            )}
          />
          <SettingsListRow
            title="同步状态"
            meta={summary
              ? `共 ${summary.total} 个任务，${summary.enabled} 个启用`
              : '暂无任务摘要'}
            trailing={osStatusBadge(os, s)}
          />
          {os?.error && (
            <SettingsListRow title={os.error} />
          )}
        </SettingsListPanel>
      </div>

      <div className={s.sectionBlock}>
        <SettingsSectionLabel>任务列表</SettingsSectionLabel>
        {jobs.length === 0 ? (
          <SettingsGroup>
            <SettingsEmptyState
              icon={<CalendarClockRegular fontSize={22} />}
              title="还没有计划任务"
              desc="你可以让助手帮你创建，例如「每个交易日收盘后总结大盘」。"
            />
          </SettingsGroup>
        ) : (
          <SettingsListPanel>
            {jobs.map((job, index) => (
              <SettingsListRow
                key={listRowKey(index, job.id, job.title)}
                title={(
                  <span className={s.jobTitle}>
                    <CalendarClockRegular fontSize={14} />
                    {job.title}
                  </span>
                )}
                titleTitle={job.title}
                meta={`${jobKindLabel(job.kind)} · 下次 ${formatNextRun(job.next_run_at)} · ${lastStatusLabel(job.last_status)}`}
                trailing={(
                  <Switch
                    checked={job.enabled}
                    disabled={!settings.master_enabled}
                    onChange={(_, data) => { void toggleJob(job, Boolean(data.checked)) }}
                    aria-label={`${job.title} 启用开关`}
                  />
                )}
              />
            ))}
          </SettingsListPanel>
        )}
      </div>
    </div>
  )
}
