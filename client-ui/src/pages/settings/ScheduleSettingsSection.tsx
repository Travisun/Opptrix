import { useCallback, useEffect, useState } from 'react'
import { Spinner, Switch, Text, makeStyles } from '@fluentui/react-components'
import { CalendarClockRegular } from '@fluentui/react-icons'
import {
  scheduleApi,
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
import { isElectron } from '../../platform/detect'

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
    case 'interrupted': return '上次中断'
    case 'running': return '正在执行'
    default: return '尚未执行'
  }
}

export default function ScheduleSettingsSection() {
  const s = useStyles()
  const toast = useSettingsToast()
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<ScheduleSettings | null>(null)
  const [jobs, setJobs] = useState<ScheduledJob[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [settingsResp, jobsResp] = await Promise.all([
        scheduleApi.getSettings(),
        scheduleApi.listJobs(),
      ])
      setSettings(settingsResp.settings)
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
      const needsReconcile = (
        patch.master_enabled !== undefined
        || patch.autostart !== undefined
      )
      if (needsReconcile) {
        void window.electronAPI?.scheduleOsReconcile?.().catch(() => {})
      }
      toast.showSuccess('设置已保存')
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
        <SettingsSectionLabel>执行</SettingsSectionLabel>
        <SettingsGroup>
          <SettingsRow
            title="启用计划任务"
            desc="关闭后，任务不会自动执行"
            control={(
              <Switch
                checked={settings.master_enabled}
                onChange={(_, data) => { void patchSettings({ master_enabled: Boolean(data.checked) }) }}
                aria-label="启用计划任务"
              />
            )}
          />
          <SettingsRow
            title="允许任务运行受控脚本"
            desc="默认开启；关闭后计划任务将只跑智能体分析"
            control={(
              <Switch
                checked={settings.allow_shell_scripts}
                onChange={(_, data) => { void patchSettings({ allow_shell_scripts: Boolean(data.checked) }) }}
                aria-label="允许任务运行受控脚本"
              />
            )}
            last
          />
        </SettingsGroup>
      </div>

      {isElectron() && (
        <div className={s.sectionBlock}>
          <SettingsSectionLabel>开机启动</SettingsSectionLabel>
          <SettingsGroup>
            <SettingsRow
              title="登录时在托盘启动"
              desc="默认开启；登录后在托盘运行，便于按时执行任务"
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
      )}

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
