import { type ReactNode } from 'react'
import { Spinner, Text, makeStyles } from '@fluentui/react-components'
import type {
  FundAllocationData,
  FundDetailData,
  FundHoldingRow,
  FundHoldersData,
  FundManagerData,
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

export function FundArchivePanel({
  profile,
}: {
  profile: FundProfileData | null
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

  const rateInfo = profile.rateInfo?.filter(r => r && (r.label || r.name)?.trim()) ?? []
  const hasExpenseOnly = rateInfo.length === 0 && profile.expenseRatio != null
  const tradeRules = profile.tradeRules?.filter(
    r => typeof r === 'string' && r.trim(),
  ) ?? []

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
    </div>
  )
}

export function FundPerformancePanel({
  returns,
  loading,
  failed,
}: {
  returns: FundReturnsData | null
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
  const returnsFailed = failed.includes('业绩') && !hasPerf

  return (
    <PanelState
      loading={loading}
      loadingLabel="正在加载业绩…"
      error={returnsFailed ? '暂时无法获取业绩，请稍后重试' : null}
      empty={!hasPerf
        ? '还没有可展示的区间收益，可稍后再试'
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
  const hasAlloc = Boolean(assets.length)
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
      || manager.resume
      || manager.education
      || manager.gender
      || (manager.representFunds?.length ?? 0) > 0
      || manager.scale != null
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
