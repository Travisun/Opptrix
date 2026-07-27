import { Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { DismissRegular, ArrowUpRegular } from '@fluentui/react-icons'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import { opptrixCssVars, opptrixTokens } from '../theme/tokens'
import { motion } from '../theme/mixins'
import type { QueuedPrompt } from './sessionPromptQueue'

const useStyles = makeStyles({
  /** 嵌入 composer 顶部的编排区（与快捷提问分区） */
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    width: '100%',
    boxSizing: 'border-box',
    margin: '0 0 2px',
    padding: '0 0 8px',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
  },
  head: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '8px',
    minHeight: '16px',
    paddingInline: '2px',
  },
  title: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    color: opptrixCssVars.textTertiary,
    letterSpacing: '0.02em',
  },
  hint: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    opacity: 0.85,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    maxHeight: '140px',
    overflowY: 'auto',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    minHeight: '30px',
    padding: '2px 4px 2px 6px',
    borderRadius: opptrixTokens.radiusMd,
    boxSizing: 'border-box',
    transitionProperty: 'background-color',
    transitionDuration: motion.fast,
    ':hover': {
      backgroundColor: opptrixCssVars.surfaceHover,
    },
  },
  rowNext: {
    backgroundColor: opptrixCssVars.accentSoft,
  },
  index: {
    flexShrink: 0,
    width: '14px',
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    color: opptrixCssVars.textTertiary,
    textAlign: 'center',
    fontVariantNumeric: 'tabular-nums',
  },
  text: {
    flex: 1,
    minWidth: 0,
    fontSize: 'var(--opptrix-font-base)',
    lineHeight: 1.35,
    color: opptrixCssVars.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  actions: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '2px',
    flexShrink: 0,
  },
  iconBtn: {
    minWidth: '26px',
    maxWidth: '26px',
    width: '26px',
    minHeight: '26px',
    maxHeight: '26px',
    height: '26px',
    padding: 0,
    color: opptrixCssVars.textTertiary,
    ':hover': {
      color: opptrixCssVars.textPrimary,
    },
  },
  iconBtnPlay: {
    ':hover': {
      color: opptrixCssVars.accent,
    },
  },
})

function previewText(item: QueuedPrompt): string {
  const text = item.text.trim()
  if (text) return text
  const n = item.attachmentIds?.length ?? 0
  if (n > 0) return n === 1 ? '（1 个附件）' : `（${n} 个附件）`
  return '（空提示）'
}

interface Props {
  items: QueuedPrompt[]
  /** ask_user 进行中：禁止打断执行 */
  runNowDisabled?: boolean
  waitingConfirmHint?: boolean
  onRunNow: (id: string) => void
  onRemove: (id: string) => void
}

export default function ComposerPromptQueuePanel({
  items,
  runNowDisabled = false,
  waitingConfirmHint = false,
  onRunNow,
  onRemove,
}: Props) {
  const s = useStyles()
  if (!items.length) return null

  return (
    <div
      className={s.root}
      role="region"
      aria-label="接下来"
      data-composer-section="queue"
    >
      <div className={s.head}>
        <Text className={s.title} block>
          接下来 · {items.length}
        </Text>
        {waitingConfirmHint ? (
          <Text className={s.hint} block>确认后继续</Text>
        ) : (
          <Text className={s.hint} block>完成后自动下一条</Text>
        )}
      </div>
      <div className={mergeClasses(s.list, 'opptrix-scroll')}>
        {items.map((item, index) => (
          <div
            key={item.id}
            className={mergeClasses(s.row, index === 0 && s.rowNext)}
            data-queue-item={item.id}
          >
            <span className={s.index} aria-hidden>{index + 1}</span>
            <Text className={s.text} title={previewText(item)} block>
              {previewText(item)}
            </Text>
            <div className={s.actions}>
              <OpptrixButton
                className={mergeClasses(s.iconBtn, s.iconBtnPlay, 'opptrix-round-icon-btn')}
                variant="ghost"
                size="small"
                icon={<ArrowUpRegular fontSize={13} />}
                disabled={runNowDisabled}
                aria-label="打断并立即执行"
                onClick={() => onRunNow(item.id)}
              />
              <OpptrixButton
                className={mergeClasses(s.iconBtn, 'opptrix-round-icon-btn')}
                variant="ghost"
                size="small"
                icon={<DismissRegular fontSize={13} />}
                aria-label="从排队移除"
                onClick={() => onRemove(item.id)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
