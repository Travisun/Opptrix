import { useCallback, useEffect, useRef, useState } from 'react'
import { Spinner, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import {
  ArrowSyncRegular,
  CheckmarkCircleRegular,
  CodeRegular,
} from '@fluentui/react-icons'
import {
  pythonSettings as pythonApi,
  type PythonRuntimeStatus,
  type PythonSettings,
} from '../../api/client'
import { useDebouncedEffect } from '../../hooks/useDebouncedEffect'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import { opptrixCssVars, opptrixTokens } from '../../theme/tokens'
import { ghostInteractive, motion } from '../../theme/mixins'
import {
  SettingsAddBar,
  SettingsListPanel,
  SettingsListRow,
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
  statusReady: { color: opptrixCssVars.success },
  statusWarn: { color: opptrixCssVars.warning },
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
    case 'system': return '本机 Python'
    case 'opptrix': return 'Opptrix 托管（随应用提供）'
    default: return '未就绪'
  }
}

function formatVersion(version: string | null): string {
  if (!version) return '—'
  return version.replace(/^Python\s+/i, '')
}

export default function PythonEnvironmentSettingsSection() {
  const s = useStyles()
  const toast = useSettingsToast()
  const [tab, setTab] = useState<Tab>('status')
  const [loading, setLoading] = useState(true)
  const [statusLoading, setStatusLoading] = useState(false)
  const [settings, setSettings] = useState<PythonSettings>({
    pip_index_urls: [],
    prefer_opptrix_python: true,
  })
  const [mirrorsText, setMirrorsText] = useState('')
  const [status, setStatus] = useState<PythonRuntimeStatus | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
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

  useDebouncedEffect(() => {
    if (loading || skipSave.current) {
      skipSave.current = false
      return
    }
    const base = baseline.current
    if (!base) return

    const next: PythonSettings = {
      pip_index_urls: textToMirrors(mirrorsText),
      prefer_opptrix_python: true,
    }
    if (mirrorsToText(base.pip_index_urls) === mirrorsToText(next.pip_index_urls)) {
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
  }, [mirrorsText, loading, toast], SETTINGS_SAVE_MS)

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
            查看当前可用的 Python。桌面版随应用提供的版本优先于本机；服务器与 Docker 使用系统 Python。
          </Text>
          <SettingsListPanel>
            <SettingsAddBar
              meta={status?.message ?? '正在获取状态…'}
              actions={(
                <OpptrixButton
                  variant="secondary"
                  icon={<ArrowSyncRegular />}
                  onClick={() => { void refreshStatus() }}
                  disabled={statusLoading}
                >
                  刷新
                </OpptrixButton>
              )}
            />
            {statusLoading && !status ? (
              <SettingsStaticBlock>
                <Spinner size="tiny" label="正在检测 Python…" />
              </SettingsStaticBlock>
            ) : status && (
              <>
                <SettingsListRow
                  title="当前采用"
                  trailing={(
                    <Text className={mergeClasses(status.ready ? s.statusReady : s.statusWarn)}>
                      {status.ready && <CheckmarkCircleRegular style={{ verticalAlign: '-2px', marginRight: 4 }} />}
                      {sourceLabel(status.active_source)}
                    </Text>
                  )}
                />
                <SettingsListRow
                  title="本机 Python"
                  trailing={(
                    <Text>
                      {status.system_path ? formatVersion(status.system_version) : '未检测到'}
                    </Text>
                  )}
                />
                <SettingsListRow
                  title="Opptrix 托管"
                  trailing={(
                    <Text>
                      {status.opptrix_path
                        ? `${formatVersion(status.opptrix_version)}${status.bundled_available ? ' · 随应用提供' : ''}`
                        : '未提供'}
                    </Text>
                  )}
                />
              </>
            )}
          </SettingsListPanel>
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
