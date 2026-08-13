/**
 * 后台 retention / prune：资讯保留策略、media-cache、Provider 健康表、
 * SQLite 低频轻维护、agent-workspace/shared 软清理、Duck 临时 JSON 孤儿清扫、
 * browser-screenshots TTL/容量 GC、doc-library 孤儿 blob/md、
 * 用户数据半成品临时文件、session-state 孤儿目录。
 * 不阻塞 listen；interval 均 unref，避免拖住进程退出。
 */
import {
  applyNewsRetentionPolicy,
} from '@opptrix/news-feed'
import { pruneMediaCache } from '@opptrix/local-inference'
import {
  pruneSharedWorkspace,
  pruneOrphanSessionState,
} from '@opptrix/agent-workspace'
import { pruneBrowserScreenshots } from '@opptrix/agent-browser'
import {
  isSqliteLightMaintenanceDue,
  writeSqliteLightMaintenanceStamp,
  pruneIncompleteUserDataTemps,
  type SqliteLightMaintenanceResult,
} from '@opptrix/shared'
import { getUserDataStore } from '@opptrix/user-store'
import {
  getMarketDataStore,
  pruneOrphanDuckTempJson,
  pruneMarketDumps,
} from '@opptrix/market-data-store'
import { getDocLibraryService, runLanceVersionMaintenance } from '@opptrix/doc-library'
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
  /** 已知会话 id（session-state 孤儿对齐）；缺省则跳过 session-state prune */
  listKnownSessionIds?: () => string[]
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

/** 浏览截图目录硬顶：TTL + 容量；失败 swallow，不阻塞启动/周期 */
async function runBrowserScreenshotPrune(log?: RetentionMaintenanceDeps['log']): Promise<void> {
  try {
    const result = await pruneBrowserScreenshots()
    if (result.removedFiles > 0) {
      log?.info(
        {
          removedFiles: result.removedFiles,
          freedBytes: result.freedBytes,
          remainingBytes: result.remainingBytes,
        },
        'browser screenshots pruned',
      )
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log?.warn({ err: message }, 'browser screenshots prune failed')
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

/** market dumps 半成品 + TTL/容量硬顶；不触碰 package-exports */
function runMarketDumpsPrune(log?: RetentionMaintenanceDeps['log']): void {
  try {
    const result = pruneMarketDumps()
    if (result.removedFiles > 0) {
      log?.info(
        {
          removedFiles: result.removedFiles,
          removedIncomplete: result.removedIncomplete,
          freedBytes: result.freedBytes,
          remainingBytes: result.remainingBytes,
        },
        'market dumps pruned',
      )
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log?.warn({ err: message }, 'market dumps prune failed')
  }
}

/** Lance 版本/碎片软顶：超过 OPPTRIX_LANCE_MAX_VERSIONS 则 optimize；失败 swallow */
async function runLanceVersionPrune(log?: RetentionMaintenanceDeps['log']): Promise<void> {
  try {
    const result = await runLanceVersionMaintenance()
    if (result.optimized) {
      log?.info(
        {
          versionsBefore: result.versionsBefore,
          versionsAfter: result.versionsAfter,
          maxVersions: result.maxVersions,
        },
        'lance version maintenance done',
      )
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log?.warn({ err: message }, 'lance version maintenance failed')
  }
}

/** doc-library 无引用 blob/md：best-effort、限速 */
function runDocLibraryOrphanPrune(log?: RetentionMaintenanceDeps['log']): void {
  try {
    const result = getDocLibraryService().pruneOrphanBlobsAndMarkdown()
    if (result.removedBlobs > 0 || result.removedMarkdown > 0) {
      log?.info(
        {
          removedBlobs: result.removedBlobs,
          removedMarkdown: result.removedMarkdown,
          skippedFresh: result.skippedFresh,
          scannedBlobs: result.scannedBlobs,
          scannedMarkdown: result.scannedMarkdown,
        },
        'doc-library orphan blobs/md pruned',
      )
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log?.warn({ err: message }, 'doc-library orphan prune failed')
  }
}

/** 用户数据根半成品 *.download / .tmp / .part */
function runIncompleteTempPrune(log?: RetentionMaintenanceDeps['log']): void {
  try {
    const result = pruneIncompleteUserDataTemps()
    if (result.removedFiles > 0) {
      log?.info(
        {
          removedFiles: result.removedFiles,
          skippedFresh: result.skippedFresh,
          scanned: result.scanned,
        },
        'incomplete user-data temps pruned',
      )
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log?.warn({ err: message }, 'incomplete user-data temp prune failed')
  }
}

/** session-state 孤儿目录（需已知会话 id） */
function runSessionStateOrphanPrune(
  listKnownSessionIds: (() => string[]) | undefined,
  log?: RetentionMaintenanceDeps['log'],
): void {
  if (!listKnownSessionIds) return
  try {
    const known = listKnownSessionIds()
    const removed = pruneOrphanSessionState(known)
    if (removed > 0) {
      log?.info({ removed }, 'session-state orphan dirs pruned')
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log?.warn({ err: message }, 'session-state orphan prune failed')
  }
}

async function runNewsAndMedia(deps: RetentionMaintenanceDeps): Promise<void> {
  const log = deps.log
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
    // 与资讯失败解耦：空洞/WAL / Duck / dumps / Lance / 截图 / doc-library / 半成品 / session-state 仍尽量收敛
    await runSharedPrune(log)
    await runBrowserScreenshotPrune(log)
    runDuckTempOrphanPrune(log)
    runMarketDumpsPrune(log)
    await runLanceVersionPrune(log)
    runDocLibraryOrphanPrune(log)
    runIncompleteTempPrune(log)
    runSessionStateOrphanPrune(deps.listKnownSessionIds, log)
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
    void runNewsAndMedia(deps)
    runHealthPrune(deps.hub, deps.log)
  })

  retentionTimer = setInterval(() => {
    void runNewsAndMedia(deps)
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
