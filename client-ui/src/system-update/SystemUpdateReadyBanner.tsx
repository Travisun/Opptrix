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
import { glassPanel } from '../theme/mixins'
import { opptrixCssVars, opptrixTokens } from '../theme/tokens'

const DEFAULT_BASE_HINT = '请在服务器执行下方命令后再继续。你的对话与数据会保留。'
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
    width: 'min(380px, calc(100vw - 32px))',
    pointerEvents: 'none',
  },
  card: {
    ...glassPanel,
    pointerEvents: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '12px 14px 12px',
    borderRadius: opptrixTokens.radiusLg,
    border: `1px solid ${opptrixCssVars.separator}`,
    boxShadow: '0 8px 28px rgba(0, 0, 0, 0.08)',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  title: {
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 600,
    letterSpacing: '-0.01em',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.35,
  },
  meta: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.45,
  },
  dismiss: {
    flexShrink: 0,
    minWidth: '28px',
    width: '28px',
    height: '28px',
    padding: 0,
    marginTop: '-2px',
    marginRight: '-4px',
    color: opptrixCssVars.textTertiary,
  },
  cli: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textPrimary,
    backgroundColor: opptrixCssVars.canvas,
    border: `1px solid ${opptrixCssVars.separator}`,
    borderRadius: opptrixTokens.radiusSm,
    padding: '8px 10px',
    wordBreak: 'break-all',
    lineHeight: 1.4,
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
    paddingTop: '2px',
  },
  later: {
    minHeight: '28px',
    height: '28px',
    padding: '0 6px',
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 500,
    color: opptrixCssVars.textTertiary,
  },
  primary: {
    minHeight: '28px',
    height: '28px',
    padding: '0 12px',
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 600,
    letterSpacing: '-0.01em',
    flexShrink: 0,
    '& .fui-Button__icon': {
      fontSize: 'var(--opptrix-font-base)',
      width: '13px',
      height: '13px',
      marginInlineEnd: '0',
    },
    '& .fui-Button__icon svg': {
      width: '13px',
      height: '13px',
    },
  },
})

function shortBaseHint(raw: string | null | undefined): string {
  const t = raw?.trim()
  if (!t) return DEFAULT_BASE_HINT
  // Keep banner to one short line; long server hints belong in the dialog.
  if (t.length > 72) return DEFAULT_BASE_HINT
  return t
}

export default function SystemUpdateReadyBanner() {
  const s = useStyles()
  const {
    active,
    status,
    openConfirm,
    dismissUpdatePrompt,
    promptDismissed,
    waitingForBaseRefresh,
    environmentWaiting,
  } = useSystemUpdate()
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
  if (waitingForBaseRefresh) {
    return (
      <div className={s.wrap} role="status" aria-live="polite">
        <div className={s.card}>
          <div className={s.headerText}>
            <Text className={s.title} block>
              {environmentWaiting ? '正在等待服务恢复…' : '正在等待环境就绪…'}
            </Text>
            <Text className={s.meta} block>
              完成后你可以继续更新，请稍候。
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
          <div className={s.header}>
            <div className={s.headerText}>
              <Text className={s.title} block>此版本未能完成更新</Text>
              <Text className={s.meta} block>{BLOCKED_COPY}</Text>
            </div>
            <OpptrixButton
              className={s.dismiss}
              variant="ghost"
              size="small"
              aria-label="关闭提醒"
              title="关闭提醒"
              icon={<DismissRegular fontSize={14} />}
              onClick={dismissUpdatePrompt}
            />
          </div>
        </div>
      </div>
    )
  }
  if (!needsBase && !showReady) return null
  if (promptDismissed) return null

  const version = status.availableVersion
  if (needsBase) {
    return (
      <div className={s.wrap} role="status" aria-live="polite">
        <div className={s.card}>
          <div className={s.header}>
            <div className={s.headerText}>
              <Text className={s.title} block>需要更新后再继续</Text>
              <Text className={s.meta} block>
                {shortBaseHint(status.baseRefreshHint)}
              </Text>
            </div>
            <OpptrixButton
              className={s.dismiss}
              variant="ghost"
              size="small"
              aria-label="关闭提醒"
              title="关闭提醒"
              icon={<DismissRegular fontSize={14} />}
              onClick={dismissUpdatePrompt}
            />
          </div>
          <Text className={s.cli} block>{cli}</Text>
          <div className={s.footer}>
            <OpptrixButton
              className={mergeClasses(s.later, 'opptrix-focusable')}
              variant="ghost"
              size="small"
              onClick={openConfirm}
            >
              查看步骤
            </OpptrixButton>
            <OpptrixButton
              className={mergeClasses(s.primary, 'opptrix-focusable')}
              variant="primary"
              size="small"
              icon={<CopyRegular fontSize={13} />}
              onClick={handleCopy}
            >
              {copied ? '已复制' : '复制命令'}
            </OpptrixButton>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={s.wrap} role="status" aria-live="polite">
      <div className={s.card}>
        <div className={s.header}>
          <div className={s.headerText}>
            <Text className={s.title} block>
              {version ? `新版本 v${version} 已就绪` : '新版本已就绪'}
            </Text>
            <Text className={s.meta} block>
              更新期间暂时无法使用其他功能，对话与数据会保留。
            </Text>
          </div>
          <OpptrixButton
            className={s.dismiss}
            variant="ghost"
            size="small"
            aria-label="关闭提醒"
            title="关闭提醒"
            icon={<DismissRegular fontSize={14} />}
            onClick={dismissUpdatePrompt}
          />
        </div>
        <div className={s.footer}>
          <OpptrixButton
            className={mergeClasses(s.later, 'opptrix-focusable')}
            variant="ghost"
            size="small"
            onClick={dismissUpdatePrompt}
          >
            稍后
          </OpptrixButton>
          <OpptrixButton
            className={mergeClasses(s.primary, 'opptrix-focusable')}
            variant="primary"
            size="small"
            icon={<ArrowSyncRegular fontSize={13} />}
            onClick={openConfirm}
          >
            查看更新
          </OpptrixButton>
        </div>
      </div>
    </div>
  )
}
