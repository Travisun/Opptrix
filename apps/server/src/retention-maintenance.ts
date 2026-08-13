/**
 * 后台 retention / prune：资讯保留策略、media-cache、Provider 健康表、
 * SQLite 低频轻维护、agent-workspace/shared 软清理、Duck 临时 JSON 孤儿清扫。
 * 不阻塞 listen；interval 均 unref，避免拖住进程退出。
 */
import {
  applyNewsRetentionPolicy,
} from '@opptrix/news-feed'
import { pruneMediaCache } from '@opptrix/local-inference'
import { pruneSharedWorkspace } from '@opptrix/agent-workspace'
import {
  isSqliteLightMaintenanceDue,
  writeSqliteLightMaintenanceStamp,
  type SqliteLightMaintenanceResult,
} from '@opptrix/shared'
import { getUserDataStore } from '@opptrix/user-store'
import {
  getMarketDataStore,
  pruneOrphanDuckTempJson,
} from '@opptrix/market-data-store'
import type { ResearchHub } from '@opptrix/research-hub'

/** 资讯 + media-cache + shared：默认 12h（落在 6–24h） */
export const RETENTION_MAINTENANCE_INTERVAL_MS = 12 * 60 * 60 * 1000

/** Provider health：默认 10min（STALE_THRESHOLD=30min） */
export const HEALTH_PRUNE_INTERVAL_MS = 10 * 60 * 1000

export type RetentionMaintenanceDeps = {
  hub: ResearchHub
  log?: {
    info: (obj: Record<string, unknown>, msg: string) => void
    warn: (obj: Record<string, unknown>, msg: string) => void
  }
  retentionIntervalMs?: number
  healthIntervalMs?: number
}

let retentionTimer: ReturnType<typeof setInterval> | null = null
let healthTimer: ReturnType<typeof setInterval> | null = null
let retentionRunning = false
let healthRunning = false

function unrefTimer(t: ReturnType<typeof setInterval>): void {
  if (typeof t.unref === 'function') t.unref()
}

function runSqliteLightIfDue(log?: RetentionMaintenanceDeps['log']): void {
  try {
    if (!isSqliteLightMaintenanceDue()) return
    const user = getUserDataStore().runLightMaintenance()
    let market: SqliteLightMaintenanceResult
    try {
      market = getMarketDataStore().runLightMaintenance()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log?.warn({ err: message }, 'market.db light maintenance failed')
      market = {
        autoVacuum: 'unknown',
        incrementalVacuum: false,
        walCheckpoint: false,
        vacuum: false,
      }
    }
    writeSqliteLightMaintenanceStamp(Date.now())
    log?.info({ user, market }, 'sqlite light maintenance done')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log?.warn({ err: message }, 'sqlite light maintenance failed')
  }
}

async function runSharedPrune(log?: RetentionMaintenanceDeps['log']): Promise<void> {
  try {
    const shared = await pruneSharedWorkspace()
    if (shared.removedFiles > 0) {
      log?.info(
        {
          removedFiles: shared.removedFiles,
          freedBytes: shared.freedBytes,
          remainingBytes: shared.remainingBytes,
        },
        'agent-workspace shared pruned',
      )
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log?.warn({ err: message }, 'agent-workspace shared prune failed')
  }
}

/** Duck 批写临时 JSON 崩溃残留：best-effort，失败 swallow，不阻塞启动/周期 */
function runDuckTempOrphanPrune(log?: RetentionMaintenanceDeps['log']): void {
  try {
    const result = pruneOrphanDuckTempJson()
    if (result.removedFiles > 0) {
      log?.info(
        {
          removedFiles: result.removedFiles,
          skippedFresh: result.skippedFresh,
          scanned: result.scanned,
        },
        'duck temp orphan json pruned',
      )
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log?.warn({ err: message }, 'duck temp orphan json prune failed')
  }
}

async function runNewsAndMedia(log?: RetentionMaintenanceDeps['log']): Promise<void> {
  if (retentionRunning) return
  retentionRunning = true
  try {
    try {
      applyNewsRetentionPolicy()
      const media = await pruneMediaCache()
      if (media.removedFiles > 0) {
        log?.info(
          { removedFiles: media.removedFiles, freedBytes: media.freedBytes },
          'media-cache pruned',
        )
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log?.warn({ err: message }, 'retention / media-cache prune failed')
    }
    // 与资讯失败解耦：空洞/WAL / Duck 临时孤儿仍尽量收敛
    await runSharedPrune(log)
    runDuckTempOrphanPrune(log)
    runSqliteLightIfDue(log)
  } finally {
    retentionRunning = false
  }
}

function runHealthPrune(hub: ResearchHub, log?: RetentionMaintenanceDeps['log']): void {
  if (healthRunning) return
  healthRunning = true
  try {
    const removed = hub.de.pruneStaleHealth()
    if (removed > 0) {
      log?.info({ removed }, 'provider health pruned')
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log?.warn({ err: message }, 'provider health prune failed')
  } finally {
    healthRunning = false
  }
}

export function startRetentionMaintenance(deps: RetentionMaintenanceDeps): void {
  if (retentionTimer || healthTimer) return

  const retentionMs = deps.retentionIntervalMs ?? RETENTION_MAINTENANCE_INTERVAL_MS
  const healthMs = deps.healthIntervalMs ?? HEALTH_PRUNE_INTERVAL_MS

  // 不阻塞启动：下一 tick 再跑首轮
  setImmediate(() => {
    void runNewsAndMedia(deps.log)
    runHealthPrune(deps.hub, deps.log)
  })

  retentionTimer = setInterval(() => {
    void runNewsAndMedia(deps.log)
  }, retentionMs)
  unrefTimer(retentionTimer)

  healthTimer = setInterval(() => {
    runHealthPrune(deps.hub, deps.log)
  }, healthMs)
  unrefTimer(healthTimer)
}

export function stopRetentionMaintenance(): void {
  if (retentionTimer) {
    clearInterval(retentionTimer)
    retentionTimer = null
  }
  if (healthTimer) {
    clearInterval(healthTimer)
    healthTimer = null
  }
}
