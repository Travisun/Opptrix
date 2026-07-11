import { mergeClasses } from '@fluentui/react-components'
import type { WatchlistItem } from '../types/market'
import {
  displayCodeFromInstrument,
  normalizeWatchlistItem,
  resolveWatchlistInstrument,
  watchlistItemKey,
} from '../market/instrument'
import ComposerTooltipMenu, {
  COMPOSER_MENU_WIDTH,
  ComposerTooltipMenuItem,
} from './ComposerTooltipMenu'

interface Props {
  open: boolean
  anchorRef: React.RefObject<HTMLElement | null>
  items: WatchlistItem[]
  activeIndex: number
  query: string
  onSelect: (item: WatchlistItem) => void
  onHover: (index: number) => void
  onClose: () => void
}

export default function ComposerStockMentionList({
  open,
  anchorRef,
  items,
  activeIndex,
  query,
  onSelect,
  onHover,
  onClose,
}: Props) {
  return (
    <ComposerTooltipMenu
      open={open}
      anchorRef={anchorRef}
      align="start"
      width={COMPOSER_MENU_WIDTH.stockMention}
      maxHeight={220}
      title="引用标的"
      ariaLabel="引用标的"
      onClose={onClose}
    >
      {!items.length ? (
        <div className="opptrix-composer-tooltip-menu__empty">
          {query
            ? '没有匹配的标的，可尝试 CN:SZ.000009、US:AAPL 或股票名称'
            : '输入 @ 搜索关注列表或本地 instruments'}
        </div>
      ) : (
        items.map((item, index) => {
          const row = normalizeWatchlistItem(item)
          const codeLabel = displayCodeFromInstrument(resolveWatchlistInstrument(row))
          const active = index === activeIndex
          return (
            <ComposerTooltipMenuItem
              key={watchlistItemKey(row)}
              active={active}
              onMouseEnter={() => onHover(index)}
              onClick={() => onSelect(row)}
            >
              <span className="opptrix-composer-tooltip-menu__item-main">
                <span className="opptrix-composer-tooltip-menu__item-title">{row.name}</span>
                {row.industry ? (
                  <span className="opptrix-composer-tooltip-menu__item-meta">{row.industry}</span>
                ) : null}
              </span>
              <span className="opptrix-composer-tooltip-menu__item-code">
                {codeLabel}
              </span>
            </ComposerTooltipMenuItem>
          )
        })
      )}
    </ComposerTooltipMenu>
  )
}
