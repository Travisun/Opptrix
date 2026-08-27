import type { MarketDragonTigerItem } from '../../types/schemas'
import { formatCompactNumber, formatPct, pctTone } from '../../market/format'
import {
  CnInsightListPad,
  CnInsightStockRow,
  insightPctClass,
  useCnInsightListStyles,
} from './cnInsightListStyles'
import { mergeClasses } from '@fluentui/react-components'

function formatNetAmount(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${formatCompactNumber(value)}`
}

function netToneClass(
  s: ReturnType<typeof useCnInsightListStyles>,
  value: number | null | undefined,
): string {
  const tone = pctTone(value)
  if (tone === 'up') return s.pctUp
  if (tone === 'down') return s.pctDown
  return s.pctFlat
}

type Props = {
  items: MarketDragonTigerItem[]
  fill?: boolean
}

export default function MarketDragonTigerList({ items, fill = false }: Props) {
  const s = useCnInsightListStyles()

  if (!items.length) {
    return (
      <CnInsightListPad fill={fill}>
        <div className={s.empty}>
          今日暂无龙虎榜数据，非交易日或收盘前可能为空
        </div>
      </CnInsightListPad>
    )
  }

  return (
    <CnInsightListPad fill={fill}>
      {items.map(item => {
        const metaParts = [
          item.code,
          item.reason,
          item.net_amount != null ? `净买 ${formatNetAmount(item.net_amount)}` : '',
        ].filter(Boolean)
        const hasQuote = item.price != null

        if (hasQuote) {
          return (
            <CnInsightStockRow
              key={`${item.date}-${item.code}`}
              code={item.code}
              name={item.name}
              meta={metaParts.join(' · ')}
              price={item.price}
              changePct={item.change_pct}
              changeAmt={item.change_amt}
            />
          )
        }

        return (
          <CnInsightStockRow
            key={`${item.date}-${item.code}`}
            code={item.code}
            name={item.name}
            meta={metaParts.join(' · ')}
            showPrice={false}
            trailing={(
              <>
                <span className={mergeClasses(s.rowPct, netToneClass(s, item.net_amount))}>
                  {formatNetAmount(item.net_amount)}
                </span>
                <span className={mergeClasses(s.rowPct, insightPctClass(s, item.change_pct))}>
                  {formatPct(item.change_pct, 2)}
                </span>
              </>
            )}
          />
        )
      })}
    </CnInsightListPad>
  )
}
