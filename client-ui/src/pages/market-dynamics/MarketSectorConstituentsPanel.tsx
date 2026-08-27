import { useEffect, useMemo, useRef, useState } from 'react'
import { Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { DismissRegular } from '@fluentui/react-icons'
import { research } from '../../api/client'
import type { IndexConstituentItem, MarketIndexQuote } from '../../types/schemas'
import { opptrixCssVars } from '../../theme/tokens'
import { ghostInteractive } from '../../theme/mixins'
import { CnInsightListPad, CnInsightStockRow } from './cnInsightListStyles'
import { CnInsightListSkeleton } from './cnDashboardSkeletons'
import { listRowKey } from '../../utils/listRowKey'

function parseConstituentCode(raw: Record<string, unknown>): string {
  const thscode = String(raw.thscode ?? raw.stock_code ?? '').trim()
  if (thscode.includes('.')) return thscode.split('.')[0] ?? thscode
  return String(raw.code ?? raw.stockCode ?? raw.symbol ?? thscode).trim()
}

function mapConstituentRow(raw: Record<string, unknown>): IndexConstituentItem | null {
  const code = parseConstituentCode(raw)
  if (!code) return null
  const name = String(raw.name ?? raw.stock_name ?? raw.sec_name ?? code).trim()
  const weightRaw = raw.weight ?? raw.weight_pct ?? raw.i_weight
  const weight = typeof weightRaw === 'number' && Number.isFinite(weightRaw) ? weightRaw : null
  const priceRaw = raw.price ?? raw.last_price
  const price = typeof priceRaw === 'number' && Number.isFinite(priceRaw) ? priceRaw : null
  const changeRaw = raw.change_pct ?? raw.changePct ?? raw.price_change_ratio_pct
  const change_pct = typeof changeRaw === 'number' && Number.isFinite(changeRaw) ? changeRaw : null
  const changeAmtRaw = raw.change_amt ?? raw.price_change ?? raw.change
  const change_amt = typeof changeAmtRaw === 'number' && Number.isFinite(changeAmtRaw) ? changeAmtRaw : null
  return { code, name, weight, price, change_pct, change_amt }
}

function constituentMeta(item: IndexConstituentItem): string {
  if (item.weight != null) return `${item.code} · 权重 ${item.weight.toFixed(2)}%`
  return item.code
}

const useStyles = makeStyles({
  root: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: opptrixCssVars.canvas,
  },
  rootStandalone: {
    flexShrink: 0,
    maxHeight: 'min(36vh, 280px)',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
  },
  head: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    padding: '6px 10px',
    borderBottom: `1px solid ${opptrixCssVars.separatorHairline}`,
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 650,
    color: opptrixCssVars.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  meta: {
    flexShrink: 0,
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
    whiteSpace: 'nowrap',
  },
  closeBtn: {
    ...ghostInteractive,
    border: 'none',
    background: 'transparent',
    color: opptrixCssVars.textSecondary,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: 'var(--opptrix-font-xs)',
    fontWeight: 600,
    padding: '4px 6px',
    borderRadius: '6px',
    ':hover': { backgroundColor: opptrixCssVars.accentSoft },
  },
  empty: {
    padding: '24px 10px',
    textAlign: 'center',
    color: opptrixCssVars.textTertiary,
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: 1.5,
  },
})

type Props = {
  indexCode: string
  sector: MarketIndexQuote
  onClose: () => void
  embedded?: boolean
}

export default function MarketSectorConstituentsPanel({
  indexCode,
  sector,
  onClose,
  embedded = false,
}: Props) {
  const s = useStyles()
  const [items, setItems] = useState<IndexConstituentItem[]>([])
  const [quotedCount, setQuotedCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    setLoading(true)
    setError('')
    setItems([])
    setQuotedCount(null)

    void research.indexConstituents(indexCode).then(resp => {
      if (!mountedRef.current) return
      if (resp.success && resp.data?.items) {
        const mapped = resp.data.items
          .map(row => mapConstituentRow(row))
          .filter((row): row is IndexConstituentItem => row != null)
        setItems(mapped)
        setQuotedCount(typeof resp.data.quoted_count === 'number' ? resp.data.quoted_count : null)
        if (!mapped.length) setError('暂无成份股数据')
      } else {
        setError(resp.message || '成份股加载失败')
      }
    }).catch(e => {
      if (!mountedRef.current) return
      setError(e instanceof Error ? e.message : '成份股加载失败')
    }).finally(() => {
      if (mountedRef.current) setLoading(false)
    })

    return () => {
      mountedRef.current = false
    }
  }, [indexCode])

  const sortedItems = useMemo(() => {
    const copy = [...items]
    copy.sort((a, b) => {
      const av = a.change_pct
      const bv = b.change_pct
      if (av == null && bv == null) return a.name.localeCompare(b.name, 'zh-CN')
      if (av == null) return 1
      if (bv == null) return -1
      return bv - av
    })
    return copy
  }, [items])

  const countLabel = quotedCount != null && quotedCount < items.length
    ? `${items.length} 只 · 行情 ${quotedCount}`
    : `${items.length} 只`

  return (
    <section className={mergeClasses(
      s.root,
      !embedded && s.rootStandalone,
      'opptrix-market-sector-constituents',
    )}>
      {!embedded ? (
        <div className={s.head}>
          <Text className={s.title} block>{sector.name} · 成份股</Text>
          {!loading && !error ? (
            <Text className={s.meta} block>{countLabel}</Text>
          ) : null}
          <button type="button" className={s.closeBtn} onClick={onClose}>
            <DismissRegular fontSize={14} />
            收起
          </button>
        </div>
      ) : null}

      {loading ? (
        <CnInsightListSkeleton fill />
      ) : error ? (
        <CnInsightListPad fill>
          <div className={s.empty}>{error}</div>
        </CnInsightListPad>
      ) : (
        <CnInsightListPad fill>
          {sortedItems.map((item, index) => (
            <CnInsightStockRow
              key={listRowKey(index, item.code, item.name)}
              code={item.code}
              name={item.name}
              meta={constituentMeta(item)}
              price={item.price}
              changePct={item.change_pct}
              changeAmt={item.change_amt}
            />
          ))}
        </CnInsightListPad>
      )}
    </section>
  )
}
