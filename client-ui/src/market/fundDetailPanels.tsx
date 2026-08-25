import { type ReactNode } from 'react'
import { Spinner, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import type {
  FundAllocationData,
  FundDetailData,
  FundDiagnosisData,
  FundDrawdownRow,
  FundFinancialSummary,
  FundHoldingRow,
  FundHoldersData,
  FundManagerData,
  FundNewsItem,
  FundProfileData,
  FundRateInfoItem,
  FundReturnsData,
} from '../types/market'
import {
  formatCompactNumber,
  formatPct,
  formatPrice,
} from './format'
import { opptrixCssVars } from '../theme/tokens'
import { ghostInteractive } from '../theme/mixins'
import { listRowKey } from '../utils/listRowKey'
import { isHttpUrl, openExternalUrl } from '../platform/openUrl'

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
  metricValueWrap: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.45,
    whiteSpace: 'normal',
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
  perfHead: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) repeat(3, minmax(0, 0.85fr))',
    gap: '4px',
    padding: '4px 0',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
  },
  perfRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) repeat(3, minmax(0, 0.85fr))',
    gap: '4px',
    padding: '4px 0',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    ':last-child': { borderBottom: 'none' },
  },
  rateHead: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 0.7fr) minmax(0, 1fr)',
    gap: '4px',
    padding: '4px 0',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
  },
  rateRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 0.7fr) minmax(0, 1fr)',
    gap: '4px',
    padding: '4px 0',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    ':last-child': { borderBottom: 'none' },
  },
  newsRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 76px',
    gap: '8px',
    alignItems: 'baseline',
    padding: '6px 0',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    ':last-child': { borderBottom: 'none' },
  },
  newsRowClickable: {
    ...ghostInteractive,
    cursor: 'pointer',
    borderRadius: '4px',
    margin: '0 -4px',
    padding: '6px 4px',
  },
  newsTitle: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.35,
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
  },
  newsDate: {
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'right',
    flexShrink: 0,
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
    lineHeight: 1.5,
    whiteSpace: 'pre-line',
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
  dimChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textSecondary,
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

function formatRateValue(rate: number | null | undefined): string {
  if (rate == null || Number.isNaN(rate)) return '—'
  return `${rate}%`
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

function ArchiveMetric({
  label,
  value,
  title,
  wrap,
}: {
  label: string
  value: string
  title?: string
  wrap?: boolean
}) {
  const s = useStyles()
  return (
    <div className={s.metric}>
      <span className={s.metricLabel}>{label}</span>
      <span className={wrap ? s.metricValueWrap : s.metricValue} title={title ?? (wrap ? undefined : value)}>
        {value}
      </span>
    </div>
  )
}

function RateTable({ rates }: { rates: FundRateInfoItem[] }) {
  const s = useStyles()
  if (!rates.length) return null
  return (
    <div className={s.subSection}>
      <Text className={s.sectionTitle}>费率一览</Text>
      <div className={s.rateHead}>
        <span className={s.tableHeadCell}>费率类型</span>
        <span className={s.tableHeadCell}>费率</span>
        <span className={s.tableHeadCell}>说明</span>
      </div>
      {rates.map((row, index) => {
        const label = (row.label || row.name || '').trim()
        return (
          <div key={listRowKey(index, label)} className={s.rateRow}>
            <span className={s.tableCell} title={label}>{label || '—'}</span>
            <span className={s.tableCell}>{formatRateValue(row.rate)}</span>
            <span className={s.tableCell} title={row.note}>{row.note || '—'}</span>
          </div>
        )
      })}
    </div>
  )
}

function FinancialSummaryBlock({ financials }: { financials: FundFinancialSummary | null | undefined }) {
  const s = useStyles()
  if (!financials) return null
  const cells: Array<{ label: string; value: string }> = []
  if (financials.revenue != null) {
    cells.push({ label: '营业收入', value: formatCompactNumber(financials.revenue) })
  }
  if (financials.revenueYoy != null) {
    cells.push({ label: '营收同比', value: formatPct(financials.revenueYoy) })
  }
  if (financials.netProfit != null) {
    cells.push({ label: '净利润', value: formatCompactNumber(financials.netProfit) })
  }
  if (financials.netProfitYoy != null) {
    cells.push({ label: '净利同比', value: formatPct(financials.netProfitYoy) })
  }
  if (financials.eps != null) {
    cells.push({ label: '每股收益', value: formatPrice(financials.eps) })
  }
  if (financials.roe != null) {
    cells.push({ label: '净资产收益率', value: formatPct(financials.roe) })
  }
  if (financials.grossMargin != null) {
    cells.push({ label: '毛利率', value: formatPct(financials.grossMargin) })
  }
  if (financials.debtRatio != null) {
    cells.push({ label: '资产负债率', value: formatPct(financials.debtRatio) })
  }
  if (!cells.length && financials.indicators?.length) {
    for (const ind of financials.indicators.slice(0, 8)) {
      if (!ind.label) continue
      const raw = ind.value
      const value = typeof raw === 'number'
        ? formatCompactNumber(raw)
        : (raw != null && String(raw).trim() ? String(raw) : '—')
      cells.push({ label: ind.label, value })
    }
  }
  if (!cells.length && !financials.reportDate) return null
  return (
    <div className={s.subSection}>
      <Text className={s.sectionTitle}>财务摘要</Text>
      {financials.reportDate ? (
        <Text className={s.note}>报告期 {financials.reportDate}</Text>
      ) : null}
      {cells.length > 0 ? (
        <div className={s.metricGrid}>
          {cells.map(cell => (
            <ArchiveMetric key={cell.label} label={cell.label} value={cell.value} />
          ))}
        </div>
      ) : (
        <Text className={s.emptyHint}>
          还没有可展示的财务指标
          {'\n'}
          等定期报告更新后再来看
        </Text>
      )}
    </div>
  )
}

export function FundArchivePanel({
  profile,
  financials,
}: {
  profile: FundProfileData | null
  financials?: FundFinancialSummary | null
}) {
  const s = useStyles()
  if (!profile) {
    return (
      <Text className={s.emptyHint}>
        暂时无法获取档案
        {'\n'}
        请稍后重试，或切换其他基金查看
      </Text>
    )
  }

  const rateInfo = profile.rateInfo?.filter(r => (r.label || r.name)?.trim()) ?? []
  const hasExpenseOnly = rateInfo.length === 0 && profile.expenseRatio != null
  const tradeRules = profile.tradeRules?.filter(r => r.trim()) ?? []

  return (
    <div className={s.section}>
      <Text className={s.sectionTitle}>基金档案</Text>
      <div className={s.metricGrid}>
        {profile.fullName ? (
          <ArchiveMetric label="全称" value={profile.fullName} title={profile.fullName} />
        ) : null}
        <ArchiveMetric label="基金类型" value={profile.fundType || '—'} />
        <ArchiveMetric label="风险等级" value={profile.riskLevel || '—'} />
        <ArchiveMetric label="基金经理" value={profile.manager || '—'} />
        <ArchiveMetric label="管理人" value={profile.company || '—'} />
        {profile.companyType ? (
          <ArchiveMetric label="公司类型" value={profile.companyType} />
        ) : null}
        {profile.companyFundCount != null ? (
          <ArchiveMetric label="旗下基金数" value={String(profile.companyFundCount)} />
        ) : null}
        {profile.companyScale != null ? (
          <ArchiveMetric
            label="公司管理规模"
            value={`${formatCompactNumber(profile.companyScale)} 亿`}
          />
        ) : null}
        {profile.companyEstablishDate ? (
          <ArchiveMetric label="公司成立日" value={profile.companyEstablishDate} />
        ) : null}
        <ArchiveMetric label="托管人" value={profile.custodian || '—'} />
        {profile.managerStartDate ? (
          <ArchiveMetric label="经理任职起" value={profile.managerStartDate} />
        ) : null}
        {profile.managerOfficeDays != null ? (
          <ArchiveMetric label="任职天数" value={`${profile.managerOfficeDays}`} />
        ) : null}
        {profile.managerTenureReturn != null ? (
          <ArchiveMetric label="任职回报" value={formatPct(profile.managerTenureReturn)} />
        ) : null}
        <ArchiveMetric label="成立日期" value={profile.establishDate || '—'} />
        <ArchiveMetric
          label="规模"
          value={profile.scale != null ? `${formatCompactNumber(profile.scale)} 亿` : '—'}
        />
        <ArchiveMetric
          label="份额"
          value={profile.totalShares != null ? formatCompactNumber(profile.totalShares) : '—'}
        />
        <ArchiveMetric
          label="业绩基准"
          value={profile.benchmark || '—'}
          title={profile.benchmark}
        />
        {profile.purchaseFee != null ? (
          <ArchiveMetric label="申购费" value={`${profile.purchaseFee}%`} />
        ) : null}
        {profile.redeemFee != null ? (
          <ArchiveMetric label="赎回费" value={`${profile.redeemFee}%`} />
        ) : null}
        {hasExpenseOnly ? (
          <ArchiveMetric
            label="管理费"
            value={profile.expenseRatio != null ? `${profile.expenseRatio}%` : '—'}
          />
        ) : null}
      </div>

      <RateTable rates={rateInfo} />

      {tradeRules.length > 0 ? (
        <div className={s.subSection}>
          <Text className={s.sectionTitle}>交易规则</Text>
          {tradeRules.map((rule, index) => (
            <Text key={listRowKey(index, rule)} className={s.note}>{rule}</Text>
          ))}
        </div>
      ) : null}

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
      {profile.investPhilosophy ? (
        <div className={s.subSection}>
          <Text className={s.sectionTitle}>投资理念</Text>
          <Text className={s.note}>{profile.investPhilosophy}</Text>
        </div>
      ) : null}
      {profile.investStrategy ? (
        <div className={s.subSection}>
          <Text className={s.sectionTitle}>投资策略</Text>
          <Text className={s.note}>{profile.investStrategy}</Text>
        </div>
      ) : null}

      <FinancialSummaryBlock financials={financials} />
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
  const peerAvg = returns?.peerAvg
  const ranks = returns?.ranks
  const perfRows = PERF_LABELS.filter(({ key }) => (
    perf?.[key] != null
    || peerAvg?.[key] != null
    || ranks?.[key]?.rank != null
  ))
  const hasPerf = perfRows.length > 0
  const hasDrawdown = drawdowns.length > 0
  const returnsFailed = failed.includes('业绩') && !hasPerf
  const drawdownFailed = failed.includes('回撤') && !hasDrawdown

  return (
    <PanelState
      loading={loading}
      loadingLabel="正在加载业绩…"
      error={returnsFailed && drawdownFailed
        ? '暂时无法获取业绩，请稍后重试'
        : null}
      empty={!hasPerf && !hasDrawdown
        ? '还没有可展示的区间收益或回撤，可稍后再试'
        : null}
    >
      <div className={s.section}>
        {hasPerf ? (
          <>
            <Text className={s.sectionTitle}>区间收益与同类</Text>
            <div className={s.perfHead}>
              <span className={s.tableHeadCell}>区间</span>
              <span className={s.tableHeadCell}>本基金</span>
              <span className={s.tableHeadCell}>同类均</span>
              <span className={s.tableHeadCell}>排名</span>
            </div>
            {perfRows.map(({ key, label }) => (
              <div key={key} className={s.perfRow}>
                <span className={s.tableCell}>{label}</span>
                <span className={s.tableCell}>{formatPct(perf?.[key] ?? null)}</span>
                <span className={s.tableCell}>{formatPct(peerAvg?.[key] ?? null)}</span>
                <span className={s.tableCell}>{formatRank(ranks?.[key])}</span>
              </div>
            ))}
          </>
        ) : returnsFailed ? (
          <Text className={s.emptyHint}>
            暂时无法获取区间收益
            {'\n'}
            请稍后重试
          </Text>
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
          <Text className={s.emptyHint}>
            暂时无法获取回撤
            {'\n'}
            请稍后重试
          </Text>
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
  const assets = allocation?.assets ?? []
  const industries = allocation?.industries ?? []
  const hasAlloc = Boolean(assets.length || industries.length)
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
          <Text className={s.emptyHint}>
            暂时无法获取重仓股
            {'\n'}
            请稍后重试，或先看下方配置
          </Text>
        ) : null}
        <AllocBlock title="资产配置" items={assets} />
        <AllocBlock title="行业配置" items={industries} />
      </div>
    </PanelState>
  )
}

export function FundManagerPanel({
  manager,
  fallbackName,
  loading,
  failed,
}: {
  manager: FundManagerData | null | undefined
  fallbackName?: string
  loading?: boolean
  failed: string[]
}) {
  const s = useStyles()
  const name = manager?.name?.trim() || fallbackName?.trim() || ''
  const hasDetail = Boolean(
    manager
    && (
      manager.years != null
      || manager.style
      || manager.philosophy
      || manager.experience
      || manager.resume
      || manager.education
      || manager.gender
      || (manager.representFunds?.length ?? 0) > 0
      || manager.scale != null
      || manager.performanceSummary
      || manager.startDate
      || manager.officeDays != null
      || manager.tenureReturn != null
    ),
  )
  const managerFailed = failed.includes('经理') && !hasDetail && !name

  return (
    <PanelState
      loading={loading}
      loadingLabel="正在加载经理…"
      error={managerFailed ? '暂时无法获取经理信息，请稍后重试' : null}
      empty={!name && !hasDetail
        ? '还没有基金经理信息，可稍后再试或查看档案'
        : null}
    >
      <div className={s.section}>
        <Text className={s.sectionTitle}>基金经理</Text>
        {hasDetail ? (
          <div className={s.metricGrid}>
            <ArchiveMetric label="姓名" value={name || '—'} />
            {manager?.gender ? (
              <ArchiveMetric label="性别" value={manager.gender} />
            ) : null}
            {manager?.education ? (
              <ArchiveMetric label="学历" value={manager.education} />
            ) : null}
            <ArchiveMetric
              label="从业年限"
              value={manager?.years != null ? `${manager.years} 年` : '—'}
            />
            {manager?.startDate ? (
              <ArchiveMetric label="任职起始" value={manager.startDate} />
            ) : null}
            {manager?.endDate ? (
              <ArchiveMetric label="任职结束" value={manager.endDate} />
            ) : null}
            {manager?.officeDays != null ? (
              <ArchiveMetric label="任职天数" value={`${manager.officeDays}`} />
            ) : null}
            {manager?.tenureReturn != null ? (
              <ArchiveMetric label="任职回报" value={formatPct(manager.tenureReturn)} />
            ) : null}
            <ArchiveMetric
              label="投资风格"
              value={typeof manager?.style === 'string' ? (manager.style || '—') : '—'}
            />
            <ArchiveMetric
              label="管理规模"
              value={manager?.scale != null ? `${formatCompactNumber(manager.scale)} 亿` : '—'}
            />
            {(manager?.representFunds?.length ?? 0) > 0 ? (
              <ArchiveMetric
                label="代表基金"
                value={(manager?.representFunds ?? []).join('、')}
                title={(manager?.representFunds ?? []).join('、')}
              />
            ) : null}
          </div>
        ) : (
          <div className={s.metricGrid}>
            <ArchiveMetric label="姓名" value={name || '—'} />
          </div>
        )}
        {!hasDetail && name ? (
          <Text className={s.emptyHint}>
            已知道经理姓名，详细履历暂未披露
            {'\n'}
            可稍后再看，或先浏览档案与业绩
          </Text>
        ) : null}
        {manager?.resume ? (
          <div className={s.subSection}>
            <Text className={s.sectionTitle}>履历</Text>
            <Text className={s.note}>{manager.resume}</Text>
          </div>
        ) : null}
        {manager?.philosophy ? (
          <div className={s.subSection}>
            <Text className={s.sectionTitle}>投资理念</Text>
            <Text className={s.note}>{manager.philosophy}</Text>
          </div>
        ) : null}
        {manager?.experience && manager.experience !== manager.resume ? (
          <div className={s.subSection}>
            <Text className={s.sectionTitle}>经历摘要</Text>
            <Text className={s.note}>{manager.experience}</Text>
          </div>
        ) : null}
        {manager?.performanceSummary ? (
          <div className={s.subSection}>
            <Text className={s.sectionTitle}>业绩概览</Text>
            <Text className={s.note}>{manager.performanceSummary}</Text>
          </div>
        ) : null}
      </div>
    </PanelState>
  )
}

export function FundDiagnosisPanel({
  diagnosis,
  loading,
  failed,
}: {
  diagnosis: FundDiagnosisData | null | undefined
  loading?: boolean
  failed: string[]
}) {
  const s = useStyles()
  const dims = diagnosis?.dimensions?.filter(d => d.name?.trim()) ?? []
  const resilienceText = (() => {
    const r = diagnosis?.resilience
    if (r == null || r === '') return null
    if (typeof r === 'object') return null
    return String(r)
  })()
  const summaryText = (() => {
    const s0 = diagnosis?.summary
    if (s0 == null || s0 === '') return null
    if (typeof s0 === 'object') return null
    return String(s0)
  })()
  const hasContent = Boolean(
    dims.length
    || resilienceText
    || summaryText,
  )
  const diagnosisFailed = failed.includes('诊断') && !hasContent

  return (
    <PanelState
      loading={loading}
      loadingLabel="正在加载诊断…"
      error={diagnosisFailed ? '暂时无法获取诊断，请稍后重试' : null}
      empty={!hasContent
        ? '还没有诊断结果，等数据更新后再来看'
        : null}
    >
      <div className={s.section}>
        <Text className={s.sectionTitle}>综合诊断</Text>
        {resilienceText ? (
          <ArchiveMetric label="韧性" value={resilienceText} />
        ) : null}
        {summaryText ? (
          <Text className={s.note}>{summaryText}</Text>
        ) : null}
        {dims.length > 0 ? (
          <div className={s.subSection}>
            <Text className={s.sectionTitle}>各维度</Text>
            <div className={s.perfHead}>
              <span className={s.tableHeadCell}>维度</span>
              <span className={s.tableHeadCell}>得分</span>
              <span className={s.tableHeadCell}>同类均</span>
              <span className={s.tableHeadCell}>标签</span>
            </div>
            {dims.map((dim, index) => (
              <div key={listRowKey(index, dim.name)} className={s.perfRow}>
                <span className={s.tableCell} title={dim.detail || dim.name}>{dim.name}</span>
                <span className={s.tableCell}>
                  {dim.score != null ? String(dim.score) : '—'}
                </span>
                <span className={s.tableCell}>
                  {dim.peerAvg != null ? String(dim.peerAvg) : '—'}
                </span>
                <span className={mergeClasses(s.tableCell, s.dimChip)}>
                  {typeof dim.label === 'string' || typeof dim.label === 'number'
                    ? String(dim.label)
                    : '—'}
                </span>
              </div>
            ))}
          </div>
        ) : null}
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
    && (
      holders.holderAmount != null
      || holders.instHolderRatio != null
      || holders.indivHolderRatio != null
      || holders.mgmtStaffHoldRatio != null
      || holders.avgHolderShare != null
    ),
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
              {holders?.mgmtStaffHoldRatio != null ? (
                <div className={s.metric}>
                  <span className={s.metricLabel}>管理人持有占比</span>
                  <span className={s.metricValue}>{formatPct(holders.mgmtStaffHoldRatio)}</span>
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
  const summaryCount = dividends.find(d => d.dividendCount != null)?.dividendCount
  const summaryTotal = dividends.find(d => d.dividendTotal != null)?.dividendTotal
  return (
    <PanelState
      loading={loading}
      loadingLabel="正在加载分红…"
      error={failed.includes('分红') && !dividends.length ? '暂时无法获取分红，请稍后重试' : null}
      empty={!dividends.length ? '还没有分红记录，等除息后再来看' : null}
    >
      <div className={s.section}>
        <Text className={s.sectionTitle}>历史分红</Text>
        {(summaryCount != null || summaryTotal != null) ? (
          <Text className={s.note}>
            {summaryCount != null ? `累计 ${summaryCount} 次` : ''}
            {summaryCount != null && summaryTotal != null ? ' · ' : ''}
            {summaryTotal != null ? `合计每十份约 ${formatPrice(summaryTotal)}` : ''}
          </Text>
        ) : null}
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

export function FundNewsPanel({
  news,
  loading,
  failed,
}: {
  news: FundNewsItem[]
  loading?: boolean
  failed: string[]
}) {
  const s = useStyles()
  const items = news.slice(0, 15)
  return (
    <PanelState
      loading={loading}
      loadingLabel="正在加载资讯…"
      error={failed.includes('资讯') && !items.length ? '暂时无法获取资讯，请稍后重试' : null}
      empty={!items.length
        ? '还没有相关资讯，有更新后会出现在这里'
        : null}
    >
      <div className={s.section}>
        <Text className={s.sectionTitle}>最新资讯</Text>
        {items.map((item, index) => {
          const url = item.url?.trim()
          const canOpen = Boolean(url && isHttpUrl(url))
          return (
            <div
              key={listRowKey(index, item.date, item.title)}
              className={mergeClasses(s.newsRow, canOpen && s.newsRowClickable)}
              role={canOpen ? 'link' : undefined}
              tabIndex={canOpen ? 0 : undefined}
              onClick={canOpen && url
                ? (event) => openExternalUrl(url, event)
                : undefined}
              onKeyDown={canOpen && url
                ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      openExternalUrl(url, event)
                    }
                  }
                : undefined}
            >
              <span className={s.newsTitle} title={item.title}>{item.title || '—'}</span>
              <span className={s.newsDate}>{item.date || '—'}</span>
            </div>
          )
        })}
      </div>
    </PanelState>
  )
}
