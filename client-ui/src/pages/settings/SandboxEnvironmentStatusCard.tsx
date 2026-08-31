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
})

type ShellInstallResult = {
  ok: boolean
  cancelled?: boolean
  message?: string
}

const WORKSPACE_ISOLATION_DESC =
  '命令仅限已授权文件夹；敏感路径受保护；默认可访问外网'

/** 产品默认：工作区隔离（无需系统授权）。兼容 sibling 可能新增的 isolation_mode 字段。 */
function isWorkspaceIsolationActive(status: SandboxPlatformStatus): boolean {
  if (status.isolation_mode === 'workspace') return true
  if (status.isolation_mode === 'srt') return false
  // 自托管 / Web：无桌面授权路径，一律按工作区隔离呈现
  if (!isElectron()) return true
  // 就绪且无需系统授权 → 工作区隔离
  if (
    status.ready
    && !status.needs_elevation
    && !status.needs_windows_install
    && !status.needs_linux_install
  ) {
    return true
  }
  // 基础网络约束 + 无 elevation 诉求
  if (
    status.network_isolation_level === 'basic'
    && !status.needs_elevation
    && !status.needs_windows_install
    && !status.needs_linux_install
  ) {
    return true
  }
  return false
}

/** 仅桌面 + 显式需要系统授权时才露出「完成设置」（遗留完整隔离路径）。 */
function needsSetupAction(status: SandboxPlatformStatus): boolean {
  if (!isElectron()) return false
  if (isWorkspaceIsolationActive(status)) return false
  return Boolean(
    status.can_auto_install
    && (status.needs_elevation || status.needs_windows_install || status.needs_linux_install),
  )
}

function networkLevelLabel(level: SandboxPlatformStatus['network_isolation_level']): string {
  if (level === 'full') return '完整网络约束'
  if (level === 'basic') return '确认与白名单'
  return '未启用'
}

function displayMessage(status: SandboxPlatformStatus, workspaceActive: boolean): string {
  if (workspaceActive) {
    // 勿把「完整隔离未就绪」类后端文案吓到用户
    if (
      /完整隔离|系统授权|待完成|尚未就绪|AppArmor|userns|bwrap|SRT/i.test(status.message)
      || !status.message.trim()
    ) {
      return status.ready
        ? '工作区隔离已启用'
        : '工作区隔离可用：命令受文件夹授权约束，默认可访问外网'
    }
  }
  return status.message
}

export default function SandboxEnvironmentStatusCard() {
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
      toast.showError('当前环境无需系统授权，工作区隔离已可用')
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
        toast.showSuccess(result.message ?? '环境已就绪')
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

  const workspaceActive = isWorkspaceIsolationActive(status)
  const showSetup = needsSetupAction(status)
  const overallReady = status.ready || workspaceActive

  const isolationMeta = (() => {
    if (!status.supported && !workspaceActive) {
      return {
        desc: '当前系统暂不支持命令保护',
        badge: null as ReactNode,
      }
    }
    if (workspaceActive || status.ready) {
      return {
        desc: WORKSPACE_ISOLATION_DESC,
        badge: (
          <span className={mergeClasses(s.statusBadge, s.statusReady)}>
            <ShieldRegular fontSize={14} />
            工作区隔离
          </span>
        ),
      }
    }
    return {
      desc: '助手运行命令时将启用工作区隔离保护',
      badge: (
        <span className={mergeClasses(s.statusBadge, s.statusWarn)}>
          待确认
        </span>
      ),
    }
  })()

  const networkMeta = (() => {
    if (workspaceActive) {
      return '默认可访问外网；文件夹授权与敏感路径仍受保护'
    }
    if (status.network_isolation_level === 'basic') {
      return '出站由确认与白名单约束'
    }
    if (status.network_isolation_level === 'full') {
      return '出站受更强系统约束'
    }
    return '出站由确认与白名单约束'
  })()

  const setupHintSafe = (() => {
    if (!status.setup_hint) return undefined
    if (workspaceActive) return undefined
    if (/完整隔离|bwrap|SRT|AppArmor|userns/i.test(status.setup_hint)) return undefined
    return status.setup_hint
  })()

  return (
    <div className={s.sectionBlock}>
      <SettingsListPanel>
        <SettingsAddBar
          meta={displayMessage(status, workspaceActive)}
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
              {showSetup && (
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
          meta={
            overallReady
              ? '工作区隔离已就绪，可安全运行受控命令'
              : '请刷新状态；若仍不可用，请确认已授权工作区文件夹'
          }
          trailing={(
            <span className={mergeClasses(s.statusBadge, overallReady && s.statusReady)}>
              {overallReady
                ? <><CheckmarkCircleRegular fontSize={14} /> 已就绪</>
                : '待确认'}
            </span>
          )}
        />

        <SettingsListRow
          title="隔离保护"
          meta={isolationMeta.desc}
          trailing={isolationMeta.badge}
        />

        <SettingsListRow
          title="网络访问"
          meta={networkMeta}
          trailing={(
            <span className={s.statusBadge}>
              {workspaceActive
                ? '确认与白名单'
                : networkLevelLabel(status.network_isolation_level)}
            </span>
          )}
        />

        {(setupHintSafe || showSetup) && (
          <div className={s.footerHint}>
            {setupHintSafe && (
              <Text className={s.footerHintText} block>{setupHintSafe}</Text>
            )}
            {showSetup && !setupHintSafe && (
              <Text className={s.footerHintText} block>
                当前环境需要一次系统授权后才能启用更强保护；日常使用工作区隔离即可。
              </Text>
            )}
          </div>
        )}
      </SettingsListPanel>
    </div>
  )
}
