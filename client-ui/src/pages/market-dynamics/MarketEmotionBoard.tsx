import { makeStyles, mergeClasses } from '@fluentui/react-components'
import type {
  MarketHotItem,
  MarketLimitLadder,
  MarketLimitUpItem,
} from '../../types/schemas'
import { formatPct, pctTone } from '../../market/format'
import { MARKET_DOWN, MARKET_UP } from '../../market/chartTheme'
import { opptrixCssVars } from '../../theme/tokens'
import { ghostInteractive } from '../../theme/mixins'
import { listRowKey } from '../../utils/listRowKey'

const CONTENT_PAD = '8px'
const MAX_LIMIT_UP = 20
const MAX_SKYROCKET = 15

const useStyles = makeStyles({
  root: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
  },
  rootEmbedded: {
    flex: '0 0 auto',
    overflowY: 'visible',
  },
  rootSingle: {
    overflow: 'hidden',
  },
  section: {
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    ':last-child': { borderBottom: 'none' },
  },
  sectionFill: {
    flex: 1,
    minHeight: 0,
    borderBottom: 'none',
  },
  listScroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
  },
  ladderScroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
  },
  sectionHead: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '6px',
    padding: `5px ${CONTENT_PAD} 4px`,
    minHeight: '24px',
  },
  sectionTitle: {
    fontSize: 'var(--opptrix-font-xs)',
    fontWeight: 600,
    color: opptrixCssVars.textTertiary,
    whiteSpace: 'nowrap',
  },
  sectionMeta: {
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
    whiteSpace: 'nowrap',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    padding: `0 ${CONTENT_PAD} 8px`,
  },
  limitUpRow: {
    ...ghostInteractive,
    display: 'flex',
    flexDirection: 'column',
    padding: '6px 8px',
    borderRadius: '6px',
    ':hover': { backgroundColor: opptrixCssVars.accentSoft },
  },
  skyrocketRow: {
    ...ghostInteractive,
    display: 'flex',
    flexDirection: 'column',
    padding: '6px 8px',
    borderRadius: '6px',
    ':hover': { backgroundColor: opptrixCssVars.accentSoft },
  },
  limitUpBody: {
    minWidth: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  limitUpTopRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    minWidth: 0,
    overflow: 'hidden',
  },
  limitUpTitle: {
    flex: '1 1 0',
    minWidth: 0,
  },
  limitUpBadge: {
    flexShrink: 0,
    fontSize: 'var(--opptrix-font-xs)',
    fontWeight: 500,
    color: opptrixCssVars.textSecondary,
    backgroundColor: opptrixCssVars.accentSoft,
    borderRadius: '999px',
    padding: '1px 5px',
    whiteSpace: 'nowrap',
    lineHeight: 1.25,
  },
  skyrocketBody: {
    minWidth: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  skyrocketTopRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    minWidth: 0,
    overflow: 'hidden',
  },
  skyrocketRank: {
    flexShrink: 0,
    fontSize: 'var(--opptrix-font-xs)',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: opptrixCssVars.textTertiary,
    minWidth: '24px',
    whiteSpace: 'nowrap',
    lineHeight: 1.25,
  },
  skyrocketTitle: {
    flex: '1 1 0',
    minWidth: 0,
  },
  skyrocketHeat: {
    flexShrink: 0,
    fontSize: 'var(--opptrix-font-xs)',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: opptrixCssVars.textSecondary,
    textAlign: 'right',
    minWidth: '44px',
    whiteSpace: 'nowrap',
    lineHeight: 1.25,
  },
  rowTitle: {
    minWidth: 0,
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    lineHeight: 1.25,
  },
  rowMeta: {
    minWidth: 0,
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    lineHeight: 1.25,
  },
  rowPct: {
    fontSize: 'var(--opptrix-font-xs)',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'right',
    minWidth: '44px',
    whiteSpace: 'nowrap',
  },
  pctUp: { color: MARKET_UP },
  pctDown: { color: MARKET_DOWN },
  pctFlat: { color: opptrixCssVars.textSecondary },
  rankUp: { color: MARKET_UP },
  rankDown: { color: MARKET_DOWN },
  rankFlat: { color: opptrixCssVars.textSecondary },
  ladderWrap: {
    padding: `0 ${CONTENT_PAD} 8px`,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  ladderBoard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  ladderLabel: {
    fontSize: 'var(--opptrix-font-xs)',
    fontWeight: 600,
    color: opptrixCssVars.textSecondary,
    paddingLeft: '2px',
  },
  chipRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
  },
  chip: {
    fontSize: 'var(--opptrix-font-xs)',
    fontWeight: 500,
    color: opptrixCssVars.textPrimary,
    backgroundColor: opptrixCssVars.accentSoft,
    borderRadius: '6px',
    padding: '3px 6px',
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  emptySection: {
    padding: '8px 10px 10px',
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    textAlign: 'center',
    lineHeight: 1.45,
  },
  emptyRoot: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px 12px',
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    textAlign: 'center',
    lineHeight: 1.55,
  },
  emptyRootEmbedded: {
    flex: '0 0 auto',
    minHeight: '72px',
    padding: '12px 10px',
  },
})

function pctClass(s: ReturnType<typeof useStyles>, value: number | null | undefined) {
  const tone = pctTone(value)
  if (tone === 'up') return s.pctUp
  if (tone === 'down') return s.pctDown
  return s.pctFlat
}

function rankChangeClass(s: ReturnType<typeof useStyles>, value: number | null | undefined) {
  if (value == null || value === 0) return s.rankFlat
  return value < 0 ? s.rankUp : s.rankDown
}

function formatRankChange(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value) || value === 0) return ''
  const sign = value > 0 ? '+' : ''
  return `${sign}${value}`
}

function formatSkyrocketHeat(heat: number | null | undefined): string {
  if (heat == null || Number.isNaN(heat)) return ''
  return `热度 ${Math.round(heat)}`
}

function formatSkyrocketRank(rank: number | null | undefined): string {
  if (rank == null || Number.isNaN(rank)) return '—'
  return `#${rank}`
}

function limitUpBadgeLabel(item: MarketLimitUpItem): string {
  if (item.continue_day_text) return item.continue_day_text
  return item.board_label ?? ''
}

function limitUpMetaText(item: MarketLimitUpItem): string {
  if (item.reason) return `${item.code} · ${item.reason}`
  return item.code
}

export type EmotionBoardSection = 'all' | 'limit_up' | 'skyrocket' | 'ladder'

type Props = {
  limitUp: MarketLimitUpItem[]
  skyrocket: MarketHotItem[]
  ladder: MarketLimitLadder | null | undefined
  /** 嵌入纵向滚动盘面时由外层滚动，不抢占 flex 高度 */
  embedded?: boolean
  /** 仅渲染指定区块；默认 all 保持纵向堆叠兼容 */
  section?: EmotionBoardSection
}

export default function MarketEmotionBoard({
  limitUp,
  skyrocket,
  ladder,
  embedded = false,
  section = 'all',
}: Props) {
  const s = useStyles()
  const isSingle = section !== 'all'
  const hasAny = limitUp.length > 0 || skyrocket.length > 0 || (ladder?.boards.length ?? 0) > 0

  if (section === 'all' && !hasAny) {
    return (
      <div className={mergeClasses(s.emptyRoot, embedded && s.emptyRootEmbedded)}>
        配置高级行情源后可查看涨停与热度
      </div>
    )
  }

  const limitUpRows = limitUp.slice(0, MAX_LIMIT_UP)
  const skyrocketRows = skyrocket.slice(0, MAX_SKYROCKET)

  const limitUpBlock = (
    <section className={mergeClasses(s.section, isSingle && s.sectionFill)}>
      <div className={s.sectionHead}>
        <span className={s.sectionTitle}>今日涨停</span>
        {limitUpRows.length > 0 && (
          <span className={s.sectionMeta}>{limitUpRows.length} 只</span>
        )}
      </div>
      {limitUpRows.length ? (
        <div className={mergeClasses(s.list, isSingle && s.listScroll, isSingle && 'opptrix-scroll-hidden')}>
          {limitUpRows.map((item, index) => {
            const badge = limitUpBadgeLabel(item)
            const meta = limitUpMetaText(item)
            return (
              <div key={listRowKey(index, item.code)} className={s.limitUpRow}>
                <div className={s.limitUpBody}>
                  <div className={s.limitUpTopRow}>
                    <span className={mergeClasses(s.rowTitle, s.limitUpTitle)} title={item.name}>
                      {item.name}
                    </span>
                    {badge ? <span className={s.limitUpBadge}>{badge}</span> : null}
                    <span className={mergeClasses(s.rowPct, pctClass(s, item.change_pct))}>
                      {formatPct(item.change_pct, 2)}
                    </span>
                  </div>
                  <span className={s.rowMeta} title={item.reason ?? item.code}>
                    {meta}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className={s.emptySection}>今日暂无涨停数据</div>
      )}
    </section>
  )

  const skyrocketBlock = (
    <section className={mergeClasses(s.section, isSingle && s.sectionFill)}>
      <div className={s.sectionHead}>
        <span className={s.sectionTitle}>热度飙升</span>
        {skyrocketRows.length > 0 && (
          <span className={s.sectionMeta}>{skyrocketRows.length} 只</span>
        )}
      </div>
      {skyrocketRows.length ? (
        <div className={mergeClasses(s.list, isSingle && s.listScroll, isSingle && 'opptrix-scroll-hidden')}>
          {skyrocketRows.map((item, index) => {
            const rankChange = formatRankChange(item.rank_change)
            const heatLabel = formatSkyrocketHeat(item.heat)
            return (
              <div key={listRowKey(index, item.code)} className={s.skyrocketRow}>
                <div className={s.skyrocketBody}>
                  <div className={s.skyrocketTopRow}>
                    <span className={s.skyrocketRank}>{formatSkyrocketRank(item.rank)}</span>
                    <span className={mergeClasses(s.rowTitle, s.skyrocketTitle)} title={item.name}>
                      {item.name}
                    </span>
                    <span className={s.skyrocketHeat}>{heatLabel || '—'}</span>
                  </div>
                  <span className={s.rowMeta} title={item.code}>
                    {item.code}
                    {rankChange ? (
                      <>
                        {' · 排名 '}
                        <span className={rankChangeClass(s, item.rank_change)}>{rankChange}</span>
                      </>
                    ) : null}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className={s.emptySection}>暂无飙升榜数据</div>
      )}
    </section>
  )

  const ladderBlock = (
    <section className={mergeClasses(s.section, isSingle && s.sectionFill)}>
      <div className={s.sectionHead}>
        <span className={s.sectionTitle}>连板天梯</span>
        {ladder?.date && (
          <span className={s.sectionMeta}>{ladder.date}</span>
        )}
      </div>
      {ladder?.boards.length ? (
        <div className={mergeClasses(s.ladderWrap, isSingle && s.ladderScroll, isSingle && 'opptrix-scroll-hidden')}>
          {ladder.boards.map(board => (
            <div key={board.key} className={s.ladderBoard}>
              <span className={s.ladderLabel}>{board.label}</span>
              <div className={s.chipRow}>
                {board.items.map((item, index) => (
                  <span
                    key={listRowKey(index, item.code)}
                    className={s.chip}
                    title={item.name}
                  >
                    {item.name}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={s.emptySection}>暂无连板天梯数据</div>
      )}
    </section>
  )

  const blocks =
    section === 'limit_up' ? limitUpBlock
      : section === 'skyrocket' ? skyrocketBlock
        : section === 'ladder' ? ladderBlock
          : (
            <>
              {limitUpBlock}
              {skyrocketBlock}
              {ladderBlock}
            </>
          )

  return (
    <div className={mergeClasses(
      s.root,
      embedded && s.rootEmbedded,
      isSingle && s.rootSingle,
      !embedded && 'opptrix-scroll-hidden',
    )}
    >
      {blocks}
    </div>
  )
}
