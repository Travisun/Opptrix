/**
 * A 股行业 / 板块分类 — 仅走 StockIndex 公开 API（open-stock.lirdb.com）。
 * 不经过 StandardInstrumentGateway，避免触发 zzshare / 东财等其他 Provider。
 */
import {
  stockIndexItemsToListRows,
  stockIndexListBoards,
  stockIndexListBoardStocks,
  stockIndexListIndustries,
  stockIndexListIndustryStocks,
  type StockIndexBoard,
  type StockIndexIndustry,
  type StockIndexItem,
} from '@opptrix/a-stock-layer'
import type { StockListItem } from '@opptrix/shared'
import type { MarketDataStore } from '../store.js'
import type { JobSyncConfig } from './config.js'
import type { InitialSyncCallbacks } from './initial-sync.js'
import { persistCnEquityListRow } from './persist-universe.js'
import { sleep, withRetry } from './pool.js'

type TaxonomyKind = 'industry' | 'board'

function equityListRows(items: StockIndexItem[]): StockListItem[] {
  return stockIndexItemsToListRows(
    items.filter(i => (i.assetType ?? 'equity') === 'equity'),
  )
}

async function fetchAllIndustryStocks(industryCode: string): Promise<StockListItem[]> {
  return withRetry(async () => {
    const rows: StockListItem[] = []
    let page = 1
    const pageSize = 100
    while (page <= 200) {
      const resp = await stockIndexListIndustryStocks(industryCode, { page, pageSize })
      const batch = equityListRows(resp.items ?? [])
      if (!batch.length) break
      rows.push(...batch)
      const total = resp.total ?? 0
      if (total > 0 && rows.length >= total) break
      if (batch.length < pageSize) break
      page++
    }
    return rows
  }, 3, 800)
}

async function fetchAllBoardStocks(boardKey: string): Promise<StockListItem[]> {
  return withRetry(async () => {
    const rows: StockListItem[] = []
    let page = 1
    const pageSize = 100
    while (page <= 200) {
      const resp = await stockIndexListBoardStocks(boardKey, { market: 'CN', page, pageSize })
      const batch = equityListRows(resp.items ?? [])
      if (!batch.length) break
      rows.push(...batch)
      const total = resp.total ?? 0
      if (total > 0 && rows.length >= total) break
      if (batch.length < pageSize) break
      page++
    }
    return rows
  }, 3, 800)
}

async function syncTaxonomyNodes(
  store: MarketDataStore,
  kind: TaxonomyKind,
  entries: Array<{
    code: string
    name: string
    parentCode?: string | null
    level?: number | null
    stockCount?: number | null
    extra: Record<string, unknown>
  }>,
  fetchMembers: (code: string) => Promise<StockListItem[]>,
  industryFallback: (name: string) => string | null,
  cfg: JobSyncConfig,
  callbacks: InitialSyncCallbacks,
  label: string,
): Promise<{ nodes: number; links: number }> {
  let nodes = 0
  let links = 0
  let errors = 0

  for (const [i, entry] of entries.entries()) {
    let members: StockListItem[]
    try {
      members = await fetchMembers(entry.code)
    } catch (e) {
      errors++
      const msg = e instanceof Error ? e.message : String(e)
      callbacks.onLog?.(`StockIndex ${entry.name}（${entry.code}）拉取失败，跳过: ${msg}`)
      callbacks.onProgress?.(i + 1, entries.length, label)
      if (cfg.delayMs > 0) await sleep(cfg.delayMs)
      continue
    }
    if (!members.length) {
      callbacks.onLog?.(`StockIndex ${entry.name}（${entry.code}）：成分股为空，跳过`)
      callbacks.onProgress?.(i + 1, entries.length, label)
      if (cfg.delayMs > 0) await sleep(cfg.delayMs)
      continue
    }

    const codes: string[] = []
    const fallback = industryFallback(entry.name)
    for (const item of members) {
      const code = persistCnEquityListRow(store, item, fallback)
      if (code) codes.push(code)
    }
    if (!codes.length) {
      callbacks.onLog?.(`StockIndex ${entry.name}（${entry.code}）：无 A 股 equity 成分，跳过`)
      callbacks.onProgress?.(i + 1, entries.length, label)
      if (cfg.delayMs > 0) await sleep(cfg.delayMs)
      continue
    }

    const unique = [...new Set(codes)]
    const nodeId = store.upsertTaxonomyNode({
      market: 'CN',
      kind,
      code: entry.code,
      name: entry.name,
      parentCode: entry.parentCode ?? null,
      level: entry.level ?? null,
      stockCount: unique.length,
      extra: JSON.stringify(entry.extra),
    })
    nodes++
    links += store.replaceInstrumentTaxonomy('CN', nodeId, unique)

    callbacks.onProgress?.(i + 1, entries.length, label)
    if (cfg.delayMs > 0) await sleep(cfg.delayMs)
  }

  if (errors > 0) {
    callbacks.onLog?.(`${label}: ${errors} 个分类拉取失败，已写入 ${nodes} 个节点`)
  }

  return { nodes, links }
}

function industryEntries(items: StockIndexIndustry[], level: 1 | 2) {
  return items
    .map(item => {
      const code = String(item.industryCode ?? '').trim()
      const name = String(item.name ?? '').trim()
      if (!code || !name) return null
      return {
        code,
        name,
        parentCode: item.parentCode ?? null,
        level: item.level ?? level,
        stockCount: item.stockCount ?? null,
        extra: { ...item, source: 'stockindex' },
      }
    })
    .filter((e): e is NonNullable<typeof e> => e != null)
}

function boardEntries(items: StockIndexBoard[]) {
  return items
    .map(item => {
      const code = String(item.boardKey ?? item.boardCode ?? '').trim()
      const name = String(item.name ?? code).trim()
      if (!code || !name) return null
      return {
        code,
        name,
        parentCode: null as string | null,
        level: null as number | null,
        stockCount: item.stockCount ?? null,
        extra: { ...item, source: 'stockindex' },
      }
    })
    .filter((e): e is NonNullable<typeof e> => e != null)
}

/** StockIndex 专用：同步 A 股申万行业 + 板块分类及成分股 */
export async function syncStockIndexCnTaxonomy(
  store: MarketDataStore,
  cfg: JobSyncConfig,
  callbacks: InitialSyncCallbacks = {},
): Promise<{ nodes: number; links: number }> {
  callbacks.onLog?.('从 StockIndex API 同步 A 股行业与板块（不经过其他 Provider）…')

  let nodes = 0
  let links = 0

  for (const level of [1, 2] as const) {
    const resp = await withRetry(
      () => stockIndexListIndustries({ market: 'CN', level, withCount: true }),
      3,
      800,
    )
    const entries = industryEntries(resp.items ?? [], level)
    callbacks.onLog?.(`StockIndex 申万 ${level} 级行业：${entries.length} 个`)
    const r = await syncTaxonomyNodes(
      store,
      'industry',
      entries,
      fetchAllIndustryStocks,
      name => name,
      cfg,
      callbacks,
      `CN:industry:L${level}`,
    )
    nodes += r.nodes
    links += r.links
  }

  const boardsResp = await withRetry(
    () => stockIndexListBoards({ market: 'CN', withCount: true }),
    3,
    800,
  )
  const boardRows = boardEntries(boardsResp.items ?? [])
  callbacks.onLog?.(`StockIndex A 股板块：${boardRows.length} 个`)
  const br = await syncTaxonomyNodes(
    store,
    'board',
    boardRows,
    fetchAllBoardStocks,
    () => null,
    cfg,
    callbacks,
    'CN:board',
  )
  nodes += br.nodes
  links += br.links

  if (nodes > 0) {
    const filled = store.backfillCnStockIndustryFromTaxonomy()
    callbacks.onLog?.(`已回填 ${filled} 只股票的行业字段`)
  }

  callbacks.onLog?.(`StockIndex 分类同步完成：${nodes} 个节点，${links} 条成分关联`)
  return { nodes, links }
}

/** initial_taxonomy 任务入口：仅 StockIndex，不走 Gateway */
export async function syncAllInitialTaxonomy(
  store: MarketDataStore,
  cfg: JobSyncConfig,
  callbacks: InitialSyncCallbacks = {},
): Promise<{ nodes: number; links: number }> {
  try {
    const result = await syncStockIndexCnTaxonomy(store, cfg, callbacks)
    if (result.nodes === 0) {
      throw new Error('A 股行业/板块分类同步失败：StockIndex 未能写入任何分类节点')
    }
    return result
  } catch (e) {
    const existing = store.countTaxonomyNodes('CN', 'industry')
    if (existing >= 5) {
      const msg = e instanceof Error ? e.message : String(e)
      callbacks.onLog?.(
        `行业/板块在线同步失败（${msg}），保留本地已有 ${existing} 个行业节点`,
      )
      return { nodes: existing, links: 0 }
    }
    throw e
  }
}
