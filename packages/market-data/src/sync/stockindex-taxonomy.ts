/**
 * A 股行业 / 板块分类 — 旧上游（open-stock.lirdb.com / cuishushu）已下线，
 * OpptrixQuant 无板块/行业接口。本模块已**禁用**：入口为 no-op，不发起任何网络请求。
 *
 * `initial_taxonomy` job 名称保留（bootstrap readiness / schedule 依赖），
 * 但同步体恒返回 { nodes: 0, links: 0 }，不再写库。
 */
import type { MarketDataStore } from '../store.js'
import type { JobSyncConfig } from './config.js'
import type { InitialSyncCallbacks } from './initial-sync.js'

const DISABLED_MSG = 'OpptrixQuant 无板块/行业分类接口，行业/板块同步已禁用（跳过）'

/** @deprecated 已禁用 — OpptrixQuant 无行业/板块接口 */
export async function syncStockIndexCnTaxonomy(
  _store: MarketDataStore,
  _cfg: JobSyncConfig,
  callbacks: InitialSyncCallbacks = {},
): Promise<{ nodes: number; links: number }> {
  callbacks.onLog?.(DISABLED_MSG)
  return { nodes: 0, links: 0 }
}

/** initial_taxonomy 任务入口：no-op（job 名称保留以维持 bootstrap readiness） */
export async function syncAllInitialTaxonomy(
  _store: MarketDataStore,
  _cfg: JobSyncConfig,
  callbacks: InitialSyncCallbacks = {},
): Promise<{ nodes: number; links: number }> {
  callbacks.onLog?.(DISABLED_MSG)
  return { nodes: 0, links: 0 }
}
