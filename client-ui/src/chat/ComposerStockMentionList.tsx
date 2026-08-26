import { ProgressBar, Text } from '@fluentui/react-components'
import type { WatchlistItem } from '../types/market'
import {
  formatInstrumentSearchHitSubtitle,
  watchlistItemKey,
} from '../market/instrument'
import { UNIVERSE_PREP_COPY, type UniversePrepUi } from '../market/useInstrumentSearchWithUniversePrep'
import ComposerTooltipMenu, {
  COMPOSER_MENU_WIDTH,
  ComposerTooltipMenuItem,
} from './ComposerTooltipMenu'
import HoverMarqueeText from './HoverMarqueeText'

interface Props {
  open: boolean
  anchorRef: React.RefObject<HTMLElement | null>
  items: WatchlistItem[]
  activeIndex: number
  query: string
  universePrep?: UniversePrepUi
  refreshingAfterPrep?: boolean
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
  universePrep,
  refreshingAfterPrep,
  onSelect,
  onHover,
  onClose,
}: Props) {
  const preparing = universePrep?.status === 'preparing'
  const failed = universePrep?.status === 'failed'

  return (
    <ComposerTooltipMenu
      open={open}
      anchorRef={anchorRef}
      align="start"
      width={COMPOSER_MENU_WIDTH.stockMention}
      maxHeight={240}
      ariaLabel="选择标的"
      onClose={onClose}
    >
      {preparing && (
        <div className="opptrix-composer-tooltip-menu__empty" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Text size={200}>
            {refreshingAfterPrep
              ? UNIVERSE_PREP_COPY.refreshing
              : (universePrep?.message || UNIVERSE_PREP_COPY.preparing)}
          </Text>
          <ProgressBar
            value={Math.min(1, Math.max(0.03, (universePrep?.percent || 0) / 100))}
            thickness="medium"
            color="brand"
            shape="rounded"
          />
        </div>
      )}
      {failed && (
        <div className="opptrix-composer-tooltip-menu__empty">
          {universePrep?.message || UNIVERSE_PREP_COPY.failed}
        </div>
      )}
      {!items.length && !preparing ? (
        <div className="opptrix-composer-tooltip-menu__empty">
          {query
            ? '没有匹配的标的，可尝试 CN:SZ.000009、US:AAPL 或股票名称'
            : '输入 @ 搜索关注列表或本地标的'}
        </div>
      ) : null}
      {items.map((item, index) => {
        const active = index === activeIndex
        const subtitle = formatInstrumentSearchHitSubtitle(item)
        return (
          <ComposerTooltipMenuItem
            key={watchlistItemKey(item)}
            active={active}
            title={subtitle}
            className="opptrix-hover-marquee-host"
            onMouseEnter={() => onHover(index)}
            onClick={() => onSelect(item)}
          >
            <span className="opptrix-composer-tooltip-menu__item-main">
              <HoverMarqueeText text={item.name} className="opptrix-composer-tooltip-menu__item-title" />
              <span className="opptrix-composer-tooltip-menu__item-meta">{subtitle}</span>
            </span>
          </ComposerTooltipMenuItem>
        )
      })}
    </ComposerTooltipMenu>
  )
}
