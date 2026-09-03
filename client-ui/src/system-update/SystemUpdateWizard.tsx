import { useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  ProgressBar,
  Spinner,
  Text,
  makeStyles,
  mergeClasses,
} from '@fluentui/react-components'
import { CopyRegular } from '@fluentui/react-icons'
import {
  systemUpdateApplyProgress,
} from '../api/client'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import { useOpptrixDialogAlert } from '../components/opptrix/OpptrixDialogAlert'
import {
  isSystemUpdateBlocked,
  isSystemUpdateBlocking,
  useSystemUpdate,
} from '../hooks/useSystemUpdate'
import { copyTextToClipboard } from '../platform/clipboard'
import { opptrixCssVars, opptrixTokens } from '../theme/tokens'

const DEFAULT_BASE_HINT =
  '当前环境无法直接安装此版本。请在服务器执行下方命令，完成后再回来继续。对话与数据会保留。'
const DEFAULT_CLI = 'opptrix update'
const BLOCKED_COPY =
  '此版本未能完成更新，已恢复当前版本。将等待后续新版本，中间版本会自动跳过。'

const useStyles = makeStyles({
  surface: {
    width: 'min(400px, calc(100vw - 32px))',
    maxWidth: '400px',
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  lead: {
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.55,
  },
  version: {
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 500,
    color: opptrixCssVars.textTertiary,
    letterSpacing: '0.01em',
  },
  notes: {
    margin: 0,
    padding: '0 0 0 1.1em',
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.55,
  },
  cliRow: {
    display: 'flex',
    alignItems: 'stretch',
    gap: '8px',
    width: '100%',
  },
  cli: {
    flex: 1,
    minWidth: 0,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textPrimary,
    backgroundColor: opptrixCssVars.canvas,
    border: `1px solid ${opptrixCssVars.separator}`,
    borderRadius: opptrixTokens.radiusSm,
    padding: '8px 10px',
    wordBreak: 'break-all',
    lineHeight: 1.4,
    boxSizing: 'border-box',
  },
  copyBtn: {
    flexShrink: 0,
    minHeight: 'auto',
    alignSelf: 'stretch',
    padding: '0 12px',
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 600,
  },
  progressWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    paddingTop: '2px',
  },
  progressMeta: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.45,
  },
  spinnerWrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px 0 4px',
  },
  error: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.error,
    lineHeight: 1.5,
  },
  actions: {
    justifyContent: 'flex-end',
    gap: '6px',
    marginTop: '2px',
  },
  actionBtn: {
    minHeight: '28px',
    height: '28px',
    padding: '0 12px',
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 600,
  },
})

function resolveProgress(percent: number | undefined): number | undefined {
  if (percent == null || percent <= 0) return undefined
  return Math.min(1, Math.max(0, percent / 100))
}

export default function SystemUpdateWizard() {
  const s = useStyles()
  const {
    active,
    status,
    confirmOpen,
    dismissUpdatePrompt,
    beginAwaitingBaseRefresh,
    applyNow,
    rollbackNow,
    reconnecting,
    waitingForBaseRefresh,
    environmentWaiting,
    applying,
    rollingBack,
  } = useSystemUpdate()
  const { confirm } = useOpptrixDialogAlert()
  const [copied, setCopied] = useState(false)

  const needsBase = Boolean(status.needsBaseRefresh)
  const blocked = isSystemUpdateBlocked(status)
  const cli = status.cliCommand?.trim() || DEFAULT_CLI

  const handleCopyCli = useCallback(() => {
    void copyTextToClipboard(cli).then((ok) => {
      if (!ok) return
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    })
  }, [cli])

  if (!active || !status.enabled) return null

  const blocking = isSystemUpdateBlocking(status) || reconnecting
  const showOverlay = blocked || confirmOpen || blocking || waitingForBaseRefresh
  if (!showOverlay) return null

  const version = status.availableVersion ?? status.currentVersion
  const progressSlice = systemUpdateApplyProgress(status)
  const progressValue = resolveProgress(progressSlice.percent)
  const progressMessage = progressSlice.message
  const canRollback = Boolean(status.backupVersion)
  const actionBusy = applying || rollingBack
  const releaseNotes = status.availableDescription
  const noteItems = [
    ...(releaseNotes?.features ?? []),
    ...(releaseNotes?.fixes ?? []),
  ].slice(0, 5)

  let title = '发现新版本'
  let lead = '新版本已准备就绪。确认后即可完成更新，你的对话与本地数据会保留。'
  let showConfirmActions = false
  let showBaseRefresh = false
  let showProgress = false
  let showSpinner = false
  let showBlockedOnly = false

  if (environmentWaiting && waitingForBaseRefresh) {
    title = '正在等待服务恢复…'
    lead = '服务器正在重建环境，请稍候。完成后你可以继续更新。'
    showSpinner = true
  } else if (waitingForBaseRefresh) {
    title = '正在等待环境就绪…'
    lead = '请稍候。完成后你可以继续更新。'
    showSpinner = true
  } else if (blocked) {
    title = '此版本未能完成更新'
    lead = BLOCKED_COPY
    showBlockedOnly = true
  } else if (reconnecting || status.uiPhase === 'wizard_apply') {
    title = '正在更新…'
    lead = '正在准备新版本，请稍候。请勿关闭或刷新此页面。'
    showProgress = true
    showSpinner = progressValue == null
  } else if (status.uiPhase === 'first_boot_hooks') {
    title = '正在完成更新…'
    lead = '正在完成最后几步准备工作，很快就能继续使用。'
    showProgress = true
    showSpinner = progressValue == null
  } else if (status.uiPhase === 'failed') {
    title = '更新未能完成'
    lead = status.error?.trim()
      || '这次更新没有顺利完成。你可以稍后重试，或继续使用当前版本。'
    showConfirmActions = true
  } else if (needsBase) {
    title = '需要先更新环境'
    lead = status.baseRefreshHint?.trim() || DEFAULT_BASE_HINT
    showBaseRefresh = true
  } else if (status.readyToApply) {
    title = version ? `新版本 v${version} 已就绪` : '新版本已就绪'
    lead = '确认后即可开始更新。更新期间暂时无法使用其他功能，对话与数据会保留。'
    showConfirmActions = true
  } else {
    title = '正在准备新版本…'
    lead = '正在检查并准备更新，请稍候。'
    showSpinner = true
  }

  const handleRollback = async () => {
    const backup = status.backupVersion
    const ok = await confirm({
      title: '恢复上一版本？',
      message: backup
        ? `将恢复到 v${backup}。恢复期间暂时无法使用其他功能，你的对话与本地数据会保留。`
        : '将恢复到上一版本。恢复期间暂时无法使用其他功能，你的对话与本地数据会保留。',
      confirmLabel: '恢复上一版本',
      cancelLabel: '取消',
      confirmTone: 'danger',
    })
    if (!ok) return
    void rollbackNow()
  }

  const canDismiss = !blocking && !waitingForBaseRefresh && !showBlockedOnly
  const showVersionLine = Boolean(
    version
    && status.uiPhase !== 'failed'
    && !showBlockedOnly
    && !showSpinner
    && !(environmentWaiting && waitingForBaseRefresh),
  )

  const node = (
    <Dialog
      open
      modalType={canDismiss ? 'modal' : 'alert'}
      onOpenChange={(_, data) => {
        if (!data.open && canDismiss) dismissUpdatePrompt()
      }}
    >
      <DialogSurface
        className={mergeClasses(
          'opptrix-glass-dialog-surface',
          'opptrix-dialog-alert-surface',
          s.surface,
        )}
      >
        <DialogBody className={mergeClasses('opptrix-dialog-alert-body', s.body)}>
          <DialogTitle className="opptrix-dialog-alert-title">{title}</DialogTitle>
          <DialogContent className={mergeClasses('opptrix-dialog-alert-content', s.body)}>
            {showVersionLine && (
              <Text className={s.version} block>
                {status.currentVersion && status.availableVersion
                  ? `v${status.currentVersion} → v${status.availableVersion}`
                  : `v${version}`}
              </Text>
            )}
            <Text className={s.lead} block>{lead}</Text>
            {noteItems.length > 0 && status.readyToApply && !needsBase && !blocked && (
              <ul className={s.notes}>
                {noteItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
            {showBaseRefresh && (
              <div className={s.cliRow}>
                <Text className={s.cli} block>{cli}</Text>
                <OpptrixButton
                  className={mergeClasses(s.copyBtn, 'opptrix-focusable')}
                  variant="secondary"
                  size="small"
                  icon={<CopyRegular fontSize={13} />}
                  onClick={handleCopyCli}
                >
                  {copied ? '已复制' : '复制'}
                </OpptrixButton>
              </div>
            )}
            {status.uiPhase === 'failed' && status.error?.trim() && lead !== status.error.trim() && (
              <Text className={s.error} block>{status.error}</Text>
            )}
            {(showProgress || showSpinner) && (
              <>
                {showSpinner && (
                  <div className={s.spinnerWrap}>
                    <Spinner size="medium" label={progressMessage ?? '请稍候…'} />
                  </div>
                )}
                {showProgress && !showSpinner && (
                  <div className={s.progressWrap}>
                    <ProgressBar
                      value={progressValue}
                      max={1}
                      thickness="medium"
                      shape="rounded"
                    />
                    <Text className={s.progressMeta} block>
                      {progressMessage
                        ?? (progressSlice.percent != null && progressSlice.percent > 0
                          ? `已完成 ${Math.round(progressSlice.percent)}%`
                          : '正在准备新版本…')}
                    </Text>
                  </div>
                )}
              </>
            )}
          </DialogContent>

          {showBaseRefresh && (
            <DialogActions className={mergeClasses('opptrix-dialog-alert-actions', s.actions)}>
              <OpptrixButton
                className={s.actionBtn}
                variant="ghost"
                onClick={dismissUpdatePrompt}
              >
                稍后
              </OpptrixButton>
              <OpptrixButton
                className={s.actionBtn}
                variant="primary"
                onClick={beginAwaitingBaseRefresh}
              >
                我已执行命令
              </OpptrixButton>
            </DialogActions>
          )}

          {showConfirmActions && status.uiPhase !== 'failed' && !blocked && (
            <DialogActions className={mergeClasses('opptrix-dialog-alert-actions', s.actions)}>
              {!blocking && (
                <OpptrixButton
                  className={s.actionBtn}
                  variant="ghost"
                  onClick={dismissUpdatePrompt}
                  disabled={actionBusy}
                >
                  稍后
                </OpptrixButton>
              )}
              <OpptrixButton
                className={s.actionBtn}
                variant="primary"
                disabled={actionBusy}
                icon={applying ? <Spinner size="tiny" /> : undefined}
                onClick={() => { void applyNow() }}
              >
                {applying ? '正在准备…' : '立即更新'}
              </OpptrixButton>
            </DialogActions>
          )}

          {status.uiPhase === 'failed' && (
            <DialogActions className={mergeClasses('opptrix-dialog-alert-actions', s.actions)}>
              {canRollback && (
                <OpptrixButton
                  className={s.actionBtn}
                  variant="ghost"
                  disabled={actionBusy}
                  onClick={() => { void handleRollback() }}
                >
                  {rollingBack ? '正在恢复…' : '恢复上一版本'}
                </OpptrixButton>
              )}
              <OpptrixButton
                className={s.actionBtn}
                variant="primary"
                disabled={actionBusy}
                onClick={() => { void applyNow() }}
              >
                重试更新
              </OpptrixButton>
            </DialogActions>
          )}

          {showBlockedOnly && (
            <DialogActions className={mergeClasses('opptrix-dialog-alert-actions', s.actions)}>
              <OpptrixButton
                className={s.actionBtn}
                variant="primary"
                onClick={dismissUpdatePrompt}
              >
                知道了
              </OpptrixButton>
            </DialogActions>
          )}
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )

  return createPortal(node, document.body)
}
