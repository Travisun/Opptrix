import { createPortal } from 'react-dom'
import { useCallback, useState } from 'react'
import { ProgressBar, Spinner, Text, makeStyles } from '@fluentui/react-components'
import { CopyRegular } from '@fluentui/react-icons'
import { systemUpdateApplyProgress } from '../api/client'
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
  '当前运行环境无法安装此版本。请在服务器上执行下方命令。数据与已保存内容会保留。'
const DEFAULT_CLI = 'opptrix update'
const BLOCKED_COPY =
  '此版本未能完成更新，已恢复当前版本。将等待后续新版本，中间版本会自动跳过。'

const useStyles = makeStyles({
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 5000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    boxSizing: 'border-box',
    backgroundColor: opptrixCssVars.canvas,
  },
  panel: {
    width: '100%',
    maxWidth: '420px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: '14px',
  },
  kicker: {
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 600,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: opptrixCssVars.accent,
  },
  title: {
    fontSize: 'clamp(24px, 4vw, 32px)',
    fontWeight: 600,
    letterSpacing: '-0.03em',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.2,
  },
  lead: {
    fontSize: 'var(--opptrix-font-lg)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.65,
    maxWidth: '28em',
  },
  meta: {
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.5,
  },
  cli: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.textPrimary,
    backgroundColor: opptrixCssVars.surface,
    border: `1px solid ${opptrixCssVars.separator}`,
    borderRadius: opptrixTokens.radiusMd,
    padding: '10px 14px',
    width: '100%',
    boxSizing: 'border-box',
    textAlign: 'left',
    wordBreak: 'break-all',
  },
  progressWrap: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginTop: '8px',
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
    justifyContent: 'center',
    marginTop: '8px',
  },
  secondary: {
    minHeight: '36px',
  },
  primary: {
    minHeight: '36px',
    minWidth: '120px',
  },
  versionChip: {
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 500,
    color: opptrixCssVars.accent,
    letterSpacing: '0.02em',
  },
  notes: {
    width: '100%',
    textAlign: 'left',
    margin: 0,
    padding: '0 0 0 1.1em',
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.55,
  },
  spinnerWrap: {
    marginTop: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.error,
    lineHeight: 1.5,
  },
  card: {
    width: '100%',
    padding: '8px 0',
    borderRadius: opptrixTokens.radiusMd,
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
    closeConfirm,
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

  if (environmentWaiting && waitingForBaseRefresh) {
    title = '正在等待运行环境就绪…'
    lead = '服务器正在重建运行环境，请稍候。完成后你可以继续更新。'
    showSpinner = true
  } else if (blocked) {
    title = '此版本未能完成更新'
    lead = BLOCKED_COPY
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
    title = '需要更新运行环境'
    lead = status.baseRefreshHint?.trim() || DEFAULT_BASE_HINT
    showBaseRefresh = true
  } else if (status.readyToApply) {
    title = version ? `新版本 v${version} 已就绪` : '新版本已就绪'
    lead = '确认后即可开始更新。更新期间暂时无法使用其他功能。'
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

  const node = (
    <div
      className={s.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="system-update-wizard-title"
    >
      <div className={s.panel}>
        <Text className={s.kicker} block>Opptrix</Text>
        <Text id="system-update-wizard-title" className={s.title} block>
          {title}
        </Text>
        {version && status.uiPhase !== 'failed' && (
          <Text className={s.versionChip} block>
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
          <Text className={s.cli} block>{cli}</Text>
        )}
        {status.uiPhase === 'failed' && status.error?.trim() && (
          <Text className={s.error} block>{status.error}</Text>
        )}

        {(showProgress || showSpinner) && (
          <div className={s.card}>
            {showSpinner && (
              <div className={s.spinnerWrap}>
                <Spinner size="medium" label={progressMessage ?? '正在准备新版本…'} />
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
                <Text className={s.meta} block>
                  {progressMessage
                    ?? (progressSlice.percent != null && progressSlice.percent > 0
                      ? `已完成 ${Math.round(progressSlice.percent)}%`
                      : '正在准备新版本…')}
                </Text>
              </div>
            )}
          </div>
        )}

        {showBaseRefresh && (
          <div className={s.actions}>
            {!blocking && (
              <OpptrixButton
                className={s.secondary}
                variant="ghost"
                onClick={closeConfirm}
              >
                稍后
              </OpptrixButton>
            )}
            <OpptrixButton
              className={s.primary}
              variant="primary"
              icon={<CopyRegular fontSize={14} />}
              onClick={handleCopyCli}
            >
              {copied ? '已复制' : '复制命令'}
            </OpptrixButton>
          </div>
        )}

        {showConfirmActions && status.uiPhase !== 'failed' && !blocked && (
          <div className={s.actions}>
            {!blocking && (
              <OpptrixButton
                className={s.secondary}
                variant="ghost"
                onClick={closeConfirm}
                disabled={actionBusy}
              >
                稍后
              </OpptrixButton>
            )}
            <OpptrixButton
              className={s.primary}
              variant="primary"
              disabled={actionBusy}
              icon={applying ? <Spinner size="tiny" /> : undefined}
              onClick={() => { void applyNow() }}
            >
              {applying ? '正在准备新版本…' : '立即更新'}
            </OpptrixButton>
          </div>
        )}

        {status.uiPhase === 'failed' && (
          <div className={s.actions}>
            {canRollback && (
              <OpptrixButton
                className={s.secondary}
                variant="ghost"
                disabled={actionBusy}
                onClick={() => { void handleRollback() }}
              >
                {rollingBack ? '正在恢复…' : '恢复上一版本'}
              </OpptrixButton>
            )}
            <OpptrixButton
              className={s.primary}
              variant="primary"
              disabled={actionBusy}
              onClick={() => { void applyNow() }}
            >
              重试更新
            </OpptrixButton>
          </div>
        )}
      </div>
    </div>
  )

  return createPortal(node, document.body)
}
