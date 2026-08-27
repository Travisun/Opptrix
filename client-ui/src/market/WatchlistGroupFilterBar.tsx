import { makeStyles, mergeClasses } from '@fluentui/react-components'
import type { WatchlistGroup, WatchlistItem } from '../types/market'
import { countWatchlistGroupMembers } from './watchlistGroupCalc'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
import { ghostInteractive } from '../theme/mixins'

const CONTENT_PAD = '15px'

const useStyles = makeStyles({
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: `4px ${CONTENT_PAD} 8px`,
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    minWidth: 0,
    minHeight: '34px',
    boxSizing: 'border-box',
    flexShrink: 0,
  },
  chipsWrap: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    overflowX: 'auto',
    overflowY: 'hidden',
  },
  chip: {...ghostInteractive,
    flexShrink: 0,
    height: '26px',
    padding: '0 10px',
    border: 'none',
    borderRadius: opptrixTokens.radiusFull,
    backgroundColor: 'transparent',
    color: opptrixCssVars.textSecondary,
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    ':hover': {
      backgroundColor: opptrixCssVars.surfaceHover,
      color: opptrixCssVars.textPrimary,
    },
  },
  chipActive: {
    backgroundColor: opptrixCssVars.accentSoft,
    color: opptrixCssVars.accent,
    ':hover': {
      backgroundColor: opptrixCssVars.accentSoft,
      color: opptrixCssVars.accent,
    },
  },
  chipCount: {
    color: opptrixCssVars.textTertiary,
    fontWeight: 400,
  },
  manageBtn: {...ghostInteractive,
    flexShrink: 0,
    height: '26px',
    padding: '0 10px',
    border: 'none',
    borderRadius: opptrixTokens.radiusFull,
    backgroundColor: 'transparent',
    color: opptrixCssVars.textTertiary,
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    ':hover': {
      backgroundColor: opptrixCssVars.surfaceHover,
      color: opptrixCssVars.textPrimary,
    },
  },
})

type Props = {
  groups: WatchlistGroup[]
  membership: Record<string, string[]>
  items: WatchlistItem[]
  selectedGroupId: string | null
  onSelectGroup: (groupId: string | null) => void
  onManage: () => void
  className?: string
}

export default function WatchlistGroupFilterBar({
  groups,
  membership,
  items,
  selectedGroupId,
  onSelectGroup,
  onManage,
  className,
}: Props) {
  const s = useStyles()
  const sortedGroups = groups.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'zh-CN'))

  return (
    <div className={mergeClasses(s.row, className)} role="tablist" aria-label="关注分组">
      <div className={mergeClasses(s.chipsWrap, 'opptrix-scroll-x')}>
        <button
          type="button"
          role="tab"
          aria-selected={!selectedGroupId}
          className={mergeClasses(s.chip, !selectedGroupId && s.chipActive)}
          onClick={() => onSelectGroup(null)}
        >
          全部
          {items.length > 0 ? (
            <span className={s.chipCount}>{` · ${items.length}`}</span>
          ) : null}
        </button>
        {sortedGroups.map(group => {
          const count = countWatchlistGroupMembers(items, membership, group.id)
          return (
            <button
              key={group.id}
              type="button"
              role="tab"
              aria-selected={selectedGroupId === group.id}
              className={mergeClasses(s.chip, selectedGroupId === group.id && s.chipActive)}
              onClick={() => onSelectGroup(group.id)}
            >
              {group.title}
              {count > 0 ? (
                <span className={s.chipCount}>{` · ${count}`}</span>
              ) : null}
            </button>
          )
        })}
      </div>
      <button type="button" className={s.manageBtn} onClick={onManage}>
        管理
      </button>
    </div>
  )
}
