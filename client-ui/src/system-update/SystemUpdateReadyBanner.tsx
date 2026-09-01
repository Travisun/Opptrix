import { useCallback, useState } from 'react'
import { Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { ArrowSyncRegular, CopyRegular, DismissRegular } from '@fluentui/react-icons'
import OpptrixButton from '../components/opptrix/OpptrixButton'
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
  wrap: {
    position: 'fixed',
    top: '16px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 4200,
    width: 'min(520px, calc(100vw - 32px))',
    pointerEvents: 'none',
  },
  card: {
    pointerEvents: 'auto',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    padding: '12px 14px',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: opptrixCssVars.surface,
    border: `1px solid ${opptrixCssVars.separator}`,
    boxShadow: '0 8px 28px rgba(0, 0, 0, 0.08)',
  },
  body: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  title: {
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.35,
  },
  meta: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.45,
  },
  cli: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textPrimary,
    backgroundColor: opptrixCssVars.canvas,
    border: `1px solid ${opptrixCssVars.separator}`,
    borderRadius: opptrixTokens.radiusSm,
    padding: '6px 8px',
    marginTop: '4px',
    wordBreak: 'break-all',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    flexShrink: 0,
    paddingTop: '1px',
  },
  cta: {
    minHeight: '28px',
    height: '28px',
    padding: '0 10px',
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 600,
  },
  dismiss: {
    minWidth: '28px',
    width: '28px',
    height: '28px',
    padding: 0,
  },
})

type SystemUpdateReadyBannerProps = {
  dismissed: boolean
  onDismiss: () => void
}

export default function SystemUpdateReadyBanner({
  dismissed,
  onDismiss,
}: SystemUpdateReadyBannerProps) {
  const s = useStyles()
  const { active, status, openConfirm, waitingForBaseRefresh, environmentWaiting } = useSystemUpdate()
  const [copied, setCopied] = useState(false)

  const blocked = isSystemUpdateBlocked(status)
  const needsBase = Boolean(status.needsBaseRefresh)
  const showReady = Boolean(status.readyToApply)
  const cli = status.cliCommand?.trim() || DEFAULT_CLI

  const handleCopy = useCallback(() => {
    void copyTextToClipboard(cli).then((ok) => {
      if (!ok) return
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    })
  }, [cli])

  if (!active || !status.enabled) return null
  if (isSystemUpdateBlocking(status)) return null
  if (status.uiPhase !== 'normal') return null
  if (environmentWaiting && waitingForBaseRefresh) {
    return (
      <div className={s.wrap} role="status" aria-live="polite">
        <div className={s.card}>
          <div className={s.body}>
            <Text className={s.title} block>正在等待运行环境就绪…</Text>
            <Text className={s.meta} block>
              服务器正在重建运行环境，请稍候。完成后你可以继续更新。
            </Text>
          </div>
        </div>
      </div>
    )
  }
  if (blocked) {
    return (
      <div className={s.wrap} role="status" aria-live="polite">
        <div className={s.card}>
          <div className={s.body}>
            <Text className={s.title} block>此版本未能完成更新</Text>
            <Text className={s.meta} block>{BLOCKED_COPY}</Text>
          </div>
          <div className={s.actions}>
            <OpptrixButton
              className={s.dismiss}
              variant="ghost"
              size="small"
              aria-label="暂时关闭提醒"
              title="暂时关闭提醒"
              icon={<DismissRegular fontSize={14} />}
              onClick={onDismiss}
            />
          </div>
        </div>
      </div>
    )
  }
  if (!needsBase && !showReady) return null
  if (dismissed) return null

  const version = status.availableVersion
  if (needsBase) {
    const title = '需要更新运行环境'
    const meta = status.baseRefreshHint?.trim() || DEFAULT_BASE_HINT
    return (
      <div className={s.wrap} role="status" aria-live="polite">
        <div className={s.card}>
          <div className={s.body}>
            <Text className={s.title} block>{title}</Text>
            <Text className={s.meta} block>{meta}</Text>
            <Text className={s.cli} block>{cli}</Text>
          </div>
          <div className={s.actions}>
            <OpptrixButton
              className={mergeClasses(s.cta, 'opptrix-focusable')}
              variant="primary"
              size="small"
              icon={<CopyRegular fontSize={13} />}
              onClick={handleCopy}
            >
              {copied ? '已复制' : '复制命令'}
            </OpptrixButton>
            <OpptrixButton
              className={mergeClasses(s.cta, 'opptrix-focusable')}
              variant="secondary"
              size="small"
              onClick={openConfirm}
            >
              查看说明
            </OpptrixButton>
            <OpptrixButton
              className={s.dismiss}
              variant="ghost"
              size="small"
              aria-label="暂时关闭提醒"
              title="暂时关闭提醒"
              icon={<DismissRegular fontSize={14} />}
              onClick={onDismiss}
            />
          </div>
        </div>
      </div>
    )
  }

  const title = version ? `新版本 v${version} 已就绪` : '新版本已就绪'
  const meta = '可以开始更新。更新期间暂时无法使用其他功能。'

  return (
    <div className={s.wrap} role="status" aria-live="polite">
      <div className={s.card}>
        <div className={s.body}>
          <Text className={s.title} block>{title}</Text>
          <Text className={s.meta} block>{meta}</Text>
        </div>
        <div className={s.actions}>
          <OpptrixButton
            className={mergeClasses(s.cta, 'opptrix-focusable')}
            variant="primary"
            size="small"
            icon={<ArrowSyncRegular fontSize={13} />}
            onClick={openConfirm}
          >
            查看更新
          </OpptrixButton>
          <OpptrixButton
            className={s.dismiss}
            variant="ghost"
            size="small"
            aria-label="暂时关闭提醒"
            title="暂时关闭提醒"
            icon={<DismissRegular fontSize={14} />}
            onClick={onDismiss}
          />
        </div>
      </div>
    </div>
  )
}
