import { resolveMarket, normalizeRegionalSymbol, normalizeUsSymbol } from '@opptrix/a-stock-layer'
import type { StockListItem } from '@opptrix/shared'
import type { MarketDataStore } from '../store.js'
import { detectSt, normalizeStockCode } from '../utils.js'
import type { InitialEquityMarket } from './instrument-gateway.js'
import { cnEtfListRef, equityListRef, StandardInstrumentGateway } from './instrument-gateway.js'
import { mapPool, sleep } from './pool.js'
import type { JobSyncConfig } from './config.js'

export interface InitialSyncCallbacks {
  onLog?: (message: string) => void
  onProgress?: (current: number, total: number, label: string) => void
}

function canonicalCode(market: InitialEquityMarket, raw: string): string {
  if (market === 'CN') return normalizeStockCode(raw)
  if (market === 'US') return normalizeUsSymbol(raw)
  return normalizeRegionalSymbol('HK', raw)
}

function persistListRow(
  store: MarketDataStore,
  market: InitialEquityMarket,
  item: StockListItem,
): string | null {
  const code = canonicalCode(market, item.code)
  if (!code) return null
  const name = String(item.name ?? code).trim()
  const industry = item.industry?.trim() || null

  store.upsertInstrument({
    code,
    market,
    assetClass: 'EQUITY',
    name,
    exchange: market === 'HK' ? 'HK' : market === 'CN' ? (resolveMarket(code) ?? undefined) : undefined,
    status: market === 'CN' && detectSt(name) ? 'st' : 'active',
    extra: industry ? JSON.stringify({ industry }) : null,
  })

  if (market === 'CN') {
    store.upsertStock({
      code,
      name,
      market: resolveMarket(code),
      industry,
      is_st: detectSt(name),
      status: detectSt(name) ? 'st' : 'active',
    })
  }

  return code
}

function persistEtfRow(store: MarketDataStore, item: StockListItem): string | null {
  const code = normalizeStockCode(item.code)
  if (!code) return null
  const name = String(item.name ?? code).trim()
  store.upsertInstrument({
    code,
    market: 'CN',
    assetClass: 'ETF',
    name,
    exchange: resolveMarket(code),
    status: 'active',
    extra: item.industry?.trim() ? JSON.stringify({ industry: item.industry.trim() }) : null,
  })
  store.upsertEtfProfile(code, { code, name, source: 'initial_sync' })
  return code
}

export async function syncInitialCnEtf(
  gateway: StandardInstrumentGateway,
  store: MarketDataStore,
  cfg: JobSyncConfig,
  callbacks: InitialSyncCallbacks = {},
): Promise<{ total: number; success: number }> {
  const ref = cnEtfListRef()
  callbacks.onLog?.('拉取 A 股 ETF 列表（标准 etf_list）…')

  const resp = await gateway.query<StockListItem[]>(ref, 'etf_list', { keyword: '' })
  if (!resp.success || !resp.data?.length) {
    throw new Error(resp.error ?? 'etf_list 无数据')
  }

  let success = 0
  const rows = resp.data
  for (const [i, item] of rows.entries()) {
    if (persistEtfRow(store, item)) success++
    if (i % 100 === 0) callbacks.onProgress?.(i + 1, rows.length, 'CN_ETF')
  }
  callbacks.onProgress?.(rows.length, rows.length, 'CN_ETF')
  callbacks.onLog?.(`ETF 名录已写入 ${success} 只`)
  return { total: rows.length, success }
}

export async function syncInitialUniverse(
  gateway: StandardInstrumentGateway,
  store: MarketDataStore,
  market: InitialEquityMarket,
  cfg: JobSyncConfig,
  callbacks: InitialSyncCallbacks = {},
): Promise<{ total: number; success: number }> {
  const ref = equityListRef(market)
  callbacks.onLog?.(`拉取 ${market} 标的列表（标准 stock_list）…`)

  const resp = await gateway.query<StockListItem[]>(ref, 'stock_list', { keyword: '' })
  if (!resp.success || !resp.data?.length) {
    throw new Error(resp.error ?? `${market} stock_list 无数据`)
  }

  const rows = resp.data
  let success = 0
  for (const [i, item] of rows.entries()) {
    if (persistListRow(store, market, item)) success++
    if (i % 200 === 0) callbacks.onProgress?.(i + 1, rows.length, market)
    if (cfg.delayMs > 0 && i % 50 === 0) await sleep(0)
  }
  callbacks.onProgress?.(rows.length, rows.length, market)
  callbacks.onLog?.(`${market} 名录已写入 ${success} 只`)
  return { total: rows.length, success }
}

type TaxonomyKind = 'industry' | 'board'

function taxonomyPlateType(market: InitialEquityMarket, kind: TaxonomyKind): string {
  if (kind === 'industry') return `industries:${market}`
  return `boards:${market}`
}

function taxonomyNodeCode(row: Record<string, unknown>, kind: TaxonomyKind): string {
  if (kind === 'industry') {
    return String(row.industryCode ?? row.code ?? '').trim()
  }
  return String(row.boardKey ?? row.boardCode ?? row.code ?? '').trim()
}

function taxonomyNodeName(row: Record<string, unknown>): string {
  return String(row.name ?? row.boardName ?? taxonomyNodeCode(row, 'board')).trim()
}

export async function syncInitialTaxonomy(
  gateway: StandardInstrumentGateway,
  store: MarketDataStore,
  market: InitialEquityMarket,
  kind: TaxonomyKind,
  cfg: JobSyncConfig,
  callbacks: InitialSyncCallbacks = {},
): Promise<{ nodes: number; links: number }> {
  const ref = equityListRef(market)
  const plateType = taxonomyPlateType(market, kind)
  callbacks.onLog?.(`同步 ${market} ${kind === 'industry' ? '行业' : '板块'} 名录…`)

  const resp = await gateway.query<Record<string, unknown>[]>(ref, 'sector_list', { plateType })
  if (!resp.success || !resp.data?.length) {
    callbacks.onLog?.(`${market} ${plateType} 暂无数据，跳过`)
    return { nodes: 0, links: 0 }
  }

  let nodes = 0
  let links = 0
  const nodeRows = resp.data

  for (const [i, row] of nodeRows.entries()) {
    const code = taxonomyNodeCode(row, kind)
    const name = taxonomyNodeName(row)
    if (!code || !name) continue

    const nodeId = store.upsertTaxonomyNode({
      market,
      kind,
      code,
      name,
      parentCode: row.parentCode != null ? String(row.parentCode) : null,
      level: typeof row.level === 'number' ? row.level : null,
      stockCount: typeof row.stockCount === 'number' ? row.stockCount : null,
      extra: JSON.stringify(row),
    })
    nodes++

    const members = await fetchTaxonomyMembers(gateway, store, market, kind, code, cfg, callbacks)
    if (members.length) {
      links += store.replaceInstrumentTaxonomy(market, nodeId, members)
    }

    callbacks.onProgress?.(i + 1, nodeRows.length, `${market}:${kind}`)
    if (cfg.delayMs > 0) await sleep(cfg.delayMs)
  }

  callbacks.onLog?.(`${market} ${kind}：${nodes} 个分类，${links} 条关联`)
  return { nodes, links }
}

async function fetchTaxonomyMembers(
  gateway: StandardInstrumentGateway,
  store: MarketDataStore,
  market: InitialEquityMarket,
  kind: TaxonomyKind,
  taxonomyCode: string,
  cfg: JobSyncConfig,
  callbacks: InitialSyncCallbacks,
): Promise<string[]> {
  const ref = equityListRef(market)
  const codes: string[] = []
  let page = 1
  const pageSize = 100

  while (page <= 50) {
    const opts = kind === 'industry'
      ? { keyword: '', page, pageSize, industryCode: taxonomyCode }
      : { keyword: '', page, pageSize, boardKey: taxonomyCode }

    const resp = await gateway.query<StockListItem[]>(ref, 'stock_list', opts)
    if (!resp.success || !resp.data?.length) break

    for (const item of resp.data) {
      const code = persistListRow(store, market, item)
      if (code) codes.push(code)
    }

    if (resp.data.length < pageSize) break
    page++
    if (cfg.delayMs > 0) await sleep(cfg.delayMs)
  }

  if (!codes.length) callbacks.onLog?.(`${market} ${taxonomyCode} 成分股为空`)
  return [...new Set(codes)]
}

export async function syncAllInitialTaxonomy(
  gateway: StandardInstrumentGateway,
  store: MarketDataStore,
  cfg: JobSyncConfig,
  callbacks: InitialSyncCallbacks = {},
): Promise<void> {
  await syncInitialTaxonomy(gateway, store, 'CN', 'industry', cfg, callbacks)
  await mapPool(['HK', 'US'] as const, 1, cfg.delayMs, async market => {
    await syncInitialTaxonomy(gateway, store, market, 'board', cfg, callbacks)
  })
}
