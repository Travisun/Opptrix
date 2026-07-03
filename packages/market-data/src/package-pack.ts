import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { SupplementPackId } from '@opptrix/shared'
import { isSupplementPackId } from '@opptrix/shared'
import { marketDbPath } from './paths.js'
import { MarketDataStore } from './store.js'
import { PACK_JOBS } from './sync/market-packs.js'
import {
  exportMarketDataPackage,
  importMarketDataPackageToDisk,
  inspectMarketDataPackage,
  PACKAGE_KIND,
  PACKAGE_KIND_SUPPLEMENT,
  type MarketDataPackageMetadata,
} from './package.js'

export type { SupplementPackId } from '@opptrix/shared'

function packInstrumentFilter(pack: SupplementPackId): string {
  switch (pack) {
    case 'us':
      return `market = 'US' AND asset_class = 'EQUITY'`
    case 'crypto':
      return `market = 'CRYPTO' AND asset_class = 'CRYPTO_SPOT'`
    case 'hk':
      return `market = 'HK' AND asset_class = 'EQUITY'`
    case 'jp':
      return `market = 'JP' AND asset_class = 'EQUITY'`
    case 'kr':
      return `market = 'KR' AND asset_class = 'EQUITY'`
  }
}

function packJobNames(pack: SupplementPackId): readonly string[] {
  return PACK_JOBS[pack]
}

function copyPackScopeFromSource(dest: MarketDataStore, srcPath: string, pack: SupplementPackId): void {
  const where = packInstrumentFilter(pack)
  const jobs = packJobNames(pack).map(j => `'${j}'`).join(', ')
  const escaped = srcPath.replace(/'/g, "''")
  const db = dest.db
  db.exec(`ATTACH DATABASE '${escaped}' AS src`)
  try {
    db.exec(`INSERT INTO instruments SELECT * FROM src.instruments WHERE ${where}`)
    db.exec(`
      INSERT INTO stock_quotes_daily
      SELECT q.* FROM src.stock_quotes_daily q
      WHERE q.code IN (SELECT code FROM src.instruments WHERE ${where})
    `)
    db.exec(`INSERT INTO sync_cursor SELECT * FROM src.sync_cursor WHERE job_name IN (${jobs})`)
    db.exec(`INSERT INTO sync_job_progress SELECT * FROM src.sync_job_progress WHERE job_name IN (${jobs})`)
  } finally {
    db.exec('DETACH DATABASE src')
  }
}

function buildScopedTempStore(source: MarketDataStore, pack: SupplementPackId): MarketDataStore {
  const tmpPath = path.join(os.tmpdir(), `opmd-pack-${pack}-${process.pid}-${Date.now()}.sqlite`)
  const scoped = new MarketDataStore(tmpPath)
  copyPackScopeFromSource(scoped, source.dbPath, pack)
  return scoped
}

function scopedPackCounts(scoped: MarketDataStore, pack: SupplementPackId) {
  const counts = {
    stock_count: 0,
    us_count: 0,
    crypto_count: 0,
    jp_count: 0,
    kr_count: 0,
    hk_count: 0,
  }
  switch (pack) {
    case 'us':
      counts.us_count = scoped.countUsInstruments()
      break
    case 'crypto':
      counts.crypto_count = scoped.countCryptoInstruments()
      break
    case 'jp':
      counts.jp_count = scoped.countRegionalEquityInstruments('JP')
      break
    case 'kr':
      counts.kr_count = scoped.countRegionalEquityInstruments('KR')
      break
    case 'hk':
      counts.hk_count = scoped.countRegionalEquityInstruments('HK')
      break
  }
  return counts
}

export async function exportMarketDataPackSupplement(
  source: MarketDataStore,
  pack: SupplementPackId,
): Promise<Buffer> {
  const scoped = buildScopedTempStore(source, pack)
  try {
    const buffer = await exportMarketDataPackage(scoped)
    const parsed = inspectMarketDataPackage(buffer)
    if (!parsed.valid || !parsed.metadata) throw new Error(parsed.error ?? '导出失败')
    const packCounts = scopedPackCounts(scoped, pack)
    const metadata: MarketDataPackageMetadata = {
      ...parsed.metadata,
      kind: PACKAGE_KIND_SUPPLEMENT,
      pack_scope: pack,
      snapshot: {
        ...parsed.metadata.snapshot,
        is_ready: false,
        ...packCounts,
      },
    }
    return patchPackageMetadata(buffer, metadata)
  } finally {
    scoped.close()
    try { fs.unlinkSync(scoped.dbPath) } catch { /* ignore */ }
    for (const suffix of ['-wal', '-shm']) {
      try { fs.unlinkSync(`${scoped.dbPath}${suffix}`) } catch { /* ignore */ }
    }
  }
}

function patchPackageMetadata(buffer: Buffer, metadata: MarketDataPackageMetadata): Buffer {
  const HEADER_SIZE = 68
  const header = buffer.subarray(0, HEADER_SIZE)
  const oldMetaLen = header.readUInt32LE(20)
  const payload = buffer.subarray(HEADER_SIZE + oldMetaLen)
  const metadataJson = Buffer.from(JSON.stringify(metadata), 'utf8')
  header.writeUInt32LE(metadataJson.length, 20)
  return Buffer.concat([header, metadataJson, payload])
}

export function mergeMarketDataPackSupplement(
  buffer: Buffer,
  opts?: { dbPath?: string },
): MarketDataPackageMetadata {
  const preview = inspectMarketDataPackage(buffer)
  if (!preview.valid || !preview.metadata) {
    throw new Error(preview.error ?? '数据包无效')
  }
  if (preview.metadata.kind !== PACKAGE_KIND_SUPPLEMENT) {
    throw new Error('该文件不是市场补充包；完整库请使用「导入」覆盖导入')
  }
  const pack = preview.metadata.pack_scope
  if (!pack || !isSupplementPackId(pack)) {
    throw new Error('补充包缺少有效的 pack_scope')
  }

  const dbPath = opts?.dbPath ?? marketDbPath()
  const tmpImport = `${dbPath}.pack-import.${process.pid}.${Date.now()}.sqlite`
  const parsed = importMarketDataPackageToDisk(buffer, { dbPath: tmpImport, backup: false })

  const target = new MarketDataStore(dbPath)
  try {
    mergePackScopeIntoTarget(target, tmpImport, pack)
  } finally {
    target.close()
    try { fs.unlinkSync(tmpImport) } catch { /* ignore */ }
    for (const suffix of ['-wal', '-shm']) {
      try { fs.unlinkSync(`${tmpImport}${suffix}`) } catch { /* ignore */ }
    }
  }

  return parsed
}

function mergePackScopeIntoTarget(target: MarketDataStore, srcPath: string, pack: SupplementPackId): void {
  const where = packInstrumentFilter(pack)
  const jobs = packJobNames(pack).map(j => `'${j}'`).join(', ')
  const escaped = srcPath.replace(/'/g, "''")
  const db = target.db
  db.exec(`ATTACH DATABASE '${escaped}' AS src`)
  try {
    db.transaction(() => {
      db.exec(`DELETE FROM stock_quotes_daily WHERE code IN (SELECT code FROM main.instruments WHERE ${where})`)
      db.exec(`DELETE FROM instruments WHERE ${where}`)
      db.exec(`DELETE FROM sync_cursor WHERE job_name IN (${jobs})`)
      db.exec(`DELETE FROM sync_job_progress WHERE job_name IN (${jobs})`)
      db.exec(`INSERT INTO instruments SELECT * FROM src.instruments`)
      db.exec(`INSERT INTO stock_quotes_daily SELECT * FROM src.stock_quotes_daily`)
      db.exec(`INSERT INTO sync_cursor SELECT * FROM src.sync_cursor`)
      db.exec(`INSERT INTO sync_job_progress SELECT * FROM src.sync_job_progress`)
    })()
  } finally {
    db.exec('DETACH DATABASE src')
  }
}

export function suggestPackFilename(pack: SupplementPackId, metadata?: MarketDataPackageMetadata): string {
  const date = metadata?.exported_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)
  return `opptrix-market-${pack}-${date.replace(/[^\d-]/g, '')}.opmd`
}

export function isSupplementPackage(metadata: MarketDataPackageMetadata): boolean {
  return metadata.kind === PACKAGE_KIND_SUPPLEMENT
}

export function isFullBootstrapPackage(metadata: MarketDataPackageMetadata): boolean {
  return metadata.kind === PACKAGE_KIND
}
