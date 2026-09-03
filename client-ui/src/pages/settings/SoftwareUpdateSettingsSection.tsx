import { useCallback, useEffect, useMemo, useState } from 'react'
import { ProgressBar, Spinner, Switch, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import {
  ArrowDownloadRegular,
  ArrowSyncRegular,
  CopyRegular,
} from '@fluentui/react-icons'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import { useOpptrixDialogAlert } from '../../components/opptrix/OpptrixDialogAlert'
import { getHealth } from '../../api/client'
import { useAppUpdate } from '../../hooks/useAppUpdate'
import { isSystemUpdateBlocked, useSystemUpdate } from '../../hooks/useSystemUpdate'
import { isElectron } from '../../platform/detect'
import { copyTextToClipboard } from '../../platform/clipboard'
import { opptrixCssVars } from '../../theme/tokens'
import {
  buildAppUpdatePanel,
  isAppUpdateCheckBusy,
} from '../../utils/appUpdateUi'
import {
  SettingsGroup,
  SettingsRow,
  SettingsSectionLabel,
} from './SettingsPrimitives'
import { buildSystemUpdatePanel } from './systemUpdatePanelModel'

function stripVersionPrefix(raw: string): string {
  return raw.trim().replace(/^v/i, '')
}

/** Product-facing dual version: 运行时 + 底座 when both known and distinct. */
function formatRuntimeBaseVersionDesc(
  runtime: string | null | undefined,
  base: string | null | undefined,
): string | null {
  const runtimeLabel = runtime?.trim() ? stripVersionPrefix(runtime) : ''
  const baseLabel = base?.trim() ? stripVersionPrefix(base) : ''
  if (!runtimeLabel) return null
  if (baseLabel && baseLabel !== runtimeLabel) {
    return `运行时 v${runtimeLabel} · 底座 v${baseLabel}`
  }
  return `运行时 v${runtimeLabel}`
}

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  rootEmbedded: {
    gap: '16px',
  },
  updateStatusBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    width: '100%',
    padding: '12px 18px',
    boxSizing: 'border-box',
  },
  updateTitle: {
    fontSize: 'var(--opptrix-font-lg)',
    fontWeight: 600,
    letterSpacing: '-0.01em',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.35,
  },
  updatePanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    width: '100%',
  },
  updateDesc: {
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.55,
  },
  progressMeta: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.4,
  },
  updateActions: {
    display: 'flex',
    justifyContent: 'flex-start',
    gap: '8px',
    paddingTop: '2px',
    width: '100%',
  },
  cliCode: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textPrimary,
    backgroundColor: opptrixCssVars.canvas,
    border: `1px solid ${opptrixCssVars.separator}`,
    borderRadius: '6px',
    padding: '8px 10px',
    width: '100%',
    boxSizing: 'border-box',
    wordBreak: 'break-all',
  },
  actionBtn: {
    minHeight: '32px',
    height: '32px',
    padding: '0 14px',
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 600,
    gap: '6px',
    '& .fui-Button__icon': {
      fontSize: 'var(--opptrix-font-lg)',
      width: '14px',
      height: '14px',
      marginInlineEnd: '0',
    },
    '& .fui-Button__icon svg': {
      width: '14px',
      height: '14px',
    },
  },
  emptyHint: {
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.55,
    padding: '4px 2px 0',
  },
})

export default function SoftwareUpdateSettingsSection({ embedded = false }: { embedded?: boolean }) {
  const s = useStyles()
  const { confirm: confirmDialog } = useOpptrixDialogAlert()
  const {
    status: updateStatus,
    autoDownload,
    checkNow,
    downloadUpdate,
    installUpdate,
    setAutoDownload,
  } = useAppUpdate()
  const {
    active: systemUpdateActive,
    status: systemStatus,
    checkNow: checkSystemNow,
    applyNow: applySystemNow,
    rollbackNow: rollbackSystemNow,
    openConfirm: openSystemConfirm,
    checking: systemChecking,
    applying: systemApplying,
    rollingBack: systemRollingBack,
    waitingForBaseRefresh: systemWaitingBase,
    environmentWaiting: systemEnvironmentWaiting,
  } = useSystemUpdate()

  const [versionLabel, setVersionLabel] = useState<string | null>(null)
  const [healthRuntime, setHealthRuntime] = useState<string | null>(null)
  const [healthBase, setHealthBase] = useState<string | null>(null)
  const [checkedOnce, setCheckedOnce] = useState(false)
  const [systemCheckedOnce, setSystemCheckedOnce] = useState(false)
  const [cliCopied, setCliCopied] = useState(false)

  const showElectronUpdate = isElectron()
  const showSystemUpdate = systemUpdateActive && systemStatus.enabled

  useEffect(() => {
    if (isElectron()) {
      void window.electronAPI?.clientVersion?.().then(version => {
        setVersionLabel(version ? `v${version}` : null)
      })
      return
    }
    void getHealth()
      .then((health) => {
        const runtime = health.runtime_version || health.version || null
        const base = health.base_version ?? null
        setHealthRuntime(runtime)
        setHealthBase(base)
        setVersionLabel(formatRuntimeBaseVersionDesc(runtime, base))
      })
      .catch(() => {
        setHealthRuntime(null)
        setHealthBase(null)
        setVersionLabel(null)
      })
  }, [])

  const selfHostVersionDesc = useMemo(() => {
    if (showElectronUpdate) return versionLabel
    const runtime = systemStatus.currentVersion || healthRuntime
    const base = systemStatus.baseVersion || healthBase
    return formatRuntimeBaseVersionDesc(runtime, base) ?? versionLabel
  }, [
    showElectronUpdate,
    versionLabel,
    systemStatus.currentVersion,
    systemStatus.baseVersion,
    healthRuntime,
    healthBase,
  ])

  const serviceVersionDesc = useMemo(() => {
    if (!showSystemUpdate) return null
    const runtime = systemStatus.currentVersion || healthRuntime
    const base = systemStatus.baseVersion || healthBase
    return formatRuntimeBaseVersionDesc(runtime, base)
  }, [
    showSystemUpdate,
    systemStatus.currentVersion,
    systemStatus.baseVersion,
    healthRuntime,
    healthBase,
  ])

  const handleCheckUpdate = useCallback(() => {
    setCheckedOnce(true)
    void checkNow()
  }, [checkNow])

  const handleCheckSystemUpdate = useCallback(() => {
    setSystemCheckedOnce(true)
    void checkSystemNow()
  }, [checkSystemNow])

  const handleRollbackSystem = useCallback(async () => {
    const backup = systemStatus.backupVersion
    const ok = await confirmDialog({
      title: '恢复上一版本？',
      message: backup
        ? `将恢复到 v${backup}。恢复期间暂时无法使用其他功能，你的对话与本地数据会保留。`
        : '将恢复到上一版本。恢复期间暂时无法使用其他功能，你的对话与本地数据会保留。',
      confirmLabel: '恢复上一版本',
      cancelLabel: '取消',
      confirmTone: 'danger',
    })
    if (!ok) return
    openSystemConfirm()
    void rollbackSystemNow()
  }, [confirmDialog, openSystemConfirm, rollbackSystemNow, systemStatus.backupVersion])

  const handleAutoDownloadChange = useCallback((_: unknown, data: { checked: boolean | 'mixed' }) => {
    void setAutoDownload(Boolean(data.checked))
  }, [setAutoDownload])

  const checkBusy = isAppUpdateCheckBusy(updateStatus)
  const updatePanel = buildAppUpdatePanel(updateStatus, { checkedOnce, autoDownload })
  const showUpdateStatusRow = Boolean(updatePanel?.visible)
  const systemBusy = systemChecking || systemApplying || systemRollingBack
  const systemCli = systemStatus.cliCommand?.trim() || 'opptrix update'

  const handleCopySystemCli = useCallback(() => {
    void copyTextToClipboard(systemCli).then((ok) => {
      if (!ok) return
      setCliCopied(true)
      window.setTimeout(() => setCliCopied(false), 1600)
    })
  }, [systemCli])

  const systemPanel = showSystemUpdate
    ? buildSystemUpdatePanel(systemStatus, {
      checkedOnce: systemCheckedOnce,
      environmentWaiting: systemEnvironmentWaiting,
      waitingForBaseRefresh: systemWaitingBase,
    })
    : null
  const showSystemStatusRow = Boolean(systemPanel)
  const showSystemRollbackRow = Boolean(
    showSystemUpdate
    && systemStatus.uiPhase === 'normal'
    && systemStatus.backupVersion,
  )

  const versionDesc = showElectronUpdate
    ? (versionLabel ?? '读取版本中…')
    : (selfHostVersionDesc ?? '读取版本中…')

  if (!showElectronUpdate && !showSystemUpdate) {
    return (
      <Text className={s.emptyHint} block>
        当前环境未启用在线更新。若你使用 Docker 或自托管部署，请确认已按文档配置更新通道。
      </Text>
    )
  }

  return (
    <div className={mergeClasses(s.root, embedded && s.rootEmbedded)}>
      {showElectronUpdate && (
        <div>
          {!embedded && <SettingsSectionLabel spaced>应用更新</SettingsSectionLabel>}
          <SettingsGroup>
            <SettingsRow
              title="当前版本"
              desc={versionDesc}
              control={(
                <OpptrixButton
                  variant="secondary"
                  disabled={checkBusy}
                  icon={checkBusy ? <Spinner size="tiny" /> : undefined}
                  onClick={handleCheckUpdate}
                >
                  {checkBusy ? '检查中…' : '检查更新'}
                </OpptrixButton>
              )}
            />
            <SettingsRow
              title="自动下载更新"
              desc="开启后发现新版本会在后台下载；关闭后仍会检查并提醒，需你确认后再下载"
              control={(
                <Switch
                  checked={autoDownload}
                  onChange={handleAutoDownloadChange}
                  aria-label="自动下载更新"
                />
              )}
              last={!showUpdateStatusRow}
            />
            {showUpdateStatusRow && updatePanel && (
              <div className={s.updateStatusBlock}>
                <Text className={s.updateTitle} block>{updatePanel.title}</Text>
                <div className={s.updatePanel}>
                  <Text className={s.updateDesc} block>{updatePanel.desc}</Text>
                  {updatePanel.showProgress && (
                    <>
                      <ProgressBar
                        value={
                          updatePanel.percent != null && updatePanel.percent > 0
                            ? updatePanel.percent / 100
                            : undefined
                        }
                        max={1}
                        thickness="medium"
                        shape="rounded"
                      />
                      <Text className={s.progressMeta} block>
                        {updateStatus.state === 'available' && autoDownload
                          ? '正在连接下载…'
                          : updateStatus.state === 'installing'
                            ? '正在替换应用文件并准备重启…'
                            : updatePanel.percent != null && updatePanel.percent > 0
                              ? `已完成 ${updatePanel.percent}%`
                              : '正在准备下载…'}
                      </Text>
                    </>
                  )}
                  {updatePanel.showDownload && (
                    <div className={s.updateActions}>
                      <OpptrixButton
                        className={s.actionBtn}
                        variant="primary"
                        size="small"
                        icon={<ArrowDownloadRegular fontSize={14} />}
                        onClick={() => { void downloadUpdate() }}
                      >
                        下载更新
                      </OpptrixButton>
                    </div>
                  )}
                  {updatePanel.showInstall && (
                    <div className={s.updateActions}>
                      <OpptrixButton
                        className={s.actionBtn}
                        variant="primary"
                        size="small"
                        icon={<ArrowSyncRegular fontSize={14} />}
                        onClick={() => { void installUpdate() }}
                      >
                        重启更新
                      </OpptrixButton>
                    </div>
                  )}
                </div>
              </div>
            )}
          </SettingsGroup>
        </div>
      )}

      {showSystemUpdate && (
        <div>
          {!embedded && (
            <SettingsSectionLabel spaced>
              {showElectronUpdate ? '服务热更新' : '在线更新'}
            </SettingsSectionLabel>
          )}
          <SettingsGroup>
            {!showElectronUpdate && (
              <SettingsRow
                title="当前版本"
                desc={versionDesc}
                control={(
                  <OpptrixButton
                    variant="secondary"
                    disabled={systemBusy}
                    icon={systemBusy ? <Spinner size="tiny" /> : undefined}
                    onClick={handleCheckSystemUpdate}
                  >
                    {systemChecking ? '检查中…' : '检查更新'}
                  </OpptrixButton>
                )}
                last={!showSystemStatusRow && !showSystemRollbackRow}
              />
            )}
            {showElectronUpdate && (
              <SettingsRow
                title="检查服务更新"
                desc={
                  serviceVersionDesc
                    ? `检查运行中的服务是否有可用热更新（${serviceVersionDesc}）`
                    : '检查运行中的服务是否有可用热更新'
                }
                control={(
                  <OpptrixButton
                    variant="secondary"
                    disabled={systemBusy}
                    icon={systemChecking ? <Spinner size="tiny" /> : undefined}
                    onClick={handleCheckSystemUpdate}
                  >
                    {systemChecking ? '检查中…' : '检查更新'}
                  </OpptrixButton>
                )}
                last={!showSystemStatusRow && !showSystemRollbackRow}
              />
            )}
            {showSystemStatusRow && systemPanel && (
              <div className={s.updateStatusBlock}>
                <Text className={s.updateTitle} block>{systemPanel.title}</Text>
                <div className={s.updatePanel}>
                  <Text className={s.updateDesc} block>{systemPanel.desc}</Text>
                  {systemPanel.showCli && (
                    <>
                      <Text className={s.cliCode} block>{systemCli}</Text>
                      <div className={s.updateActions}>
                        <OpptrixButton
                          className={s.actionBtn}
                          variant="primary"
                          size="small"
                          icon={<CopyRegular fontSize={14} />}
                          onClick={handleCopySystemCli}
                        >
                          {cliCopied ? '已复制' : '复制命令'}
                        </OpptrixButton>
                      </div>
                    </>
                  )}
                  {systemPanel.showProgress && (
                    <>
                      <ProgressBar
                        value={
                          systemPanel.percent != null && systemPanel.percent > 0
                            ? systemPanel.percent / 100
                            : undefined
                        }
                        max={1}
                        thickness="medium"
                        shape="rounded"
                      />
                      <Text className={s.progressMeta} block>
                        {systemPanel.percent != null && systemPanel.percent > 0
                          ? `已完成 ${Math.round(systemPanel.percent)}%`
                          : '正在准备新版本…'}
                      </Text>
                    </>
                  )}
                  {systemPanel.showApply && (
                    <div className={s.updateActions}>
                      <OpptrixButton
                        className={s.actionBtn}
                        variant="primary"
                        size="small"
                        disabled={systemApplying || systemRollingBack}
                        icon={systemApplying
                          ? <Spinner size="tiny" />
                          : <ArrowSyncRegular fontSize={14} />}
                        onClick={() => {
                          openSystemConfirm()
                          void applySystemNow()
                        }}
                      >
                        {systemApplying ? '正在准备新版本…' : systemPanel.applyLabel}
                      </OpptrixButton>
                    </div>
                  )}
                  {systemPanel.showRecheck && (
                    <div className={s.updateActions}>
                      <OpptrixButton
                        className={s.actionBtn}
                        variant="primary"
                        size="small"
                        disabled={systemBusy}
                        icon={systemChecking ? <Spinner size="tiny" /> : undefined}
                        onClick={handleCheckSystemUpdate}
                      >
                        {systemChecking ? '检查中…' : '重新检查'}
                      </OpptrixButton>
                    </div>
                  )}
                </div>
              </div>
            )}
            {showSystemRollbackRow && (
              <SettingsRow
                title="恢复上一版本"
                desc={
                  systemStatus.backupVersion
                    ? `可恢复到 v${systemStatus.backupVersion}。恢复期间暂时无法使用其他功能。`
                    : '可恢复到上一版本。恢复期间暂时无法使用其他功能。'
                }
                control={(
                  <OpptrixButton
                    variant="secondary"
                    disabled={systemBusy}
                    icon={systemRollingBack ? <Spinner size="tiny" /> : undefined}
                    onClick={() => { void handleRollbackSystem() }}
                  >
                    {systemRollingBack ? '正在恢复…' : '恢复上一版本'}
                  </OpptrixButton>
                )}
                last
              />
            )}
          </SettingsGroup>
          {isSystemUpdateBlocked(systemStatus) && embedded && (
            <Text className={s.emptyHint} block>
              若多次更新失败，可尝试切换到「离线更新」导入官方更新包，或联系维护者获取帮助。
            </Text>
          )}
        </div>
      )}
    </div>
  )
}
