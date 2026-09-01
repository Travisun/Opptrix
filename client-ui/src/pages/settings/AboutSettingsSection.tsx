import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ProgressBar, Spinner, Switch, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import {
  ArrowDownloadRegular,
  ArrowSyncRegular,
  ArrowUploadRegular,
  ChatHelpRegular,
  CodeRegular,
  CopyRegular,
  DocumentTextRegular,
  GlobeRegular,
  LockClosedRegular,
  ShieldErrorRegular,
  WarningRegular,
} from '@fluentui/react-icons'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import { useOpptrixDialogAlert } from '../../components/opptrix/OpptrixDialogAlert'
import { getHealth, getUserPreference, setUserPreference } from '../../api/client'
import { useAppUpdate } from '../../hooks/useAppUpdate'
import { isSystemUpdateBlocked, useSystemUpdate } from '../../hooks/useSystemUpdate'
import { isElectron, type NotificationPermissionState } from '../../platform/detect'
import { copyTextToClipboard } from '../../platform/clipboard'
import { openExternalUrl } from '../../platform/openUrl'
import { opptrixCssVars } from '../../theme/tokens'
import {
  buildAppUpdatePanel,
  isAppUpdateCheckBusy,
} from '../../utils/appUpdateUi'
import {
  OPPTRIX_COMMUNITY,
  OPPTRIX_COMMUNITY_INVITE_CODE,
  OPPTRIX_DISCLAIMER,
  OPPTRIX_GITHUB_HOME,
  OPPTRIX_GITHUB_ISSUES,
  OPPTRIX_PRIVACY_POLICY,
  OPPTRIX_SECURITY_POLICY,
  OPPTRIX_USER_AGREEMENT,
  OPPTRIX_WEBSITE,
  formatAboutCopyrightLine,
} from './aboutLinks'
import {
  SettingsExternalLinkRow,
  SettingsGroup,
  SettingsRow,
} from './SettingsPrimitives'

/** 与 packages/shared chat-debug-settings 对齐；client-ui 不从 shared 主入口导入 */
const CHAT_DEBUG_LOGGING_KEY = 'chat_debug_logging'

function parseChatDebugEnabled(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return (value as { enabled?: unknown }).enabled === true
}

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  rootFlush: {
    gap: '16px',
  },
  prose: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    maxWidth: '52ch',
    paddingTop: '4px',
  },
  proseFlush: {
    maxWidth: 'none',
  },
  lead: {
    fontSize: 'var(--opptrix-font-lg)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.65,
  },
  note: {
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.6,
  },
  sectionBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  sectionLabel: {
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 400,
    color: opptrixCssVars.textSecondary,
    lineHeight: '16px',
    paddingLeft: '2px',
  },
  license: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.55,
    paddingLeft: '2px',
    marginTop: '4px',
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
  restartBtn: {
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
  notifyActions: {
    display: 'flex',
    gap: '8px',
    flexShrink: 0,
  },
  linkIcon: {
    fontSize: '18px',
    width: '18px',
    height: '18px',
  },
  importFileMeta: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.45,
    wordBreak: 'break-all',
  },
  importActions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    justifyContent: 'flex-end',
    flexShrink: 0,
  },
})

type AboutSettingsSectionProps = {
  contentFlush?: boolean
}

export default function AboutSettingsSection({ contentFlush = false }: AboutSettingsSectionProps) {
  const s = useStyles()
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
    importNow: importSystemNow,
    openConfirm: openSystemConfirm,
    checking: systemChecking,
    applying: systemApplying,
    rollingBack: systemRollingBack,
    importing: systemImporting,
    waitingForBaseRefresh: systemWaitingBase,
    environmentWaiting: systemEnvironmentWaiting,
  } = useSystemUpdate()
  const { confirm: confirmDialog } = useOpptrixDialogAlert()
  const packageInputRef = useRef<HTMLInputElement>(null)
  const shaInputRef = useRef<HTMLInputElement>(null)
  const [importPackageFile, setImportPackageFile] = useState<File | null>(null)
  const [importShaFile, setImportShaFile] = useState<File | null>(null)
  const [versionLabel, setVersionLabel] = useState<string | null>(null)
  const [checkedOnce, setCheckedOnce] = useState(false)
  const [systemCheckedOnce, setSystemCheckedOnce] = useState(false)
  const [notifyPermission, setNotifyPermission] = useState<NotificationPermissionState | null>(null)
  const [chatDebugEnabled, setChatDebugEnabled] = useState(false)
  const [chatDebugLoading, setChatDebugLoading] = useState(true)
  const [cliCopied, setCliCopied] = useState(false)

  useEffect(() => {
    if (isElectron()) {
      void window.electronAPI?.clientVersion?.().then(version => {
        setVersionLabel(version ? `v${version}` : null)
      })
      void window.electronAPI?.notificationGetPermission?.()
        .then(perm => setNotifyPermission(perm))
        .catch(() => setNotifyPermission(null))
      return
    }
    void getHealth()
      .then(health => setVersionLabel(health.version ? `v${health.version}` : null))
      .catch(() => setVersionLabel(null))
  }, [])

  useEffect(() => {
    let cancelled = false
    void getUserPreference<{ enabled?: boolean }>(CHAT_DEBUG_LOGGING_KEY)
      .then(resp => {
        if (!cancelled) setChatDebugEnabled(parseChatDebugEnabled(resp.value))
      })
      .catch(() => {
        if (!cancelled) setChatDebugEnabled(false)
      })
      .finally(() => {
        if (!cancelled) setChatDebugLoading(false)
      })
    return () => { cancelled = true }
  }, [])

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

  const handleOpenNotificationSettings = useCallback(() => {
    void window.electronAPI?.notificationOpenSettings?.()
  }, [])

  const handleRefreshNotificationPermission = useCallback(() => {
    void window.electronAPI?.notificationRequestPermission?.()
      .then(perm => setNotifyPermission(perm))
      .catch(() => {})
  }, [])

  const handleChatDebugChange = useCallback((_: unknown, data: { checked: boolean | 'mixed' }) => {
    const next = Boolean(data.checked)
    setChatDebugEnabled(next)
    void setUserPreference(CHAT_DEBUG_LOGGING_KEY, { enabled: next }).catch(() => {
      setChatDebugEnabled(!next)
    })
  }, [])

  const handleOpenChatDebugDir = useCallback(() => {
    void window.electronAPI?.chatDebugOpenLogDir?.().catch(() => {})
  }, [])

  const versionDesc = versionLabel ?? '读取版本中…'
  const showElectronUpdate = isElectron()
  const showSystemUpdate = systemUpdateActive && systemStatus.enabled
  const checkBusy = isAppUpdateCheckBusy(updateStatus)
  const updatePanel = buildAppUpdatePanel(updateStatus, { checkedOnce, autoDownload })
  const showUpdateStatusRow = Boolean(updatePanel?.visible)
  const systemBusy = systemChecking || systemApplying || systemRollingBack || systemImporting
  const systemCli = systemStatus.cliCommand?.trim() || 'opptrix update'
  const handleCopySystemCli = useCallback(() => {
    void copyTextToClipboard(systemCli).then((ok) => {
      if (!ok) return
      setCliCopied(true)
      window.setTimeout(() => setCliCopied(false), 1600)
    })
  }, [systemCli])
  const systemPanel = (() => {
    if (!showSystemUpdate) return null
    if (systemEnvironmentWaiting && systemWaitingBase) {
      return {
        title: '正在等待运行环境就绪…',
        desc: '服务器正在重建运行环境，请稍候。完成后你可以继续更新。',
        showApply: false,
        applyLabel: '',
        showRecheck: false,
        showProgress: false,
        showCli: false,
        percent: undefined as number | undefined,
      }
    }
    if (isSystemUpdateBlocked(systemStatus)) {
      return {
        title: '此版本未能完成更新',
        desc: '此版本未能完成更新，已恢复当前版本。将等待后续新版本，中间版本会自动跳过。',
        showApply: false,
        applyLabel: '',
        showRecheck: false,
        showProgress: false,
        showCli: false,
        percent: undefined as number | undefined,
      }
    }
    if (systemStatus.uiPhase === 'failed') {
      return {
        title: '更新未能完成',
        desc: systemStatus.error?.trim() || '这次更新没有顺利完成。你可以稍后重试。',
        showApply: true,
        applyLabel: '重试更新',
        showRecheck: false,
        showProgress: false,
        showCli: false,
        percent: undefined as number | undefined,
      }
    }
    if (systemStatus.needsBaseRefresh) {
      return {
        title: '需要更新运行环境',
        desc: systemStatus.baseRefreshHint?.trim()
          || '当前运行环境无法安装此版本。请在服务器上执行下方命令。数据与已保存内容会保留。',
        showApply: false,
        applyLabel: '',
        showRecheck: false,
        showProgress: false,
        showCli: true,
        percent: undefined as number | undefined,
      }
    }
    if (systemStatus.readyToApply) {
      return {
        title: systemStatus.availableVersion
          ? `新版本 v${systemStatus.availableVersion} 已就绪`
          : '新版本已就绪',
        desc: '确认后即可开始更新。更新期间暂时无法使用其他功能。',
        showApply: true,
        applyLabel: '立即更新',
        showRecheck: false,
        showProgress: false,
        showCli: false,
        percent: undefined as number | undefined,
      }
    }
    const dl = systemStatus.download
    if (dl && (dl.status === 'running' || dl.status === 'queued')) {
      const percent = (() => {
        if (dl.bytesTotal == null || dl.bytesTotal <= 0) return undefined
        return Math.min(100, Math.round((dl.bytesReceived / dl.bytesTotal) * 100))
      })()
      return {
        title: systemStatus.availableVersion
          ? `正在准备 v${systemStatus.availableVersion}`
          : '正在准备新版本',
        desc: '新版本正在后台准备，完成后会提醒你。',
        showApply: false,
        applyLabel: '',
        showRecheck: false,
        showProgress: true,
        showCli: false,
        percent,
      }
    }
    if (dl && dl.status === 'failed') {
      return {
        title: '新版本准备失败',
        desc: dl.error?.trim()
          || systemStatus.error?.trim()
          || '暂时无法准备新版本。请确认网络后重新检查。',
        showApply: false,
        applyLabel: '',
        showRecheck: true,
        showProgress: false,
        showCli: false,
        percent: undefined as number | undefined,
      }
    }
    if (systemCheckedOnce) {
      return {
        title: '当前已是最新版本',
        desc: '暂无可用更新。你可以稍后再检查。',
        showApply: false,
        applyLabel: '',
        showRecheck: false,
        showProgress: false,
        showCli: false,
        percent: undefined as number | undefined,
      }
    }
    return null
  })()
  const showSystemStatusRow = Boolean(systemPanel)
  const showSystemRollbackRow = Boolean(
    showSystemUpdate
    && systemStatus.uiPhase === 'normal'
    && systemStatus.backupVersion,
  )
  const showSystemImportRow = showSystemUpdate

  const handleImportPackagePick = useCallback((file: File | null) => {
    setImportPackageFile(file)
  }, [])

  const handleImportShaPick = useCallback((file: File | null) => {
    setImportShaFile(file)
  }, [])

  const handleImportSystemUpdate = useCallback(async () => {
    if (!importPackageFile || !importShaFile) {
      await confirmDialog({
        title: '请选择文件',
        message: '需同时选择更新包（.bin 或 .tar.gz）与校验文件（.sha256）。',
        confirmLabel: '知道了',
      })
      return
    }
    setSystemCheckedOnce(true)
    const ok = await importSystemNow(importPackageFile, importShaFile)
    if (ok) {
      setImportPackageFile(null)
      setImportShaFile(null)
      if (packageInputRef.current) packageInputRef.current.value = ''
      if (shaInputRef.current) shaInputRef.current.value = ''
      return
    }
    await confirmDialog({
      title: '无法导入更新包',
      message: '请确认文件完整、版本匹配，且与官方更新通道格式一致后重试。',
      confirmLabel: '知道了',
    })
  }, [
    confirmDialog,
    importPackageFile,
    importShaFile,
    importSystemNow,
  ])
  const copyrightLine = useMemo(
    () => formatAboutCopyrightLine(typeof navigator !== 'undefined' ? navigator.language : undefined),
    [],
  )

  const notifyPermissionDesc = (() => {
    switch (notifyPermission) {
      case 'granted':
        return '已开启。对话完成或需要你确认时，会在你离开窗口时提醒你。'
      case 'denied':
        return '系统未允许通知。请在系统设置中开启，以免错过对话完成提醒。'
      case 'default':
        return '尚未确认。完成对话后若未收到提醒，请到系统设置中允许 Opptrix 发送通知。'
      default:
        return '正在读取通知状态…'
    }
  })()

  return (
    <div className={mergeClasses(s.root, contentFlush && s.rootFlush)}>
      <div className={mergeClasses(s.prose, contentFlush && s.proseFlush)}>
        <Text className={s.lead} block>
          Opptrix 是一款面向个人投资者的投研助手。用日常中文提问，即可查看行情、阅读新闻与研报摘要，并把结果整理成易读的说明。支持 A 股、港股、美股等主要市场。
        </Text>
        <Text className={s.note} block>
          本软件仅供学习与研究参考，不构成投资建议，也不能代替券商下单或自动交易。请自行核实信息并独立做出投资决策。
        </Text>
        <Text className={s.note} block>
          你的对话、关注列表和数据密钥等默认保存在本机，由你自行管理；使用哪家大模型、哪些数据源，可在设置中调整。
        </Text>
      </div>

      <div className={s.sectionBlock}>
        <Text className={s.sectionLabel} block>版本信息</Text>
        <SettingsGroup>
          <SettingsRow
            title="当前版本"
            desc={versionDesc}
            control={(showElectronUpdate || showSystemUpdate) ? (
              <OpptrixButton
                variant="secondary"
                disabled={showElectronUpdate ? checkBusy : systemBusy}
                icon={(showElectronUpdate ? checkBusy : systemBusy)
                  ? <Spinner size="tiny" />
                  : undefined}
                onClick={showElectronUpdate ? handleCheckUpdate : handleCheckSystemUpdate}
              >
                {(showElectronUpdate ? checkBusy : systemChecking) ? '检查中…' : '检查更新'}
              </OpptrixButton>
            ) : undefined}
            last={!showElectronUpdate && !showSystemStatusRow && !showSystemRollbackRow && !showSystemImportRow}
          />
          {showElectronUpdate && (
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
          )}
          {showElectronUpdate && showUpdateStatusRow && updatePanel && (
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
                      className={s.restartBtn}
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
                      className={s.restartBtn}
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
          {showSystemUpdate && showSystemStatusRow && systemPanel && (
            <div className={s.updateStatusBlock}>
              <Text className={s.updateTitle} block>{systemPanel.title}</Text>
              <div className={s.updatePanel}>
                <Text className={s.updateDesc} block>{systemPanel.desc}</Text>
                {systemPanel.showCli && (
                  <>
                    <Text className={s.cliCode} block>{systemCli}</Text>
                    <div className={s.updateActions}>
                      <OpptrixButton
                        className={s.restartBtn}
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
                      className={s.restartBtn}
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
                      className={s.restartBtn}
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
              last={!showSystemImportRow}
            />
          )}
          {showSystemImportRow && (
            <>
              <input
                ref={packageInputRef}
                type="file"
                accept=".bin,.tar.gz,application/gzip,application/octet-stream"
                hidden
                onChange={e => { handleImportPackagePick(e.target.files?.[0] ?? null) }}
              />
              <input
                ref={shaInputRef}
                type="file"
                accept=".sha256,text/plain"
                hidden
                onChange={e => { handleImportShaPick(e.target.files?.[0] ?? null) }}
              />
              <SettingsRow
                title="从本地导入更新包"
                desc="需同时选择更新包与校验文件；无网络也可导入，校验规则与官方更新通道一致。"
                control={(
                  <div className={s.importActions}>
                    <OpptrixButton
                      variant="secondary"
                      size="small"
                      disabled={systemBusy}
                      onClick={() => packageInputRef.current?.click()}
                    >
                      {importPackageFile ? '重选更新包' : '选择更新包'}
                    </OpptrixButton>
                    <OpptrixButton
                      variant="secondary"
                      size="small"
                      disabled={systemBusy}
                      onClick={() => shaInputRef.current?.click()}
                    >
                      {importShaFile ? '重选校验文件' : '选择校验文件'}
                    </OpptrixButton>
                    <OpptrixButton
                      variant="primary"
                      size="small"
                      disabled={systemBusy || !importPackageFile || !importShaFile}
                      icon={systemImporting
                        ? <Spinner size="tiny" />
                        : <ArrowUploadRegular fontSize={14} />}
                      onClick={() => { void handleImportSystemUpdate() }}
                    >
                      {systemImporting ? '正在导入…' : '导入'}
                    </OpptrixButton>
                  </div>
                )}
                last={!importPackageFile && !importShaFile}
              />
              {(importPackageFile || importShaFile) && (
                <div className={s.updateStatusBlock}>
                  {importPackageFile && (
                    <Text className={s.importFileMeta} block>
                      更新包：{importPackageFile.name}
                    </Text>
                  )}
                  {importShaFile && (
                    <Text className={s.importFileMeta} block>
                      校验文件：{importShaFile.name}
                    </Text>
                  )}
                </div>
              )}
            </>
          )}
        </SettingsGroup>
      </div>

      {showElectronUpdate && (
        <div className={s.sectionBlock}>
          <Text className={s.sectionLabel} block>桌面通知</Text>
          <SettingsGroup>
            <SettingsRow
              title="系统通知"
              desc={notifyPermissionDesc}
              control={(
                <div className={s.notifyActions}>
                  {notifyPermission === 'denied' || notifyPermission === 'default' ? (
                    <OpptrixButton variant="secondary" onClick={handleOpenNotificationSettings}>
                      打开系统设置
                    </OpptrixButton>
                  ) : (
                    <OpptrixButton variant="secondary" onClick={handleRefreshNotificationPermission}>
                      刷新状态
                    </OpptrixButton>
                  )}
                </div>
              )}
              last
            />
          </SettingsGroup>
        </div>
      )}

      <div className={s.sectionBlock}>
        <Text className={s.sectionLabel} block>对话调试日志</Text>
        <SettingsGroup>
          <SettingsRow
            title="对话调试日志"
            desc="开启后，将把对话过程写入本机日志，便于排查无回复或中断；默认关闭"
            control={(
              <Switch
                checked={chatDebugEnabled}
                disabled={chatDebugLoading}
                onChange={handleChatDebugChange}
                aria-label="对话调试日志"
              />
            )}
            last={!isElectron()}
          />
          {isElectron() ? (
            <SettingsRow
              title="日志文件夹"
              desc="在系统文件管理器中打开本机日志目录"
              control={(
                <OpptrixButton variant="secondary" onClick={handleOpenChatDebugDir}>
                  打开日志文件夹
                </OpptrixButton>
              )}
              last
            />
          ) : null}
        </SettingsGroup>
      </div>

      <div className={s.sectionBlock}>
        <Text className={s.sectionLabel} block>法律与官网</Text>
        <SettingsGroup>
          <SettingsExternalLinkRow
            title="投研交流社区"
            desc={`与同好讨论策略与方法 · 邀请码 ${OPPTRIX_COMMUNITY_INVITE_CODE}`}
            icon={<GlobeRegular className={s.linkIcon} />}
            onClick={() => openExternalUrl(OPPTRIX_COMMUNITY)}
          />
          <SettingsExternalLinkRow
            title="官方网站"
            desc="产品动态与使用指南"
            icon={<GlobeRegular className={s.linkIcon} />}
            onClick={() => openExternalUrl(OPPTRIX_WEBSITE)}
          />
          <SettingsExternalLinkRow
            title="用户协议"
            desc="使用前请阅读相关条款"
            icon={<DocumentTextRegular className={s.linkIcon} />}
            onClick={() => openExternalUrl(OPPTRIX_USER_AGREEMENT)}
          />
          <SettingsExternalLinkRow
            title="隐私政策"
            desc="我们如何保护你的信息"
            icon={<LockClosedRegular className={s.linkIcon} />}
            onClick={() => openExternalUrl(OPPTRIX_PRIVACY_POLICY)}
          />
          <SettingsExternalLinkRow
            title="免责声明"
            desc="投资风险与内容局限说明"
            icon={<WarningRegular className={s.linkIcon} />}
            onClick={() => openExternalUrl(OPPTRIX_DISCLAIMER)}
            last
          />
        </SettingsGroup>
      </div>

      <div className={s.sectionBlock}>
        <Text className={s.sectionLabel} block>项目与支持</Text>
        <SettingsGroup>
          <SettingsExternalLinkRow
            title="项目主页"
            desc="介绍、文档与源代码"
            icon={<CodeRegular className={s.linkIcon} />}
            onClick={() => openExternalUrl(OPPTRIX_GITHUB_HOME)}
          />
          <SettingsExternalLinkRow
            title="反馈与建议"
            desc="遇到问题或希望新增功能时留言"
            icon={<ChatHelpRegular className={s.linkIcon} />}
            onClick={() => openExternalUrl(OPPTRIX_GITHUB_ISSUES)}
          />
          <SettingsExternalLinkRow
            title="安全漏洞"
            desc="请私下报告，勿在公开渠道披露细节"
            icon={<ShieldErrorRegular className={s.linkIcon} />}
            onClick={() => openExternalUrl(OPPTRIX_SECURITY_POLICY)}
            last
          />
        </SettingsGroup>
      </div>

      <Text className={s.license} block>
        {copyrightLine}
      </Text>
    </div>
  )
}
