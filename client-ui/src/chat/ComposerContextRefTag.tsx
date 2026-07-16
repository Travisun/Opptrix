import { useCallback, useState } from 'react'
import { Tooltip, makeStyles, mergeClasses } from '@fluentui/react-components'
import { DismissRegular } from '@fluentui/react-icons'
import type { SessionContextRef } from '../types/chat'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
import { formatContextRefLabel, formatContextRefPreview } from '../utils/formatContextRefPreview'

const useStyles = makeStyles({
  chipRow: {
    display: 'inline-flex',
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexShrink: 0,
    maxWidth: 'min(100%, 240px)',
    height: '22px',
    marginTop: '1px',
    borderRadius: opptrixTokens.radiusFull,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    color: '#007AFF',
    overflow: 'hidden',
    verticalAlign: 'middle',
  },
  chipMain: {
    display: 'inline-flex',
    alignItems: 'center',
    minWidth: 0,
    height: '100%',
    padding: '0 6px 0 8px',
    border: 'none',
    backgroundColor: 'transparent',
    color: 'inherit',
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 500,
    lineHeight: 1,
    cursor: 'pointer',
    ':hover': {
      backgroundColor: 'rgba(0, 122, 255, 0.08)',
    },
  },
  chipText: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
  },
  chipDismiss: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: '20px',
    height: '100%',
    padding: 0,
    margin: 0,
    border: 'none',
    borderLeft: '1px solid rgba(0, 122, 255, 0.14)',
    backgroundColor: 'transparent',
    color: 'inherit',
    opacity: 0.78,
    cursor: 'pointer',
    ':hover': {
      opacity: 1,
      backgroundColor: 'rgba(0, 122, 255, 0.12)',
    },
  },
  tooltipBody: {
    maxWidth: '320px',
    maxHeight: '220px',
    overflowY: 'auto',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontSize: 'var(--opptrix-font-md)',
    lineHeight: 1.5,
    color: opptrixCssVars.textPrimary,
  },
})

interface Props {
  contextRef: SessionContextRef
  onClear?: () => void
}

export default function ComposerContextRefTag({ contextRef, onClear }: Props) {
  const s = useStyles()
  const [previewOpen, setPreviewOpen] = useState(false)

  const handleChipClick = useCallback(() => {
    setPreviewOpen(open => !open)
  }, [])

  return (
    <span className={s.chipRow}>
      <Tooltip
        withArrow
        showDelay={0}
        hideDelay={0}
        visible={previewOpen}
        onVisibleChange={(_, data) => setPreviewOpen(!!data.visible)}
        content={(
          <div className={mergeClasses(s.tooltipBody, 'opptrix-scroll')}>
            {formatContextRefPreview(contextRef)}
          </div>
        )}
        relationship="description"
        positioning="above-start"
      >
        <button
          type="button"
          className={s.chipMain}
          onClick={handleChipClick}
          title="点击查看引用内容"
          aria-label="引用上下文，点击查看预览"
        >
          <span className={s.chipText}>{formatContextRefLabel(contextRef)}</span>
        </button>
      </Tooltip>
      {onClear && (
        <button
          type="button"
          className={s.chipDismiss}
          onClick={onClear}
          title="移除引用"
          aria-label="移除引用上下文"
        >
          <DismissRegular fontSize={11} />
        </button>
      )}
    </span>
  )
}
