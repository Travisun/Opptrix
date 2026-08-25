/**
 * 基金详情聚合 — Hub `fund_detail` 将多路 queryInstrumentData 合并为单页载荷。
 * 快照失败则整页失败；其余维度失败写入 failed[]，不拖垮档案/业绩/持仓主路径。
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

export function mergeFundDetailParts(
  code: string,
  parts: {
    snapshot: FundDetailQueryLike
    holdings: FundDetailQueryLike
    returns: FundDetailQueryLike
    drawdown: FundDetailQueryLike
    allocation: FundDetailQueryLike
    holders: FundDetailQueryLike
    dividend: FundDetailQueryLike
    manager: FundDetailQueryLike
    diagnosis: FundDetailQueryLike
    news: FundDetailQueryLike
    financials: FundDetailQueryLike
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

  const holdings = asRows(parts.holdings)
  mark(parts.holdings.success, '持仓')

  let returns = asRecord(parts.returns)
  mark(parts.returns.success, '业绩')
  if (!returns) {
    const profile = profileFromSnapshot(snapshot)
    const performance = profile?.performance
    if (performance && typeof performance === 'object') {
      returns = { performance: performance as Record<string, unknown> }
    }
  }

  const drawdowns = asRows(parts.drawdown)
  mark(parts.drawdown.success, '回撤')

  const allocation = asRecord(parts.allocation)
  mark(parts.allocation.success, '配置')

  let holders = asRecord(parts.holders)
  mark(parts.holders.success, '持有人')
  if (!holders) {
    const profile = profileFromSnapshot(snapshot)
    if (profile && (
      profile.holderAmount != null
      || profile.instHolderRatio != null
      || profile.indivHolderRatio != null
      || profile.mgmtStaffHoldRatio != null
    )) {
      holders = {
        holderAmount: profile.holderAmount,
        avgHolderShare: profile.avgHolderShare,
        instHolderRatio: profile.instHolderRatio,
        indivHolderRatio: profile.indivHolderRatio,
        mgmtStaffHoldRatio: profile.mgmtStaffHoldRatio,
        holderReportDate: profile.holderReportDate,
        top: [],
      }
    }
  }

  const dividends = asRows(parts.dividend)
  mark(parts.dividend.success, '分红')

  const manager = asRecord(parts.manager)
  mark(parts.manager.success, '经理')

  const diagnosis = asRecord(parts.diagnosis)
  mark(parts.diagnosis.success, '诊断')

  const news = asRows(parts.news)
  mark(parts.news.success, '资讯')

  // financials：SDK 无端点，能力常返回空/失败；不写入 failed，避免详情「财务暂缺」吓人
  const financials = asRecord(parts.financials)

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
