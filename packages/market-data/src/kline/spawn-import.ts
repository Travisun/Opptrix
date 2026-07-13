import type { StockKline } from '@opptrix/shared'
import { klineDuckDbPath, marketDbPath } from '../paths.js'
import { getMarketDuckGateway } from '../duck/market-duck-gateway.js'

export interface KlineDuckStats {
  rows: number
  codes: number
  maxDate: string | null
}

export interface SpawnKlineImportOptions {
  parquetPath: string
  mode: 'full' | 'incremental'
  duckDbPath?: string
  sqliteDbPath?: string
  onProgress?: (message: string, percent: number) => void
}

export function queryKlinesViaSubprocess(
  code: string,
  limit = 800,
  before?: string,
  duckDbPath = klineDuckDbPath(),
): StockKline[] {
  return getMarketDuckGateway(duckDbPath).queryKlinesSync(code, limit, before)
}

export function klineStatsViaSubprocess(duckDbPath = klineDuckDbPath()): KlineDuckStats {
  return getMarketDuckGateway(duckDbPath).klineStatsSync()
}

export function migrateSqliteKlinesToDuckIfEmpty(
  duckDbPath = klineDuckDbPath(),
  sqliteDbPath = marketDbPath(),
): number {
  return getMarketDuckGateway(duckDbPath, sqliteDbPath).migrateSqliteKlinesIfEmptySync()
}

export async function spawnKlineParquetImport(opts: SpawnKlineImportOptions): Promise<{ rowsImported: number }> {
  const duckDbPath = opts.duckDbPath ?? klineDuckDbPath()
  return getMarketDuckGateway(duckDbPath, opts.sqliteDbPath).importParquetAsync({
    parquetPath: opts.parquetPath,
    mode: opts.mode,
    onProgress: opts.onProgress,
  })
}
