import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Spinner, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import {
  ArrowSyncRegular,
  CheckmarkCircleRegular,
  ShieldRegular,
} from '@fluentui/react-icons'
import { sandboxSettings, type SandboxPlatformStatus } from '../../api/client'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import { isElectron, electronPlatform } from '../../platform/detect'
import { useSettingsToast } from './SettingsToast'
import { opptrixCssVars } from '../../theme/tokens'
import {
  SettingsAddBar,
  SettingsListPanel,
  SettingsListRow,
} from './SettingsPrimitives'

const useStyles = makeStyles({
  sectionBlock: {
    marginTop: '0',
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
  footerHint: {
    padding: '10px 14px 12px',
    borderTop: `1px solid ${opptrixCssVars.separator}`,
    backgroundColor: opptrixCssVars.canvasAlt,
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  footerHintText: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.5,
  },
  footerActions: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
})

type ShellInstallResult = {
  ok: boolean
  cancelled?: boolean
  message?: string
}

function needsSetupAction(status: SandboxPlatformStatus): boolean {
  return Boolean(
    status.can_auto_install
    && (status.needs_elevation || status.needs_windows_install || status.needs_linux_install),
  )
}

function networkLevelLabel(level: SandboxPlatformStatus['network_isolation_level']): string {
  if (level === 'full') return '完整隔离'
  if (level === 'basic') return '基础隔离'
  return '未启用'
}

export default function SandboxEnvironmentStatusCard(props?: {
  isolationMode?: 'elevated' | 'unelevated'
  onSwitchToBasic?: () => void
}) {
  const s = useStyles()
  const toast = useSettingsToast()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [status, setStatus] = useState<SandboxPlatformStatus | null>(null)

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true)
    else setRefreshing(true)
    try {
      const resp = await sandboxSettings.getStatus()
      setStatus(resp.status)
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '暂时无法获取环境状态')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [toast])

  useEffect(() => { void load() }, [load])

  const handleInstall = useCallback(async () => {
    if (!isElectron()) {
      toast.showError('请在桌面版中完成系统授权')
      return
    }
    const platform = electronPlatform()
    const installFn = platform === 'win32'
      ? window.electronAPI?.shellInstallWindowsSandbox
      : platform === 'linux'
        ? window.electronAPI?.shellInstallLinuxSandbox
        : undefined
    if (!installFn) {
      toast.showError('当前系统不支持此操作')
      return
    }
    setInstalling(true)
    try {
      const result = await installFn() as ShellInstallResult
      if (result.ok) {
        toast.showSuccess(result.message ?? '命令隔离环境已就绪')
      } else if (result.cancelled) {
        toast.showError(result.message ?? '未完成系统授权')
      } else {
        toast.showError(result.message ?? '设置未完成，请稍后重试')
      }
      await load({ silent: true })
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '设置失败，请稍后重试')
    } finally {
      setInstalling(false)
    }
  }, [load, toast])

  if (loading) {
    return <Spinner size="tiny" label="正在加载环境状态…" />
  }

  if (!status) {
    return (
      <div className={s.sectionBlock}>
        <SettingsListPanel>
          <SettingsListRow
            title="暂时无法获取环境状态"
            meta="请稍后重试"
            trailing={(
              <OpptrixButton
                variant="secondary"
                size="small"
                icon={<ArrowSyncRegular fontSize={14} />}
                onClick={() => { void load() }}
              >
                刷新状态
              </OpptrixButton>
            )}
          />
        </SettingsListPanel>
      </div>
    )
  }

  const showSetup = needsSetupAction(status)
  const mode = props?.isolationMode
    ?? status.windows_isolation_mode
    ?? 'elevated'
  const showSwitchToBasic = Boolean(
    props?.onSwitchToBasic
    && mode === 'elevated'
    && !status.ready
    && (status.platform === 'windows' || electronPlatform() === 'win32'),
  )

  const isolationMeta = (() => {
    if (!status.supported) {
      return {
        desc: '当前系统暂不支持命令隔离',
        badge: null as ReactNode,
      }
    }
    if (status.ready) {
      return {
        desc: mode === 'unelevated'
          ? '助手运行命令时将启用基础隔离保护'
          : '助手运行命令时将自动启用隔离保护',
        badge: (
          <span className={mergeClasses(s.statusBadge, s.statusReady)}>
            <ShieldRegular fontSize={14} />
            已启用
          </span>
        ),
      }
    }
    return {
      desc: '完成设置后，助手运行命令时将启用保护',
      badge: (
        <span className={mergeClasses(s.statusBadge, s.statusWarn)}>
          待完成
        </span>
      ),
    }
  })()

  return (
    <div className={s.sectionBlock}>
      <SettingsListPanel>
        <SettingsAddBar
          meta={status.message}
          actions={(
            <>
              <OpptrixButton
                variant="ghost"
                size="small"
                icon={<ArrowSyncRegular fontSize={14} />}
                disabled={refreshing || installing}
                onClick={() => { void load({ silent: true }) }}
              >
                {refreshing ? '刷新中…' : '刷新状态'}
              </OpptrixButton>
              {showSetup && mode === 'elevated' && (
                <OpptrixButton
                  variant="primary"
                  size="small"
                  disabled={installing || refreshing}
                  onClick={() => { void handleInstall() }}
                >
                  {installing ? '正在设置…' : '完成设置'}
                </OpptrixButton>
              )}
            </>
          )}
        />

        <SettingsListRow
          title="总体就绪"
          meta={status.ready ? '命令隔离环境已准备完成' : '部分能力尚未就绪'}
          trailing={(
            <span className={mergeClasses(s.statusBadge, status.ready && s.statusReady)}>
              {status.ready
                ? <><CheckmarkCircleRegular fontSize={14} /> 已就绪</>
                : '待完成'}
            </span>
          )}
        />

        <SettingsListRow
          title="隔离保护"
          meta={isolationMeta.desc}
          trailing={isolationMeta.badge}
        />

        <SettingsListRow
          title="网络隔离能力"
          meta={
            status.network_isolation_level === 'basic'
              ? '基础隔离：出站由确认与白名单约束'
              : status.network_isolation_level === 'full'
                ? '完整隔离：出站受更强保护'
                : '当前未启用网络隔离保护'
          }
          trailing={(
            <span className={s.statusBadge}>
              {networkLevelLabel(status.network_isolation_level)}
            </span>
          )}
        />

        {(status.setup_hint || showSetup || showSwitchToBasic) && (
          <div className={s.footerHint}>
            {status.setup_hint && (
              <Text className={s.footerHintText} block>{status.setup_hint}</Text>
            )}
            {showSetup && !status.setup_hint && mode === 'elevated' && (
              <Text className={s.footerHintText} block>
                待完成一次系统授权，完成后即可启用完整隔离。
              </Text>
            )}
            {showSwitchToBasic && (
              <div className={s.footerActions}>
                <Text className={s.footerHintText} block>
                  完整隔离尚未就绪时，可先改用基础隔离继续使用。
                </Text>
                <OpptrixButton
                  variant="secondary"
                  size="small"
                  onClick={() => props?.onSwitchToBasic?.()}
                >
                  改用基础隔离
                </OpptrixButton>
              </div>
            )}
          </div>
        )}
      </SettingsListPanel>
    </div>
  )
}
