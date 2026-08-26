/**
 * 基金详情聚合 — Hub `fund_detail` 将多路 queryInstrumentData 合并为单页载荷。
 * 快照失败则整页失败；其余维度失败写入 failed[]，不拖垮档案/业绩/持仓主路径。
 *
 * 详情页不展示时 Hub 不并行拉取：
 * - fund_drawdown / fund_diagnosis / fund_financials / fund_news
 * - fund_returns / fund_holders（快照 profile 已含区间收益与持有人结构）
 * - fund_dividend / fund_manager（侧边栏无对应 Tab）
 */

export type FundDetailQueryLike = {
  success: boolean
  data?: unknown
  error?: string
}

export type FundDetailData = {
  code: string
  snapshot: Record<string, unknown> | null
  holdings: unknown[]
  returns: Record<string, unknown> | null
  drawdowns: unknown[]
  allocation: Record<string, unknown> | null
  holders: Record<string, unknown> | null
  dividends: unknown[]
  manager: Record<string, unknown> | null
  diagnosis: Record<string, unknown> | null
  news: unknown[]
  financials: Record<string, unknown> | null
  failed: string[]
}

function asRows(r: FundDetailQueryLike): unknown[] {
  if (!r.success) return []
  const d = r.data
  if (Array.isArray(d)) return d
  if (d && typeof d === 'object') {
    const items = (d as { items?: unknown[] }).items
    if (Array.isArray(items)) return items
  }
  return []
}

function asRecord(r: FundDetailQueryLike): Record<string, unknown> | null {
  if (!r.success || r.data == null) return null
  const d = r.data
  if (Array.isArray(d)) {
    const row = d[0]
    return row && typeof row === 'object' ? row as Record<string, unknown> : null
  }
  if (typeof d === 'object') return d as Record<string, unknown>
  return null
}

function profileFromSnapshot(snapshot: Record<string, unknown> | null): Record<string, unknown> | null {
  const profile = snapshot?.profile
  if (profile && typeof profile === 'object' && !Array.isArray(profile)) {
    return profile as Record<string, unknown>
  }
  return null
}

function returnsFromProfile(profile: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!profile) return null
  const performance = profile.performance
  const ranks = profile.ranks
  const peerAvg = profile.peerAvg
  if (
    (performance == null || typeof performance !== 'object')
    && (ranks == null || typeof ranks !== 'object')
    && (peerAvg == null || typeof peerAvg !== 'object')
  ) {
    return null
  }
  return {
    ...(performance && typeof performance === 'object'
      ? { performance: performance as Record<string, unknown> }
      : {}),
    ...(ranks && typeof ranks === 'object' ? { ranks } : {}),
    ...(peerAvg && typeof peerAvg === 'object' ? { peerAvg } : {}),
  }
}

function holdersFromProfile(profile: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!profile) return null
  if (
    profile.holderAmount == null
    && profile.instHolderRatio == null
    && profile.indivHolderRatio == null
    && profile.mgmtStaffHoldRatio == null
    && profile.avgHolderShare == null
  ) {
    return null
  }
  return {
    holderAmount: profile.holderAmount,
    avgHolderShare: profile.avgHolderShare,
    instHolderRatio: profile.instHolderRatio,
    indivHolderRatio: profile.indivHolderRatio,
    mgmtStaffHoldRatio: profile.mgmtStaffHoldRatio,
    holderReportDate: profile.holderReportDate,
    top: [],
  }
}

export function mergeFundDetailParts(
  code: string,
  parts: {
    snapshot: FundDetailQueryLike
    holdings: FundDetailQueryLike
    allocation: FundDetailQueryLike
  },
): { success: boolean; data: FundDetailData | null; message: string } {
  const snapshot = asRecord(parts.snapshot)
  if (!parts.snapshot.success || !snapshot) {
    return {
      success: false,
      data: null,
      message: '暂时无法加载基金信息，请稍后再试',
    }
  }

  const failed: string[] = []
  const mark = (ok: boolean, label: string) => {
    if (!ok) failed.push(label)
  }

  const profile = profileFromSnapshot(snapshot)

  const holdings = asRows(parts.holdings)
  mark(parts.holdings.success, '持仓')

  const returns = returnsFromProfile(profile)

  const drawdowns: unknown[] = []
  const allocation = asRecord(parts.allocation)
  mark(parts.allocation.success, '配置')

  const holders = holdersFromProfile(profile)

  const dividends: unknown[] = []
  const manager: Record<string, unknown> | null = null
  const diagnosis: Record<string, unknown> | null = null
  const news: unknown[] = []
  const financials: Record<string, unknown> | null = null

  const data: FundDetailData = {
    code,
    snapshot,
    holdings,
    returns,
    drawdowns,
    allocation,
    holders,
    dividends,
    manager,
    diagnosis,
    news,
    financials,
    failed,
  }
  const extraHint = failed.length ? `（${failed.join('、')}暂缺）` : ''
  return {
    success: true,
    data,
    message: `基金详情${extraHint}`,
  }
}
