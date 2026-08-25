import { type ReactNode } from 'react'
import { Spinner, Text, makeStyles } from '@fluentui/react-components'
import type {
  FundAllocationData,
  FundDetailData,
  FundDrawdownRow,
  FundHoldingRow,
  FundHoldersData,
  FundProfileData,
  FundReturnsData,
} from '../types/market'
import {
  formatCompactNumber,
  formatPct,
  formatPrice,
} from './format'
import { opptrixCssVars } from '../theme/tokens'
import { listRowKey } from '../utils/listRowKey'

const useStyles = makeStyles({
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  sectionTitle: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 650,
    color: opptrixCssVars.textSecondary,
  },
  metricGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '6px 10px',
  },
  metric: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  metricLabel: {
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
  },
  metricValue: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textPrimary,
    fontVariantNumeric: 'tabular-nums',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  tableHead: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 0.8fr) repeat(2, minmax(0, 0.7fr))',
    gap: '4px',
    padding: '4px 0',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
  },
  tableRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 0.8fr) repeat(2, minmax(0, 0.7fr))',
    gap: '4px',
    padding: '4px 0',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    ':last-child': { borderBottom: 'none' },
  },
  tableHeadCell: {
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
  },
  tableCell: {
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textPrimary,
    fontVariantNumeric: 'tabular-nums',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  emptyHint: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    padding: '8px 2px',
  },
  subSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    marginTop: '12px',
  },
  center: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    color: opptrixCssVars.textTertiary,
    fontSize: 'var(--opptrix-font-sm)',
  },
  note: {
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.45,
  },
})

const PERF_LABELS: Array<{ key: keyof NonNullable<FundReturnsData['performance']>; label: string }> = [
  { key: 'w1', label: '近 1 周' },
  { key: 'w4', label: '近 1 月' },
  { key: 'w13', label: '近 3 月' },
  { key: 'w26', label: '近半年' },
  { key: 'w52', label: '近 1 年' },
  { key: 'year', label: '今年以来' },
  { key: 'year2', label: '近 2 年' },
  { key: 'year3', label: '近 3 年' },
  { key: 'year5', label: '近 5 年' },
  { key: 'total', label: '成立以来' },
]

function formatRank(cell: { rank?: number | null; total?: number | null } | undefined): string {
  if (!cell) return '—'
  if (cell.rank != null && cell.total != null) return `${cell.rank}/${cell.total}`
  if (cell.rank != null) return String(cell.rank)
  return '—'
}

function formatRatio(raw: number | null | undefined): string {
  if (raw == null || Number.isNaN(raw)) return '—'
  return `${raw.toFixed(2)}%`
}

function PanelState({
  loading,
  loadingLabel,
  error,
  empty,
  children,
}: {
  loading?: boolean
  loadingLabel: string
  error?: string | null
  empty?: string | null
  children: ReactNode
}) {
  const s = useStyles()
  if (loading) {
    return (
      <div className={s.center}>
        <Spinner size="small" label={loadingLabel} />
      </div>
    )
  }
  if (error) return <Text className={s.emptyHint}>{error}</Text>
  if (empty) return <Text className={s.emptyHint}>{empty}</Text>
  return <>{children}</>
}

export function FundArchivePanel({ profile }: { profile: FundProfileData | null }) {
  const s = useStyles()
  if (!profile) {
    return <Text className={s.emptyHint}>暂时无法获取档案，请稍后重试</Text>
  }
  const rows: Array<{ label: string; value: string; title?: string }> = [
    { label: '基金类型', value: profile.fundType || '—' },
    { label: '基金经理', value: profile.manager || '—' },
    { label: '管理人', value: profile.company || '—' },
    { label: '托管人', value: profile.custodian || '—' },
    { label: '成立日期', value: profile.establishDate || '—' },
    {
      label: '业绩基准',
      value: profile.benchmark || '—',
      title: profile.benchmark,
    },
    {
      label: '管理费',
      value: profile.expenseRatio != null ? `${profile.expenseRatio}%` : '—',
    },
    {
      label: '规模',
      value: profile.scale != null ? `${formatCompactNumber(profile.scale)} 亿` : '—',
    },
  ]
  return (
    <div className={s.section}>
      <Text className={s.sectionTitle}>基金档案</Text>
      <div className={s.metricGrid}>
        {rows.map(row => (
          <div key={row.label} className={s.metric}>
            <span className={s.metricLabel}>{row.label}</span>
            <span className={s.metricValue} title={row.title}>{row.value}</span>
          </div>
        ))}
      </div>
      {profile.investTarget ? (
        <div className={s.subSection}>
          <Text className={s.sectionTitle}>投资目标</Text>
          <Text className={s.note}>{profile.investTarget}</Text>
        </div>
      ) : null}
      {profile.investScope ? (
        <div className={s.subSection}>
          <Text className={s.sectionTitle}>投资范围</Text>
          <Text className={s.note}>{profile.investScope}</Text>
        </div>
      ) : null}
    </div>
  )
}

export function FundPerformancePanel({
  returns,
  drawdowns,
  loading,
  failed,
}: {
  returns: FundReturnsData | null
  drawdowns: FundDrawdownRow[]
  loading?: boolean
  failed: string[]
}) {
  const s = useStyles()
  const perf = returns?.performance
  const perfRows = PERF_LABELS.filter(({ key }) => perf?.[key] != null)
  const hasPerf = perfRows.length > 0
  const hasDrawdown = drawdowns.length > 0
  const returnsFailed = failed.includes('业绩') && !hasPerf
  const drawdownFailed = failed.includes('回撤') && !hasDrawdown

  return (
    <PanelState
      loading={loading}
      loadingLabel="正在加载业绩…"
      error={returnsFailed && drawdownFailed ? '暂时无法获取业绩，请稍后重试' : null}
      empty={!hasPerf && !hasDrawdown ? '还没有可展示的区间收益或回撤，可稍后再试' : null}
    >
      <div className={s.section}>
        {hasPerf ? (
          <>
            <Text className={s.sectionTitle}>区间收益</Text>
            <div className={s.metricGrid}>
              {perfRows.map(({ key, label }) => (
                <div key={key} className={s.metric}>
                  <span className={s.metricLabel}>{label}</span>
                  <span className={s.metricValue}>{formatPct(perf?.[key] ?? null)}</span>
                </div>
              ))}
            </div>
            {returns?.ranks && Object.keys(returns.ranks).length > 0 ? (
              <div className={s.subSection}>
                <Text className={s.sectionTitle}>同类排名</Text>
                <div className={s.metricGrid}>
                  {PERF_LABELS.filter(({ key }) => returns.ranks?.[key]?.rank != null).map(({ key, label }) => (
                    <div key={key} className={s.metric}>
                      <span className={s.metricLabel}>{label}</span>
                      <span className={s.metricValue}>{formatRank(returns.ranks?.[key])}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {returns?.peerAvg && PERF_LABELS.some(({ key }) => returns.peerAvg?.[key] != null) ? (
              <div className={s.subSection}>
                <Text className={s.sectionTitle}>同类平均</Text>
                <div className={s.metricGrid}>
                  {PERF_LABELS.filter(({ key }) => returns.peerAvg?.[key] != null).map(({ key, label }) => (
                    <div key={key} className={s.metric}>
                      <span className={s.metricLabel}>{label}</span>
                      <span className={s.metricValue}>{formatPct(returns.peerAvg?.[key] ?? null)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : returnsFailed ? (
          <Text className={s.emptyHint}>暂时无法获取区间收益，请稍后重试</Text>
        ) : null}

        {hasDrawdown ? (
          <div className={s.subSection}>
            <Text className={s.sectionTitle}>最大回撤</Text>
            <div className={s.metricGrid}>
              {drawdowns.map((row, index) => (
                <div key={listRowKey(index, row.period, row.label)} className={s.metric}>
                  <span className={s.metricLabel}>{row.label}</span>
                  <span className={s.metricValue}>{formatPct(row.value ?? null)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : drawdownFailed ? (
          <Text className={s.emptyHint}>暂时无法获取回撤，请稍后重试</Text>
        ) : null}
      </div>
    </PanelState>
  )
}

function AllocBlock({
  title,
  items,
}: {
  title: string
  items: Array<{ name: string; ratio?: number | null }>
}) {
  const s = useStyles()
  if (!items.length) return null
  return (
    <div className={s.subSection}>
      <Text className={s.sectionTitle}>{title}</Text>
      <div className={s.metricGrid}>
        {items.slice(0, 12).map((item, index) => (
          <div key={listRowKey(index, item.name)} className={s.metric}>
            <span className={s.metricLabel}>{item.name}</span>
            <span className={s.metricValue}>{formatRatio(item.ratio)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function FundHoldingsPanel({
  holdings,
  allocation,
  loading,
  failed,
}: {
  holdings: FundHoldingRow[]
  allocation: FundAllocationData | null
  loading?: boolean
  failed: string[]
}) {
  const s = useStyles()
  const holdingsFailed = failed.includes('持仓') && holdings.length === 0
  const hasAlloc = Boolean(allocation?.assets.length || allocation?.industries.length)
  return (
    <PanelState
      loading={loading}
      loadingLabel="正在加载持仓…"
      error={holdingsFailed && !hasAlloc ? '暂时无法获取持仓，请稍后重试' : null}
      empty={!holdings.length && !hasAlloc ? '还没有持仓披露，等季报更新后再来看' : null}
    >
      <div className={s.section}>
        {allocation?.reportDate ? (
          <Text className={s.note}>报告期 {allocation.reportDate}</Text>
        ) : holdings[0]?.reportDate ? (
          <Text className={s.note}>报告期 {holdings[0].reportDate}</Text>
        ) : null}
        {holdings.length > 0 ? (
          <>
            <Text className={s.sectionTitle}>重仓股</Text>
            <div className={s.tableHead}>
              <span className={s.tableHeadCell}>名称</span>
              <span className={s.tableHeadCell}>代码</span>
              <span className={s.tableHeadCell}>占比</span>
              <span className={s.tableHeadCell}>市值</span>
            </div>
            {holdings.slice(0, 20).map((row, index) => (
              <div key={listRowKey(index, row.reportDate, row.holdingSymbol)} className={s.tableRow}>
                <span className={s.tableCell} title={row.holdingName}>
                  {row.holdingName || row.holdingSymbol || '—'}
                </span>
                <span className={s.tableCell}>{row.holdingSymbol || '—'}</span>
                <span className={s.tableCell}>{formatRatio(row.weight)}</span>
                <span className={s.tableCell}>{formatCompactNumber(row.marketValue ?? null)}</span>
              </div>
            ))}
          </>
        ) : holdingsFailed ? (
          <Text className={s.emptyHint}>暂时无法获取重仓股，请稍后重试</Text>
        ) : null}
        <AllocBlock title="资产配置" items={allocation?.assets ?? []} />
        <AllocBlock title="行业配置" items={allocation?.industries ?? []} />
      </div>
    </PanelState>
  )
}

export function FundHoldersPanel({
  holders,
  loading,
  failed,
}: {
  holders: FundHoldersData | null
  loading?: boolean
  failed: string[]
}) {
  const s = useStyles()
  const top = holders?.top ?? []
  const hasStructure = Boolean(
    holders
    && (holders.holderAmount != null || holders.instHolderRatio != null || holders.indivHolderRatio != null),
  )
  return (
    <PanelState
      loading={loading}
      loadingLabel="正在加载持有人…"
      error={failed.includes('持有人') && !hasStructure && !top.length
        ? '暂时无法获取持有人，请稍后重试'
        : null}
      empty={!hasStructure && !top.length ? '还没有持有人披露，等季报更新后再来看' : null}
    >
      <div className={s.section}>
        {hasStructure ? (
          <>
            <Text className={s.sectionTitle}>持有人结构</Text>
            {holders?.holderReportDate ? (
              <Text className={s.note}>报告期 {holders.holderReportDate}</Text>
            ) : null}
            <div className={s.metricGrid}>
              {holders?.holderAmount != null ? (
                <div className={s.metric}>
                  <span className={s.metricLabel}>持有人户数</span>
                  <span className={s.metricValue}>{formatCompactNumber(holders.holderAmount)}</span>
                </div>
              ) : null}
              {holders?.avgHolderShare != null ? (
                <div className={s.metric}>
                  <span className={s.metricLabel}>户均份额</span>
                  <span className={s.metricValue}>{formatCompactNumber(holders.avgHolderShare)}</span>
                </div>
              ) : null}
              {holders?.instHolderRatio != null ? (
                <div className={s.metric}>
                  <span className={s.metricLabel}>机构占比</span>
                  <span className={s.metricValue}>{formatPct(holders.instHolderRatio)}</span>
                </div>
              ) : null}
              {holders?.indivHolderRatio != null ? (
                <div className={s.metric}>
                  <span className={s.metricLabel}>个人占比</span>
                  <span className={s.metricValue}>{formatPct(holders.indivHolderRatio)}</span>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
        {top.length > 0 ? (
          <div className={s.subSection}>
            <Text className={s.sectionTitle}>十大持有人</Text>
            <div className={s.tableHead}>
              <span className={s.tableHeadCell}>持有人</span>
              <span className={s.tableHeadCell}>份额</span>
              <span className={s.tableHeadCell}>占比</span>
              <span className={s.tableHeadCell} />
            </div>
            {top.slice(0, 10).map((row, index) => (
              <div key={listRowKey(index, row.name)} className={s.tableRow}>
                <span className={s.tableCell} title={row.name}>{row.name}</span>
                <span className={s.tableCell}>{formatCompactNumber(row.share ?? null)}</span>
                <span className={s.tableCell}>{formatRatio(row.ratio)}</span>
                <span className={s.tableCell} />
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </PanelState>
  )
}

export function FundDividendsPanel({
  dividends,
  loading,
  failed,
}: {
  dividends: FundDetailData['dividends']
  loading?: boolean
  failed: string[]
}) {
  const s = useStyles()
  return (
    <PanelState
      loading={loading}
      loadingLabel="正在加载分红…"
      error={failed.includes('分红') && !dividends.length ? '暂时无法获取分红，请稍后重试' : null}
      empty={!dividends.length ? '还没有分红记录，等除息后再来看' : null}
    >
      <div className={s.section}>
        <Text className={s.sectionTitle}>历史分红</Text>
        <div className={s.tableHead}>
          <span className={s.tableHeadCell}>除息日</span>
          <span className={s.tableHeadCell}>登记日</span>
          <span className={s.tableHeadCell}>每份分红</span>
          <span className={s.tableHeadCell}>类型</span>
        </div>
        {dividends.slice(0, 30).map((row, index) => (
          <div key={listRowKey(index, row.date, row.recordDate)} className={s.tableRow}>
            <span className={s.tableCell}>{row.date || '—'}</span>
            <span className={s.tableCell}>{row.recordDate || '—'}</span>
            <span className={s.tableCell}>{formatPrice(row.amount)}</span>
            <span className={s.tableCell}>{row.type || '—'}</span>
          </div>
        ))}
      </div>
    </PanelState>
  )
}
