import type { MarketMoneyFlow, MoneyFlow, SectorMoneyFlow } from '../../../core/schema.js'
import { bareCnSymbol, normalizeCode, safeFloat } from '../../../utils/helpers.js'
import { cnTodayString } from '../../../utils/market-session.js'

/**
 * 解析 push2 fflow daykline 一行。
 * 字段顺序（fields2）：日期,主力净额,小单净额,中单净额,大单净额,超大单净额,
 * 主力占比,小单占比,中单占比,大单占比,超大单占比,收盘价,涨跌幅,...
 */
export function parseFflowKlineRow(code: string, line: string): MoneyFlow | null {
  const parts = line.split(',')
  if (parts.length < 6) return null
  const date = String(parts[0] ?? '').slice(0, 10)
  if (!date) return null
  const mainNet = safeFloat(parts[1])
  const smallNet = safeFloat(parts[2])
  const mediumNet = safeFloat(parts[3])
  const largeNet = safeFloat(parts[4])
  const superLargeNet = safeFloat(parts[5])
  if (
    mainNet == null
    && smallNet == null
    && mediumNet == null
    && largeNet == null
    && superLargeNet == null
  ) {
    return null
  }
  return {
    code: bareCnSymbol(code) || normalizeCode(code),
    date,
    mainNet,
    smallNet,
    mediumNet,
    largeNet,
    superLargeNet,
    mainNetPct: safeFloat(parts[6]),
    close: safeFloat(parts[11]),
    changePct: safeFloat(parts[12]),
  }
}

export function mapFflowKlines(code: string, klines: string[]): MoneyFlow[] {
  const out: MoneyFlow[] = []
  for (const line of klines) {
    const row = parseFflowKlineRow(code, line)
    if (row) out.push(row)
  }
  return out
}

function numOrNull(v: unknown): number | null {
  return safeFloat(v)
}

/** clist 板块行 → SectorMoneyFlow */
export function mapClistSectorRows(
  rows: Record<string, unknown>[],
  sectorType: string,
  fid = 'f62',
): SectorMoneyFlow[] {
  const date = cnTodayString()
  const out: SectorMoneyFlow[] = []
  for (const row of rows) {
    const sectorCode = String(row.f12 ?? '').trim()
    const sectorName = String(row.f14 ?? '').trim()
    if (!sectorCode || !sectorName) continue
    const netAmount = numOrNull(row[fid] ?? row.f62)
    out.push({
      sectorCode,
      sectorName,
      date,
      netAmount,
      changePct: numOrNull(row.f3),
    })
  }
  // attach type for custom consumers without breaking SectorMoneyFlow
  return out.map(r => Object.assign(r, { sectorType }))
}

/** clist / ulist 个股资金流行 → 扩展记录（含分档） */
export function mapClistStockMoneyFlowRows(
  rows: Record<string, unknown>[],
  fid = 'f62',
): Record<string, unknown>[] {
  const date = cnTodayString()
  const out: Record<string, unknown>[] = []
  for (const row of rows) {
    const code = bareCnSymbol(String(row.f12 ?? ''))
    const name = String(row.f14 ?? '').trim()
    if (!code && !name) continue
    out.push({
      code,
      name,
      date,
      price: numOrNull(row.f2),
      changePct: numOrNull(row.f3),
      mainNet: numOrNull(row[fid] ?? row.f62),
      mainNetPct: numOrNull(row.f184),
      superLargeNet: numOrNull(row.f66),
      superLargeNetPct: numOrNull(row.f69),
      largeNet: numOrNull(row.f72),
      largeNetPct: numOrNull(row.f75),
      mediumNet: numOrNull(row.f78),
      mediumNetPct: numOrNull(row.f81),
      smallNet: numOrNull(row.f84),
      smallNetPct: numOrNull(row.f87),
      mainNet5d: numOrNull(row.f164),
      mainNet10d: numOrNull(row.f174),
      source: 'eastmoney_clist',
    })
  }
  return out
}

/** ulist 个股实时资金流 → MoneyFlow（盘后 f62 常为 0，可回退 f164 五日净流入） */
export function mapUlistToMoneyFlow(
  code: string,
  row: Record<string, unknown> | undefined,
): MoneyFlow | null {
  if (!row) return null
  const bare = bareCnSymbol(code) || bareCnSymbol(String(row.f12 ?? ''))
  if (!bare) return null
  const todayNet = numOrNull(row.f62)
  const net5d = numOrNull(row.f164)
  const mainNet = todayNet != null && todayNet !== 0 ? todayNet : (net5d ?? todayNet)
  if (mainNet == null
    && numOrNull(row.f66) == null
    && numOrNull(row.f72) == null
    && numOrNull(row.f78) == null
    && numOrNull(row.f84) == null) {
    return null
  }
  return {
    code: bare,
    date: cnTodayString(),
    mainNet,
    superLargeNet: numOrNull(row.f66) ?? numOrNull(row.f166),
    largeNet: numOrNull(row.f72) ?? numOrNull(row.f168),
    mediumNet: numOrNull(row.f78) ?? numOrNull(row.f170),
    smallNet: numOrNull(row.f84) ?? numOrNull(row.f172),
    mainNetPct: numOrNull(row.f184),
    close: numOrNull(row.f2),
    changePct: numOrNull(row.f3),
  }
}

export function mapUlistToMarketMoneyFlow(
  direction: string,
  rows: Record<string, unknown>[],
): MarketMoneyFlow[] {
  const date = cnTodayString()
  let shNet: number | null = null
  let szNet: number | null = null
  for (const row of rows) {
    const code = String(row.f12 ?? '')
    const today = numOrNull(row.f62)
    const d5 = numOrNull(row.f164)
    const net = today != null && today !== 0 ? today : (d5 ?? today)
    if (code === '000001') shNet = net
    if (code === '399001') szNet = net
  }
  if (shNet == null && szNet == null) return []
  const netAmount = (shNet ?? 0) + (szNet ?? 0)
  return [{
    direction: direction || 'market',
    date,
    netAmount,
    shNet,
    szNet,
  }]
}

const MUTUAL_TYPE_LABEL: Record<string, string> = {
  '001': '沪股通',
  '002': '港股通(沪)',
  '003': '深股通',
  '004': '港股通(深)',
}

function isSouthMutualType(typeCode: string): boolean {
  return typeCode === '002' || typeCode === '004'
}

export function mapMutualDealToMarketMoneyFlow(
  direction: string,
  rows: Record<string, unknown>[],
): MarketMoneyFlow[] {
  const dir = String(direction ?? '').toLowerCase()
  const wantSouth = /south|南/.test(dir)
  const wantNorth = /north|北|hsgt/.test(dir) || (!wantSouth && !!dir)
  const out: MarketMoneyFlow[] = []
  for (const row of rows) {
    const typeCode = String(row.MUTUAL_TYPE ?? row.mutual_type ?? '').padStart(3, '0')
    const south = isSouthMutualType(typeCode)
    if (wantSouth && !south) continue
    if (wantNorth && !wantSouth && south) continue
    const date = String(row.TRADE_DATE ?? row.trade_date ?? '').slice(0, 10)
    const netAmount = numOrNull(row.NET_BUY_AMT ?? row.FUND_INFLOW ?? row.net_buy_amt)
    if (!date || netAmount == null) continue
    const label = MUTUAL_TYPE_LABEL[typeCode] ?? typeCode
    out.push({
      direction: wantSouth ? `南向/${label}` : wantNorth ? `北向/${label}` : label,
      date,
      netAmount,
      cumulative: numOrNull(row.ACCUM_FUND_INFLOW),
    })
  }
  return out
}
