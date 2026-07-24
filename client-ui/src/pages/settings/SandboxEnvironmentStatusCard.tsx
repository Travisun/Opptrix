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
import { opptrixCssVars, opptrixTokens } from '../../theme/tokens'

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
  listPanel: {
    border: opptrixCssVars.settingsPanelBorder,
    borderRadius: opptrixTokens.radiusLg,
    backgroundColor: opptrixCssVars.canvas,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  listHeader: {
    flexShrink: 0,
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
  listHeaderActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexShrink: 0,
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

function needsSetupAction(status: SandboxPlatformStatus): boolean {
  return Boolean(
    status.can_auto_install
    && (status.needs_elevation || status.needs_windows_install || status.needs_linux_install),
  )
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
        <Text block>暂时无法获取环境状态，请稍后重试。</Text>
        <OpptrixButton
          variant="secondary"
          size="small"
          icon={<ArrowSyncRegular fontSize={14} />}
          onClick={() => { void load() }}
        >
          刷新状态
        </OpptrixButton>
      </div>
    )
  }

  const showSetup = needsSetupAction(status)

  const isolationMeta = (() => {
    if (!status.supported) {
      return {
        desc: '当前系统暂不支持命令隔离',
        badge: null as ReactNode,
      }
    }
    if (status.ready) {
      return {
        desc: '助手运行命令时将自动启用隔离保护',
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
      <div className={s.listPanel}>
        <div className={s.listHeader}>
          <Text className={s.listHeaderMeta} block>
            {status.message}
          </Text>
          <div className={s.listHeaderActions}>
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
          </div>
        </div>

        <div className={s.listRow}>
          <div className={s.listRowMain}>
            <Text className={s.listRowTitle} block>总体就绪</Text>
            <Text className={s.listRowMeta} block>
              {status.ready ? '命令隔离环境已准备完成' : '部分组件尚未就绪'}
            </Text>
          </div>
          <span className={mergeClasses(s.statusBadge, status.ready && s.statusReady)}>
            {status.ready
              ? <><CheckmarkCircleRegular fontSize={14} /> 已就绪</>
              : '待完成'}
          </span>
        </div>

        <div className={s.listRow}>
          <div className={s.listRowMain}>
            <Text className={s.listRowTitle} block>隔离保护</Text>
            <Text className={s.listRowMeta} block>{isolationMeta.desc}</Text>
          </div>
          {isolationMeta.badge}
        </div>

        {(status.setup_hint || showSetup) && (
          <div className={s.footerHint}>
            {status.setup_hint && (
              <Text className={s.footerHintText} block>{status.setup_hint}</Text>
            )}
            {showSetup && !status.setup_hint && (
              <Text className={s.footerHintText} block>
                待完成一次系统授权，完成后即可启用命令隔离。
              </Text>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
