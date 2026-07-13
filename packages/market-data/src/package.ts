import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import type Database from 'better-sqlite3'
import { SCHEMA_VERSION } from './schema.js'
import type { MarketDataPackId } from '@opptrix/shared'
import { loadMarketPackConfig } from './market-pack-settings.js'
import type { MarketDbStatus } from './store.js'
import { marketDbPath } from './paths.js'
import { MarketDataStore } from './store.js'

/** Opptrix Market Data package — proprietary `.opmd` format (not plain SQLite). */
export const PACKAGE_MAGIC = 'OPMD'
export const PACKAGE_FORMAT_VERSION = 1
export const MIN_SUPPORTED_PACKAGE_FORMAT_VERSION = 1
export const PACKAGE_KIND = 'market_bootstrap' as const
export const PACKAGE_KIND_SUPPLEMENT = 'market_pack_supplement' as const
export type MarketDataPackageKind = typeof PACKAGE_KIND | typeof PACKAGE_KIND_SUPPLEMENT
export const PACKAGE_APP_ID = 'opptrix' as const
export const PACKAGE_FILE_EXTENSION = '.opmd'
export const PACKAGE_MIME = 'application/vnd.opptrix.market-data+opmd'

const HEADER_SIZE = 68
const SQLITE_MAGIC = 'SQLite format 3'

export interface MarketDataPackageMetadata {
  app: typeof PACKAGE_APP_ID
  kind: MarketDataPackageKind
  format_version: number
  exported_at: string
  schema_version: number
  pack_signature: string
  /** Supplemental pack scope — only for market_pack_supplement */
  pack_scope?: MarketDataPackId
  compatible: {
    min_format_version: number
    max_format_version: number
    min_schema_version: number
    max_schema_version: number
  }
  snapshot: {
    stock_count: number
    latest_trade_date: string | null
    latest_factor_date: string | null
    is_ready: boolean
    bootstrap: MarketDbStatus['bootstrap']
    us_count?: number
    crypto_count?: number
    jp_count?: number
    kr_count?: number
    hk_count?: number
    market_packs?: ReturnType<typeof loadMarketPackConfig>
  }
}

export interface MarketDataPackageInspectResult {
  valid: boolean
  error?: string
  metadata?: MarketDataPackageMetadata
  compressed_bytes?: number
  sqlite_bytes?: number
}

interface ParsedPackage {
  metadata: MarketDataPackageMetadata
  sqlite: Buffer
}

function packSignature(payloadSha256: Buffer): string {
  return createHash('sha256')
    .update(`opptrix|OPMD|v1|${payloadSha256.toString('hex')}`)
    .digest('hex')
    .slice(0, 32)
}

function buildMetadata(status: MarketDbStatus, payloadSha256: Buffer): MarketDataPackageMetadata {
  const exportedAt = new Date().toISOString()
  return {
    app: PACKAGE_APP_ID,
    kind: PACKAGE_KIND,
    format_version: PACKAGE_FORMAT_VERSION,
    exported_at: exportedAt,
    schema_version: status.schema_version,
    pack_signature: packSignature(payloadSha256),
    compatible: {
      min_format_version: MIN_SUPPORTED_PACKAGE_FORMAT_VERSION,
      max_format_version: PACKAGE_FORMAT_VERSION,
      min_schema_version: 1,
      max_schema_version: SCHEMA_VERSION,
    },
    snapshot: {
      stock_count: status.stock_count,
      latest_trade_date: status.latest_trade_date,
      latest_factor_date: status.latest_factor_date,
      is_ready: status.is_ready,
      bootstrap: status.bootstrap,
      us_count: status.us_count,
      crypto_count: status.crypto_count,
      market_packs: loadMarketPackConfig(),
    },
  }
}

async function sqliteBytesFromDb(db: Database.Database): Promise<Buffer> {
  db.pragma('wal_checkpoint(TRUNCATE)')
  const tmp = path.join(os.tmpdir(), `opmd-export-${process.pid}-${Date.now()}.sqlite`)
  try {
    await db.backup(tmp)
    return fs.readFileSync(tmp)
  } finally {
    try { fs.unlinkSync(tmp) } catch { /* ignore */ }
  }
}

function encodeHeader(
  formatVersion: number,
  exportedAtMs: number,
  schemaVersion: number,
  metadataLength: number,
  payloadLength: number,
  payloadSha256: Buffer,
): Buffer {
  const header = Buffer.alloc(HEADER_SIZE)
  header.write(PACKAGE_MAGIC, 0, 4, 'ascii')
  header.writeUInt32LE(formatVersion, 4)
  header.writeBigUInt64LE(BigInt(exportedAtMs), 8)
  header.writeUInt32LE(schemaVersion, 16)
  header.writeUInt32LE(metadataLength, 20)
  header.writeBigUInt64LE(BigInt(payloadLength), 24)
  payloadSha256.copy(header, 32, 0, 32)
  return header
}

function decodeHeader(buffer: Buffer): {
  formatVersion: number
  exportedAtMs: number
  schemaVersion: number
  metadataLength: number
  payloadLength: number
  payloadSha256: Buffer
} {
  if (buffer.length < HEADER_SIZE) {
    throw new Error('文件过短，不是有效的 Opptrix 基础数据包')
  }
  const magic = buffer.toString('ascii', 0, 4)
  if (magic !== PACKAGE_MAGIC) {
    throw new Error('无法识别该文件：仅支持 Opptrix 基础数据包（.opmd）')
  }
  return {
    formatVersion: buffer.readUInt32LE(4),
    exportedAtMs: Number(buffer.readBigUInt64LE(8)),
    schemaVersion: buffer.readUInt32LE(16),
    metadataLength: buffer.readUInt32LE(20),
    payloadLength: Number(buffer.readBigUInt64LE(24)),
    payloadSha256: buffer.subarray(32, 64),
  }
}

function validateMetadata(metadata: MarketDataPackageMetadata, payloadSha256: Buffer): void {
  if (metadata.app !== PACKAGE_APP_ID) {
    throw new Error('该数据包不是 Opptrix 导出的基础数据包')
  }
  if (metadata.kind !== PACKAGE_KIND && metadata.kind !== PACKAGE_KIND_SUPPLEMENT) {
    throw new Error('数据包类型不匹配（需要个股基础数据库或市场补充包）')
  }
  if (metadata.format_version < MIN_SUPPORTED_PACKAGE_FORMAT_VERSION) {
    throw new Error(`数据包格式过旧（v${metadata.format_version}），请升级 Opptrix 后重试`)
  }
  if (metadata.format_version > PACKAGE_FORMAT_VERSION) {
    throw new Error(`数据包格式较新（v${metadata.format_version}），请升级 Opptrix 后再导入`)
  }
  if (metadata.schema_version > SCHEMA_VERSION) {
    throw new Error(
      `数据包数据库结构较新（schema ${metadata.schema_version}），请升级 Opptrix 后再导入`,
    )
  }
  const expectedSig = packSignature(payloadSha256)
  if (metadata.pack_signature !== expectedSig) {
    throw new Error('数据包校验失败，文件可能已损坏或被篡改')
  }
}

function parsePackageBuffer(buffer: Buffer): ParsedPackage {
  const header = decodeHeader(buffer)
  if (header.formatVersion < MIN_SUPPORTED_PACKAGE_FORMAT_VERSION
    || header.formatVersion > PACKAGE_FORMAT_VERSION) {
    throw new Error(`不支持的数据包格式版本 v${header.formatVersion}`)
  }
  const metaStart = HEADER_SIZE
  const metaEnd = metaStart + header.metadataLength
  const payloadStart = metaEnd
  const payloadEnd = payloadStart + header.payloadLength
  if (buffer.length < payloadEnd) {
    throw new Error('数据包不完整，请重新下载或导出')
  }

  let metadata: MarketDataPackageMetadata
  try {
    metadata = JSON.parse(buffer.toString('utf8', metaStart, metaEnd)) as MarketDataPackageMetadata
  } catch {
    throw new Error('数据包元数据解析失败')
  }

  const payloadGzip = buffer.subarray(payloadStart, payloadEnd)
  const payloadSha256 = createHash('sha256').update(payloadGzip).digest()
  if (!payloadSha256.equals(header.payloadSha256)) {
    throw new Error('数据包内容校验失败，文件可能已损坏')
  }

  validateMetadata(metadata, payloadSha256)

  let sqlite: Buffer
  try {
    sqlite = gunzipSync(payloadGzip)
  } catch {
    throw new Error('数据包解压失败，文件可能已损坏')
  }

  if (!sqlite.subarray(0, SQLITE_MAGIC.length).equals(Buffer.from(SQLITE_MAGIC))) {
    throw new Error('数据包内部格式无效')
  }

  return { metadata, sqlite }
}

export async function exportMarketDataPackage(store: MarketDataStore): Promise<Buffer> {
  store.prepareForSqliteExport()
  const sqlite = await sqliteBytesFromDb(store.db)
  const payloadGzip = gzipSync(sqlite, { level: 6 })
  const payloadSha256 = createHash('sha256').update(payloadGzip).digest()
  const metadata = buildMetadata(store.getStatus(), payloadSha256)
  const metadataJson = Buffer.from(JSON.stringify(metadata), 'utf8')
  const exportedAtMs = Date.parse(metadata.exported_at)
  const header = encodeHeader(
    PACKAGE_FORMAT_VERSION,
    Number.isFinite(exportedAtMs) ? exportedAtMs : Date.now(),
    metadata.schema_version,
    metadataJson.length,
    payloadGzip.length,
    payloadSha256,
  )
  return Buffer.concat([header, metadataJson, payloadGzip])
}

export function inspectMarketDataPackage(buffer: Buffer): MarketDataPackageInspectResult {
  try {
    const parsed = parsePackageBuffer(buffer)
    return {
      valid: true,
      metadata: parsed.metadata,
      compressed_bytes: buffer.length - HEADER_SIZE - Buffer.byteLength(JSON.stringify(parsed.metadata)),
      sqlite_bytes: parsed.sqlite.length,
    }
  } catch (e) {
    return {
      valid: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

export function suggestPackageFilename(metadata?: MarketDataPackageMetadata): string {
  const date = metadata?.snapshot.latest_factor_date
    ?? metadata?.exported_at?.slice(0, 10)
    ?? new Date().toISOString().slice(0, 10)
  const safe = date.replace(/[^\d-]/g, '') || 'snapshot'
  return `opptrix-market-${safe}${PACKAGE_FILE_EXTENSION}`
}

export function importMarketDataPackageToDisk(
  buffer: Buffer,
  opts?: { dbPath?: string; backup?: boolean },
): MarketDataPackageMetadata {
  const parsed = parsePackageBuffer(buffer)
  const dbPath = opts?.dbPath ?? marketDbPath()
  const dir = path.dirname(dbPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  if (opts?.backup !== false && fs.existsSync(dbPath)) {
    const backupPath = `${dbPath}.bak.${Date.now()}`
    fs.copyFileSync(dbPath, backupPath)
  }

  const tmpPath = `${dbPath}.import.${process.pid}.${Date.now()}`
  fs.writeFileSync(tmpPath, parsed.sqlite)
  fs.renameSync(tmpPath, dbPath)
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = `${dbPath}${suffix}`
    if (fs.existsSync(sidecar)) {
      try { fs.unlinkSync(sidecar) } catch { /* ignore */ }
    }
  }

  const probe = new MarketDataStore(dbPath)
  try {
    probe.getStatus()
  } finally {
    probe.close()
  }

  return parsed.metadata
}
