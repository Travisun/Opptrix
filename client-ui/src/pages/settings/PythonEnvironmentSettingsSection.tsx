import { useCallback, useEffect, useRef, useState } from 'react'
import { ProgressBar, Spinner, Switch, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import {
  ArrowSyncRegular,
  CheckmarkCircleRegular,
  CodeRegular,
} from '@fluentui/react-icons'
import {
  pythonSettings as pythonApi,
  type PythonInstallJobSnapshot,
  type PythonRuntimeStatus,
  type PythonSettings,
} from '../../api/client'
import { useDebouncedEffect } from '../../hooks/useDebouncedEffect'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import { opptrixCssVars, opptrixTokens } from '../../theme/tokens'
import { ghostInteractive, motion } from '../../theme/mixins'
import {
  SettingsGroup,
  SettingsRow,
  SettingsStaticBlock,
} from './SettingsPrimitives'
import { useSettingsToast } from './SettingsToast'
import SettingsMonospaceEditor from './SettingsMonospaceEditor'

const SETTINGS_SAVE_MS = 500

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  tabHint: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.45,
    padding: '0 2px 4px',
  },
  modeRow: {
    display: 'flex',
    gap: '4px',
    padding: '3px',
    backgroundColor: opptrixCssVars.canvasAlt,
    borderRadius: opptrixTokens.radiusFull,
    width: 'fit-content',
  },
  modeTab: {
    ...ghostInteractive,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '5px 14px',
    borderRadius: opptrixTokens.radiusFull,
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 500,
    border: 'none',
    cursor: 'pointer',
    color: opptrixCssVars.textTertiary,
    transitionProperty: 'background-color, color',
    transitionDuration: motion.fast,
  },
  modeTabActive: {
    backgroundColor: opptrixCssVars.surface,
    color: opptrixCssVars.textPrimary,
    boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
  },
  saveHint: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    padding: '4px 2px 0',
    minHeight: '16px',
  },
  saveHintActive: {
    color: opptrixCssVars.textSecondary,
  },
  statusPanel: {
    border: opptrixCssVars.settingsPanelBorder,
    borderRadius: opptrixTokens.radiusLg,
    backgroundColor: opptrixCssVars.canvas,
    overflow: 'hidden',
  },
  statusHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '10px 14px',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
  },
  statusRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '10px',
    padding: '8px 14px',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    ':last-child': { borderBottom: 'none' },
  },
  statusLabel: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textSecondary,
  },
  statusValue: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textPrimary,
    textAlign: 'right' as const,
    wordBreak: 'break-all' as const,
  },
  statusReady: { color: opptrixCssVars.success },
  statusWarn: { color: opptrixCssVars.warning },
  meta: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.45,
  },
  progressBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '10px 14px',
    border: opptrixCssVars.settingsPanelBorder,
    borderRadius: opptrixTokens.radiusLg,
    backgroundColor: opptrixCssVars.canvas,
  },
  progressLabel: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textPrimary,
  },
  progressMeta: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textSecondary,
  },
})

type Tab = 'status' | 'mirrors'
type SaveState = 'idle' | 'pending' | 'saved' | 'error'

function mirrorsToText(urls: string[]): string {
  return urls.join('\n')
}

function textToMirrors(text: string): string[] {
  return text.split('\n').map(line => line.trim()).filter(Boolean)
}

function sourceLabel(source: PythonRuntimeStatus['active_source']): string {
  switch (source) {
    case 'system': return '系统 Python'
    case 'opptrix': return 'Opptrix 托管'
    default: return '未就绪'
  }
}

function formatVersion(version: string | null): string {
  if (!version) return '—'
  return version.replace(/^Python\s+/i, '')
}

function formatInstallProgress(job: PythonInstallJobSnapshot): string {
  if (job.percent > 0) return `${job.percent}%`
  return '准备中…'
}

function isInstallActive(job: PythonInstallJobSnapshot | null): boolean {
  return job?.state === 'queued' || job?.state === 'running'
}

export default function PythonEnvironmentSettingsSection() {
  const s = useStyles()
  const toast = useSettingsToast()
  const [tab, setTab] = useState<Tab>('status')
  const [loading, setLoading] = useState(true)
  const [statusLoading, setStatusLoading] = useState(false)
  const [settings, setSettings] = useState<PythonSettings>({
    pip_index_urls: [],
    prefer_opptrix_python: false,
  })
  const [mirrorsText, setMirrorsText] = useState('')
  const [status, setStatus] = useState<PythonRuntimeStatus | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [installBusy, setInstallBusy] = useState(false)
  const [installJob, setInstallJob] = useState<PythonInstallJobSnapshot | null>(null)
  const skipSave = useRef(true)
  const baseline = useRef<PythonSettings | null>(null)

  const refreshStatus = useCallback(async () => {
    setStatusLoading(true)
    try {
      const resp = await pythonApi.getStatus()
      setStatus(resp.status)
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '暂时无法读取 Python 状态')
    } finally {
      setStatusLoading(false)
    }
  }, [toast])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [settingsResp] = await Promise.all([
        pythonApi.getSettings(),
        refreshStatus(),
      ])
      setSettings(settingsResp.settings)
      setMirrorsText(mirrorsToText(settingsResp.settings.pip_index_urls))
      baseline.current = settingsResp.settings
      skipSave.current = true
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [refreshStatus, toast])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!isInstallActive(installJob)) return undefined
    const timer = window.setInterval(() => {
      void pythonApi.getInstallJob()
        .then(resp => {
          setInstallJob(resp.job)
          if (resp.job.state === 'completed') {
            void refreshStatus()
          }
        })
        .catch(() => { /* 轮询失败静默，下次重试 */ })
    }, 1500)
    return () => window.clearInterval(timer)
  }, [installJob, refreshStatus])

  useEffect(() => {
    void pythonApi.getInstallJob()
      .then(resp => setInstallJob(resp.job))
      .catch(() => { /* ignore */ })
  }, [])

  useDebouncedEffect(() => {
    if (loading || skipSave.current) {
      skipSave.current = false
      return
    }
    const base = baseline.current
    if (!base) return

    const next: PythonSettings = {
      pip_index_urls: textToMirrors(mirrorsText),
      prefer_opptrix_python: settings.prefer_opptrix_python,
    }
    if (
      base.prefer_opptrix_python === next.prefer_opptrix_python
      && mirrorsToText(base.pip_index_urls) === mirrorsToText(next.pip_index_urls)
    ) {
      return
    }

    setSaveState('pending')
    pythonApi.saveSettings(next)
      .then(resp => {
        setSettings(resp.settings)
        setMirrorsText(mirrorsToText(resp.settings.pip_index_urls))
        baseline.current = resp.settings
        setSaveState('saved')
        toast.showSuccess('已保存')
        window.setTimeout(() => setSaveState('idle'), 2000)
      })
      .catch((e: unknown) => {
        setSaveState('error')
        toast.showError(e instanceof Error ? e.message : '保存失败')
        window.setTimeout(() => setSaveState('idle'), 2000)
      })
  }, [mirrorsText, settings.prefer_opptrix_python, loading, toast], SETTINGS_SAVE_MS)

  const handleInstall = async () => {
    setInstallBusy(true)
    try {
      const resp = await pythonApi.startInstall()
      setInstallJob(resp.job)
      if (resp.job.state === 'completed') {
        await refreshStatus()
        toast.showSuccess('Opptrix 托管 Python 已安装')
      } else if (resp.job.state === 'failed') {
        toast.showError(resp.job.message)
      }
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '暂时无法开始安装')
    } finally {
      setInstallBusy(false)
    }
  }

  const saveHintText = (() => {
    switch (saveState) {
      case 'pending': return '正在保存…'
      case 'saved': return '已保存'
      case 'error': return '保存失败，请重试'
      default: return ''
    }
  })()

  if (loading) {
    return (
      <div className={s.root}>
        <Spinner size="tiny" label="正在加载 Python 环境…" />
      </div>
    )
  }

  return (
    <div className={s.root}>
      <div className={s.modeRow}>
        <OpptrixButton
          variant="ghost"
          className={mergeClasses(s.modeTab, tab === 'status' && s.modeTabActive)}
          onClick={() => setTab('status')}
        >
          <CodeRegular fontSize={14} />
          环境状态
        </OpptrixButton>
        <OpptrixButton
          variant="ghost"
          className={mergeClasses(s.modeTab, tab === 'mirrors' && s.modeTabActive)}
          onClick={() => setTab('mirrors')}
        >
          镜像源
        </OpptrixButton>
      </div>

      {tab === 'status' && (
        <>
          <Text className={s.tabHint} block>
            查看当前可用的 Python，以及运行脚本时将采用哪一套环境。
          </Text>
          <div className={s.statusPanel}>
            <div className={s.statusHeader}>
              <Text className={s.meta} block>
                {status?.message ?? '正在获取状态…'}
              </Text>
              <OpptrixButton
                variant="secondary"
                icon={<ArrowSyncRegular />}
                onClick={() => { void refreshStatus() }}
                disabled={statusLoading}
              >
                刷新
              </OpptrixButton>
            </div>
            {statusLoading && !status ? (
              <SettingsStaticBlock>
                <Spinner size="tiny" label="正在检测 Python…" />
              </SettingsStaticBlock>
            ) : status && (
              <>
                <div className={s.statusRow}>
                  <Text className={s.statusLabel}>当前采用</Text>
                  <Text className={mergeClasses(s.statusValue, status.ready ? s.statusReady : s.statusWarn)}>
                    {status.ready && <CheckmarkCircleRegular style={{ verticalAlign: '-2px', marginRight: 4 }} />}
                    {sourceLabel(status.active_source)}
                  </Text>
                </div>
                <div className={s.statusRow}>
                  <Text className={s.statusLabel}>系统 Python</Text>
                  <Text className={s.statusValue}>
                    {status.system_path ? formatVersion(status.system_version) : '未检测到'}
                  </Text>
                </div>
                <div className={s.statusRow}>
                  <Text className={s.statusLabel}>Opptrix 托管</Text>
                  <Text className={s.statusValue}>
                    {status.opptrix_path ? formatVersion(status.opptrix_version) : '未安装'}
                  </Text>
                </div>
              </>
            )}
          </div>
          {(!status?.opptrix_path || status?.recommend_install || installJob?.state === 'failed') && (
            <SettingsGroup>
              <SettingsRow
                title="安装托管 Python"
                desc="一键安装 Opptrix 托管版本，无需单独配置系统 Python"
                control={(
                  <OpptrixButton
                    variant="primary"
                    onClick={() => { void handleInstall() }}
                    disabled={installBusy || isInstallActive(installJob)}
                  >
                    {installBusy || isInstallActive(installJob) ? '安装中…' : installJob?.state === 'failed' ? '重试安装' : '开始安装'}
                  </OpptrixButton>
                )}
                last
              />
            </SettingsGroup>
          )}
          {isInstallActive(installJob) && installJob && (
            <div className={s.progressBlock}>
              <Text className={s.progressLabel} block>{installJob.message}</Text>
              {installJob.bytes_total != null && installJob.bytes_total > 0 && (
                <Text className={s.progressMeta} block>
                  已下载 {(installJob.bytes_downloaded / 1024 / 1024).toFixed(1)} MB / {(installJob.bytes_total / 1024 / 1024).toFixed(1)} MB
                </Text>
              )}
              <ProgressBar
                value={installJob.percent > 0 ? installJob.percent / 100 : undefined}
                thickness="medium"
                color="brand"
                shape="rounded"
              />
              <Text className={s.progressMeta} block>{formatInstallProgress(installJob)}</Text>
            </div>
          )}
          {installJob?.state === 'failed' && (
            <Text className={s.meta} block>{installJob.message}</Text>
          )}
          <SettingsGroup>
            <SettingsRow
              title="优先使用 Opptrix 托管"
              desc="开启后，在已安装托管版本时优先于系统 Python"
              control={(
                <Switch
                  checked={settings.prefer_opptrix_python}
                  onChange={(_, data) => {
                    setSettings(prev => ({ ...prev, prefer_opptrix_python: data.checked }))
                  }}
                />
              )}
              last
            />
          </SettingsGroup>
        </>
      )}

      {tab === 'mirrors' && (
        <>
          <Text className={s.tabHint} block>
            每行一个镜像地址，按顺序尝试；首个镜像用于安装依赖时的默认源。
          </Text>
          <SettingsMonospaceEditor
            value={mirrorsText}
            onChange={setMirrorsText}
            height="280px"
            placeholder="https://pypi.tuna.tsinghua.edu.cn/simple"
          />
          <Text className={mergeClasses(s.saveHint, saveState !== 'idle' && s.saveHintActive)} block>
            {saveHintText}
          </Text>
        </>
      )}
    </div>
  )
}
