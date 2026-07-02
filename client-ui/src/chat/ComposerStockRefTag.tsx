import { makeStyles, mergeClasses } from '@fluentui/react-components'
import { DismissRegular } from '@fluentui/react-icons'
import type { WatchlistItem } from '../types/market'
import { normalizeCode } from '../market/format'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'

const useStyles = makeStyles({
  chipRow: {
    display: 'inline-flex',
    alignItems: 'center',
    flexShrink: 0,
    maxWidth: 'min(100%, 200px)',
    height: '22px',
    marginTop: '1px',
    borderRadius: opptrixTokens.radiusFull,
    backgroundColor: opptrixCssVars.accentSoft,
    color: opptrixCssVars.accent,
    overflow: 'hidden',
    verticalAlign: 'middle',
  },
  chipLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    minWidth: 0,
    height: '100%',
    padding: '0 6px 0 8px',
    fontSize: '12px',
    fontWeight: 600,
    lineHeight: 1,
  },
  chipText: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
  },
  chipCode: {
    marginLeft: '4px',
    fontSize: '10px',
    fontWeight: 500,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    opacity: 0.82,
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
    borderLeft: `1px solid ${opptrixCssVars.accentMuted}`,
    backgroundColor: 'transparent',
    color: 'inherit',
    opacity: 0.78,
    cursor: 'pointer',
    ':hover': {
      opacity: 1,
      backgroundColor: 'rgba(209, 122, 93, 0.12)',
    },
  },
})

interface Props {
  item: WatchlistItem
  onRemove: () => void
}

export default function ComposerStockRefTag({ item, onRemove }: Props) {
  const s = useStyles()
  const code = normalizeCode(item.code)

  return (
    <span className={mergeClasses(s.chipRow, 'opptrix-composer-stock-ref')}>
      <span className={s.chipLabel} title={`${item.name} ${code}`}>
        <span className={s.chipText}>{item.name}</span>
        <span className={s.chipCode}>{code}</span>
      </span>
      <button
        type="button"
        className={s.chipDismiss}
        onClick={onRemove}
        title="移除股票引用"
        aria-label={`移除 ${item.name}`}
      >
        <DismissRegular fontSize={11} />
      </button>
    </span>
  )
}
