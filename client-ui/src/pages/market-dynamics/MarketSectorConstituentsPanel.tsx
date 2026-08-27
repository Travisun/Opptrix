import { useEffect, useMemo, useRef, useState } from 'react'
import { Spinner, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { ArrowSortDownRegular, ArrowSortUpRegular, DismissRegular } from '@fluentui/react-icons'
import { research } from '../../api/client'
import type { IndexConstituentItem, MarketIndexQuote } from '../../types/schemas'
import { opptrixCssVars } from '../../theme/tokens'
import { ghostInteractive } from '../../theme/mixins'
import { formatPrice } from '../../market/format'
import CnChangePill from './CnChangePill'
import { CN_DASH } from './cnDashboardTokens'
import { listRowKey } from '../../utils/listRowKey'

type SortKey = 'change_pct' | 'name'

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
  return { code, name, weight, price, change_pct }
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
  embeddedHead: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    padding: '6px 12px',
    borderBottom: `1px solid ${opptrixCssVars.separatorHairline}`,
    backgroundColor: opptrixCssVars.canvasAlt,
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
  tableHead: {
    flexShrink: 0,
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.5fr) auto auto auto',
    gap: '10px',
    alignItems: 'center',
    padding: '8px 12px',
    borderBottom: `1px solid ${opptrixCssVars.separatorHairline}`,
    backgroundColor: opptrixCssVars.canvasAlt,
  },
  th: {
    fontSize: '10px',
    fontWeight: 700,
    color: opptrixCssVars.textTertiary,
    letterSpacing: CN_DASH.tableHeadTracking,
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
  },
  thBtn: {
    ...ghostInteractive,
    border: 'none',
    background: 'transparent',
    padding: 0,
    margin: 0,
    font: 'inherit',
    color: 'inherit',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '2px',
    ':hover': { color: opptrixCssVars.textSecondary },
  },
  thRight: {
    textAlign: 'right',
    justifySelf: 'end',
  },
  scroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: '0 8px 10px',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.5fr) auto auto auto',
    gap: '10px',
    alignItems: 'center',
    padding: CN_DASH.tableRowPad,
    borderBottom: `1px solid ${opptrixCssVars.separatorHairline}`,
    minHeight: '36px',
    ':hover': { backgroundColor: opptrixCssVars.accentSoft },
    ':last-child': { borderBottom: 'none' },
  },
  rowName: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowCode: {
    fontSize: '10px',
    color: opptrixCssVars.textTertiary,
    fontVariantNumeric: 'tabular-nums',
  },
  rowPrice: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 650,
    fontVariantNumeric: 'tabular-nums',
    color: opptrixCssVars.textPrimary,
    whiteSpace: 'nowrap',
    textAlign: 'right',
  },
  rowWeight: {
    fontSize: '11px',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: opptrixCssVars.textTertiary,
    whiteSpace: 'nowrap',
    textAlign: 'right',
    minWidth: '48px',
  },
  pillCell: {
    display: 'flex',
    justifyContent: 'flex-end',
    minWidth: '88px',
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
  const [sortKey, setSortKey] = useState<SortKey>('change_pct')
  const [sortDesc, setSortDesc] = useState(true)
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
      if (sortKey === 'name') {
        const cmp = a.name.localeCompare(b.name, 'zh-CN')
        return sortDesc ? -cmp : cmp
      }
      const av = a.change_pct
      const bv = b.change_pct
      if (av == null && bv == null) return a.name.localeCompare(b.name, 'zh-CN')
      if (av == null) return 1
      if (bv == null) return -1
      return sortDesc ? bv - av : av - bv
    })
    return copy
  }, [items, sortDesc, sortKey])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDesc(prev => !prev)
      return
    }
    setSortKey(key)
    setSortDesc(key === 'change_pct')
  }

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
      ) : (
        <div className={s.embeddedHead}>
          {!loading && !error ? (
            <Text className={s.meta} block>{countLabel}</Text>
          ) : null}
          <button type="button" className={s.closeBtn} onClick={onClose}>
            取消选中
          </button>
        </div>
      )}

      {!loading && !error && items.length ? (
        <div className={s.tableHead}>
          <button type="button" className={s.thBtn} onClick={() => toggleSort('name')}>
            <span className={s.th}>名称</span>
            {sortKey === 'name' ? (
              sortDesc ? <ArrowSortDownRegular fontSize={12} /> : <ArrowSortUpRegular fontSize={12} />
            ) : null}
          </button>
          <span className={mergeClasses(s.th, s.thRight)}>现价</span>
          <span className={mergeClasses(s.th, s.thRight)}>权重</span>
          <button type="button" className={mergeClasses(s.thBtn, s.thRight)} onClick={() => toggleSort('change_pct')}>
            <span className={s.th}>涨跌幅</span>
            {sortKey === 'change_pct' ? (
              sortDesc ? <ArrowSortDownRegular fontSize={12} /> : <ArrowSortUpRegular fontSize={12} />
            ) : null}
          </button>
        </div>
      ) : null}

      <div className={mergeClasses(s.scroll, 'opptrix-scroll-hidden')}>
        {loading ? (
          <div className={s.empty}><Spinner size="tiny" label="正在加载成份股与行情…" /></div>
        ) : error ? (
          <div className={s.empty}>{error}</div>
        ) : (
          sortedItems.map((item, index) => (
            <div key={listRowKey(index, item.code, item.name)} className={s.row}>
              <div>
                <div className={s.rowName}>{item.name}</div>
                <div className={s.rowCode}>{item.code}</div>
              </div>
              <span className={s.rowPrice}>
                {item.price != null ? formatPrice(item.price, 2) : '—'}
              </span>
              <span className={s.rowWeight}>
                {item.weight != null ? `${item.weight.toFixed(2)}%` : '—'}
              </span>
              <span className={s.pillCell}>
                <CnChangePill changePct={item.change_pct} />
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
