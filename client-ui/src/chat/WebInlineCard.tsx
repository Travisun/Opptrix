/**
 * 消息内网页制品卡片：点击打开右侧预览；缩略为静态提示（不嵌套 iframe）。
 */
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import { OpenRegular, WindowRegular } from '@fluentui/react-icons'
import type { ChatAttachmentMeta } from '../types/chat'
import { opptrixCssVars, opptrixTokens } from '../theme/tokens'
import { ghostInteractive } from '../theme/mixins'

export interface WebInlineCardProps {
  sessionId: string
  attachment: ChatAttachmentMeta
  onOpen: () => void
}

const useStyles = makeStyles({
  card: {
    ...ghostInteractive,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    width: '100%',
    minHeight: '120px',
    maxHeight: '200px',
    boxSizing: 'border-box',
    margin: 0,
    padding: '10px 12px',
    borderRadius: opptrixTokens.radiusMd,
    border: `1px solid ${opptrixCssVars.border}`,
    backgroundColor: opptrixCssVars.canvasAlt,
    textAlign: 'left',
    color: opptrixCssVars.textPrimary,
    font: 'inherit',
    fontFamily: 'inherit',
    cursor: 'pointer',
    transitionProperty: 'border-color, background-color',
    transitionDuration: '0.15s',
    transitionTimingFunction: 'ease',
    ':hover': {
      backgroundColor: opptrixCssVars.canvas,
    },
    ':active': {
      opacity: 1,
      backgroundColor: opptrixCssVars.canvasMuted,
    },
    ':focus': { outline: 'none' },
    ':focus-visible': {
      outline: `${opptrixTokens.focusRingWidth} solid ${opptrixCssVars.inputBorderFocus}`,
      outlineOffset: opptrixTokens.focusRingOffset,
    },
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    flexShrink: 0,
  },
  title: {
    flex: '1 1 auto',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
  },
  openHint: {
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
  },
  body: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    borderRadius: '6px',
    backgroundColor: opptrixCssVars.surface,
    color: opptrixCssVars.textTertiary,
    fontSize: 'var(--opptrix-font-sm)',
  },
  icon: {
    display: 'inline-flex',
    color: opptrixCssVars.textSecondary,
  },
})

export default function WebInlineCard({
  attachment,
  onOpen,
}: WebInlineCardProps) {
  const s = useStyles()

  return (
    <button
      type="button"
      className={mergeClasses(s.card)}
      onClick={(e) => {
        e.stopPropagation()
        onOpen()
      }}
      title={`打开 ${attachment.name}`}
      aria-label={`打开网页 ${attachment.name}`}
    >
      <div className={s.header}>
        <span className={s.title}>{attachment.name}</span>
        <span className={s.openHint}>
          打开
          <OpenRegular fontSize={14} />
        </span>
      </div>
      <div className={s.body}>
        <span className={s.icon}>
          <WindowRegular fontSize={28} />
        </span>
        <span>网页预览 · 点击打开</span>
      </div>
    </button>
  )
}
