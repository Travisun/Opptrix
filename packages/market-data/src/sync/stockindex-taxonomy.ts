/**
 * A 股行业 / 板块分类同步已禁用：入口为 no-op，不发起任何网络请求。
 * （历史依赖 OpptrixQuant / 旧爬虫行业接口，均已下线。）
 *
 * `initial_taxonomy` job 名称保留（bootstrap readiness / schedule 依赖），
 * 但同步体恒返回 { nodes: 0, links: 0 }，不再写库。
 */
import type { MarketDataStore } from '../store.js'
import type { JobSyncConfig } from './config.js'
import type { InitialSyncCallbacks } from './initial-sync.js'

const DISABLED_MSG = '行业/板块分类同步已禁用（跳过）'

/** @deprecated 已禁用 — 无可用行业/板块名录源 */
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
