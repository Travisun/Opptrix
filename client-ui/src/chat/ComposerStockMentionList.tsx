import { mergeClasses } from '@fluentui/react-components'
import type { WatchlistItem } from '../types/market'
import { normalizeCode } from '../market/format'
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
      title="引用关注股票"
      ariaLabel="引用关注股票"
      onClose={onClose}
    >
      {!items.length ? (
        <div className="inno-composer-tooltip-menu__empty">
          {query
            ? '没有匹配的关注股票，请先在右侧面板添加关注'
            : '暂无关注股票，请先在右侧面板添加'}
        </div>
      ) : (
        items.map((item, index) => {
          const active = index === activeIndex
          return (
            <ComposerTooltipMenuItem
              key={item.code}
              active={active}
              onMouseEnter={() => onHover(index)}
              onClick={() => onSelect(item)}
            >
              <span className="inno-composer-tooltip-menu__item-main">
                <span className="inno-composer-tooltip-menu__item-title">{item.name}</span>
                {item.industry ? (
                  <span className="inno-composer-tooltip-menu__item-meta">{item.industry}</span>
                ) : null}
              </span>
              <span className="inno-composer-tooltip-menu__item-code">
                {normalizeCode(item.code)}
              </span>
            </ComposerTooltipMenuItem>
          )
        })
      )}
    </ComposerTooltipMenu>
  )
}
