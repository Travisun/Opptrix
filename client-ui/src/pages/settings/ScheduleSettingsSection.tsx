import { useCallback, useEffect, useState } from 'react'
import { Spinner, Switch, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import {
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

function scheduleHealthBadge(os: ScheduleOsHealth | null, s: ReturnType<typeof useStyles>) {
  if (!os) return null
  switch (os.status) {
    case 'error':
      return (
        <span className={mergeClasses(s.statusBadge, s.statusError)}>
          <DismissCircleRegular fontSize={14} />
          需关注
        </span>
      )
    case 'pending':
      return (
        <span className={mergeClasses(s.statusBadge, s.statusWarn)}>
          同步中
        </span>
      )
    case 'synced':
      return (
        <span className={mergeClasses(s.statusBadge, s.statusReady)}>
          <CheckmarkCircleRegular fontSize={14} />
          就绪
        </span>
      )
    default:
      return (
        <span className={s.statusBadge}>
          托盘内执行
        </span>
      )
  }
}

export default function ScheduleSettingsSection() {
  const s = useStyles()
  const toast = useSettingsToast()
  const [loading, setLoading] = useState(true)
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
      const needsReconcile = (
        patch.master_enabled !== undefined
        || patch.autostart !== undefined
      )
      if (needsReconcile) {
        void window.electronAPI?.scheduleOsReconcile?.().catch(() => {})
      }
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
            desc="关闭后所有任务都不会自动执行。最小化到托盘时仍会按计划执行；从托盘完全退出后不会执行"
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
            title="登录时在托盘启动"
            desc="开机后静默进入托盘，便于计划任务在后台继续执行；完全退出应用后仍不会执行"
            control={(
              <Switch
                checked={settings.autostart}
                disabled={!settings.master_enabled}
                onChange={(_, data) => { void patchSettings({ autostart: Boolean(data.checked) }) }}
                aria-label="登录时在托盘启动"
              />
            )}
            last
          />
        </SettingsGroup>
      </div>

      <div className={s.sectionBlock}>
        <SettingsSectionLabel>运行说明</SettingsSectionLabel>
        <SettingsListPanel>
          <SettingsListRow
            title={os?.message ?? '应用运行或驻留托盘时按计划执行'}
            meta={summary
              ? `共 ${summary.total} 个任务，${summary.enabled} 个启用`
              : '暂无任务摘要'}
            trailing={scheduleHealthBadge(os, s)}
          />
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
