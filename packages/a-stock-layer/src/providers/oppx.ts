import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'

/** Opptrix Provider Plugin package — proprietary `.oppx` format. */
export const PACKAGE_MAGIC = 'OPPX'
export const PACKAGE_FORMAT_VERSION = 1
export const MIN_SUPPORTED_PACKAGE_FORMAT_VERSION = 1
export const PACKAGE_KIND = 'provider_plugin' as const
export const PACKAGE_APP_ID = 'opptrix' as const
export const PACKAGE_FILE_EXTENSION = '.oppx'
export const PACKAGE_MIME = 'application/vnd.opptrix.provider+oppx'
export const PROVIDER_SPEC_VERSION = 1

const HEADER_SIZE = 68
const TAR_BLOCK = 512

export interface ProviderPluginManifest {
  /** Canonical provider id (alias: legacy `id` field) */
  providerId: string
  version: string
  title?: string
  subtitle?: string
  marketGroup?: string
  /** Relative entry module — defaults to dist/index.js */
  entry?: string
}

export function resolveProviderId(raw: Record<string, unknown>): string {
  return String(raw.providerId ?? raw.id ?? '').trim()
}

export interface OppxPackageMetadata {
  app: typeof PACKAGE_APP_ID
  kind: typeof PACKAGE_KIND
  format_version: number
  exported_at: string
  provider_id: string
  version: string
  title?: string
  pack_signature: string
  compatible: {
    min_format_version: number
    max_format_version: number
  }
}

export interface OppxPackageInspectResult {
  valid: boolean
  error?: string
  metadata?: OppxPackageMetadata
  compressed_bytes?: number
  tarball_bytes?: number
}

interface ParsedPackage {
  metadata: OppxPackageMetadata
  tarball: Buffer
}

interface TarEntry {
  relativePath: string
  content: Buffer
}

function packSignature(payloadSha256: Buffer): string {
  return createHash('sha256')
    .update(`opptrix|OPPX|v1|${payloadSha256.toString('hex')}`)
    .digest('hex')
    .slice(0, 32)
}

function readProviderManifest(dir: string): ProviderPluginManifest {
  const manifestPath = path.join(dir, 'provider.json')
  if (!fs.existsSync(manifestPath)) {
    throw new Error('缺少 provider.json')
  }
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
  } catch {
    throw new Error('provider.json 解析失败')
  }
  const providerId = resolveProviderId(parsed)
  if (!providerId) throw new Error('provider.json 缺少 providerId')
  const version = typeof parsed.version === 'string' ? parsed.version.trim() : ''
  if (!version) throw new Error('provider.json 缺少 version')
  return {
    providerId,
    version,
    title: typeof parsed.title === 'string' ? parsed.title : undefined,
    subtitle: typeof parsed.subtitle === 'string' ? parsed.subtitle : undefined,
    marketGroup: typeof parsed.marketGroup === 'string' ? parsed.marketGroup : undefined,
    entry: typeof parsed.entry === 'string' ? parsed.entry : undefined,
  }
}

function collectDirectoryEntries(dir: string, base = dir): TarEntry[] {
  const entries: TarEntry[] = []
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    const stat = fs.statSync(full)
    const relativePath = path.relative(base, full).split(path.sep).join('/')
    if (stat.isDirectory()) {
      entries.push(...collectDirectoryEntries(full, base))
    } else if (stat.isFile()) {
      entries.push({ relativePath, content: fs.readFileSync(full) })
    }
  }
  return entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
}

function writeTarString(buf: Buffer, offset: number, value: string, length: number): void {
  buf.write(value.slice(0, length - 1), offset, length - 1, 'ascii')
}

function writeTarOctal(buf: Buffer, offset: number, value: number, length: number): void {
  const str = value.toString(8).padStart(length - 1, '0')
  writeTarString(buf, offset, str, length)
}

function createTarHeader(relativePath: string, size: number): Buffer {
  const header = Buffer.alloc(TAR_BLOCK, 0)
  writeTarString(header, 0, relativePath, 100)
  writeTarOctal(header, 100, 0o644, 8)
  writeTarOctal(header, 108, 0, 8)
  writeTarOctal(header, 116, 0, 8)
  writeTarOctal(header, 124, size, 12)
  writeTarOctal(header, 136, Math.floor(Date.now() / 1000), 12)
  header.write('        ', 148, 8, 'ascii')
  header.write('0', 156, 1, 'ascii')
  writeTarString(header, 257, 'ustar', 6)
  writeTarString(header, 263, '00', 2)

  let checksum = 0
  for (let i = 0; i < TAR_BLOCK; i++) checksum += header[i]!
  writeTarOctal(header, 148, checksum, 8)
  return header
}

function encodeTar(entries: TarEntry[]): Buffer {
  const blocks: Buffer[] = []
  for (const entry of entries) {
    blocks.push(createTarHeader(entry.relativePath, entry.content.length))
    blocks.push(entry.content)
    const pad = (TAR_BLOCK - (entry.content.length % TAR_BLOCK)) % TAR_BLOCK
    if (pad) blocks.push(Buffer.alloc(pad))
  }
  blocks.push(Buffer.alloc(TAR_BLOCK))
  blocks.push(Buffer.alloc(TAR_BLOCK))
  return Buffer.concat(blocks)
}

function readTarCString(buf: Buffer, offset: number, length: number): string {
  const end = buf.indexOf(0, offset)
  const sliceEnd = end >= 0 && end < offset + length ? end : offset + length
  return buf.toString('utf8', offset, sliceEnd).trim()
}

function decodeTar(tar: Buffer): TarEntry[] {
  const entries: TarEntry[] = []
  let offset = 0
  while (offset + TAR_BLOCK <= tar.length) {
    const header = tar.subarray(offset, offset + TAR_BLOCK)
    if (header.every(b => b === 0)) break

    const relativePath = readTarCString(header, 0, 100)
    const size = parseInt(readTarCString(header, 124, 12), 8)
    if (!relativePath || !Number.isFinite(size) || size < 0) {
      throw new Error('插件包内部归档格式无效')
    }

    offset += TAR_BLOCK
    const content = tar.subarray(offset, offset + size)
    offset += size
    offset += (TAR_BLOCK - (size % TAR_BLOCK)) % TAR_BLOCK
    entries.push({ relativePath, content })
  }
  return entries
}

function extractTarToDirectory(tar: Buffer, destDir: string): void {
  fs.mkdirSync(destDir, { recursive: true })
  for (const entry of decodeTar(tar)) {
    const outPath = path.join(destDir, entry.relativePath)
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.writeFileSync(outPath, entry.content)
  }
}

function encodeHeader(
  formatVersion: number,
  exportedAtMs: number,
  specVersion: number,
  metadataLength: number,
  payloadLength: number,
  payloadSha256: Buffer,
): Buffer {
  const header = Buffer.alloc(HEADER_SIZE)
  header.write(PACKAGE_MAGIC, 0, 4, 'ascii')
  header.writeUInt32LE(formatVersion, 4)
  header.writeBigUInt64LE(BigInt(exportedAtMs), 8)
  header.writeUInt32LE(specVersion, 16)
  header.writeUInt32LE(metadataLength, 20)
  header.writeBigUInt64LE(BigInt(payloadLength), 24)
  payloadSha256.copy(header, 32, 0, 32)
  return header
}

function decodeHeader(buffer: Buffer): {
  formatVersion: number
  exportedAtMs: number
  specVersion: number
  metadataLength: number
  payloadLength: number
  payloadSha256: Buffer
} {
  if (buffer.length < HEADER_SIZE) {
    throw new Error('文件过短，不是有效的 Opptrix 数据源插件包')
  }
  const magic = buffer.toString('ascii', 0, 4)
  if (magic !== PACKAGE_MAGIC) {
    throw new Error('无法识别该文件：仅支持 Opptrix 数据源插件包（.oppx）')
  }
  return {
    formatVersion: buffer.readUInt32LE(4),
    exportedAtMs: Number(buffer.readBigUInt64LE(8)),
    specVersion: buffer.readUInt32LE(16),
    metadataLength: buffer.readUInt32LE(20),
    payloadLength: Number(buffer.readBigUInt64LE(24)),
    payloadSha256: buffer.subarray(32, 64),
  }
}

function validateMetadata(metadata: OppxPackageMetadata, payloadSha256: Buffer): void {
  if (metadata.app !== PACKAGE_APP_ID) {
    throw new Error('该插件包不是 Opptrix 导出的数据源插件')
  }
  if (metadata.kind !== PACKAGE_KIND) {
    throw new Error('插件包类型不匹配（需要数据源插件）')
  }
  if (metadata.format_version < MIN_SUPPORTED_PACKAGE_FORMAT_VERSION) {
    throw new Error(`插件包格式过旧（v${metadata.format_version}），请升级 Opptrix 后重试`)
  }
  if (metadata.format_version > PACKAGE_FORMAT_VERSION) {
    throw new Error(`插件包格式较新（v${metadata.format_version}），请升级 Opptrix 后再导入`)
  }
  const expectedSig = packSignature(payloadSha256)
  if (metadata.pack_signature !== expectedSig) {
    throw new Error('插件包校验失败，文件可能已损坏或被篡改')
  }
}

function readOppxBuffer(source: Buffer | string): Buffer {
  if (Buffer.isBuffer(source)) return source
  return fs.readFileSync(source)
}

function parsePackageBuffer(buffer: Buffer): ParsedPackage {
  const header = decodeHeader(buffer)
  if (header.formatVersion < MIN_SUPPORTED_PACKAGE_FORMAT_VERSION
    || header.formatVersion > PACKAGE_FORMAT_VERSION) {
    throw new Error(`不支持的插件包格式版本 v${header.formatVersion}`)
  }

  const metaStart = HEADER_SIZE
  const metaEnd = metaStart + header.metadataLength
  const payloadStart = metaEnd
  const payloadEnd = payloadStart + header.payloadLength
  if (buffer.length < payloadEnd) {
    throw new Error('插件包不完整，请重新下载或导出')
  }

  let metadata: OppxPackageMetadata
  try {
    metadata = JSON.parse(buffer.toString('utf8', metaStart, metaEnd)) as OppxPackageMetadata
  } catch {
    throw new Error('插件包元数据解析失败')
  }

  const payloadGzip = buffer.subarray(payloadStart, payloadEnd)
  const payloadSha256 = createHash('sha256').update(payloadGzip).digest()
  if (!payloadSha256.equals(header.payloadSha256)) {
    throw new Error('插件包内容校验失败，文件可能已损坏')
  }

  validateMetadata(metadata, payloadSha256)

  let tarball: Buffer
  try {
    tarball = gunzipSync(payloadGzip)
  } catch {
    throw new Error('插件包解压失败，文件可能已损坏')
  }

  return { metadata, tarball }
}

function buildMetadata(manifest: ProviderPluginManifest, payloadSha256: Buffer): OppxPackageMetadata {
  const exportedAt = new Date().toISOString()
  return {
    app: PACKAGE_APP_ID,
    kind: PACKAGE_KIND,
    format_version: PACKAGE_FORMAT_VERSION,
    exported_at: exportedAt,
    provider_id: manifest.providerId,
    version: manifest.version,
    title: manifest.title,
    pack_signature: packSignature(payloadSha256),
    compatible: {
      min_format_version: MIN_SUPPORTED_PACKAGE_FORMAT_VERSION,
      max_format_version: PACKAGE_FORMAT_VERSION,
    },
  }
}

export function validatePluginDirectory(dir: string): ProviderPluginManifest {
  const manifest = readProviderManifest(dir)
  const entry = manifest.entry?.trim() || 'dist/index.js'
  const entryPath = path.join(dir, entry)
  if (!fs.existsSync(entryPath)) {
    throw new Error(`插件目录缺少入口文件：${entry}`)
  }
  return manifest
}

export function packOppx(dir: string, outPath: string): Buffer {
  const manifest = validatePluginDirectory(dir)
  const entries = collectDirectoryEntries(dir)
  if (!entries.length) throw new Error('插件目录为空')

  const tarball = encodeTar(entries)
  const payloadGzip = gzipSync(tarball, { level: 6 })
  const payloadSha256 = createHash('sha256').update(payloadGzip).digest()
  const metadata = buildMetadata(manifest, payloadSha256)
  const metadataJson = Buffer.from(JSON.stringify(metadata), 'utf8')
  const exportedAtMs = Date.parse(metadata.exported_at)
  const header = encodeHeader(
    PACKAGE_FORMAT_VERSION,
    Number.isFinite(exportedAtMs) ? exportedAtMs : Date.now(),
    PROVIDER_SPEC_VERSION,
    metadataJson.length,
    payloadGzip.length,
    payloadSha256,
  )
  const buffer = Buffer.concat([header, metadataJson, payloadGzip])
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, buffer)
  return buffer
}

export function unpackOppx(source: Buffer | string, destDir: string): OppxPackageMetadata {
  const buffer = readOppxBuffer(source)
  const parsed = parsePackageBuffer(buffer)
  extractTarToDirectory(parsed.tarball, destDir)
  return parsed.metadata
}

/** Optional publisher signature hook — currently validates pack_signature only. */
export function validateOppxSignature(source: Buffer | string, _opts?: { publicKeyPem?: string }): boolean {
  try {
    parsePackageBuffer(readOppxBuffer(source))
    return true
  } catch {
    return false
  }
}

export function inspectOppxPackage(source: Buffer | string): OppxPackageInspectResult {
  try {
    const parsed = parsePackageBuffer(readOppxBuffer(source))
    return {
      valid: true,
      metadata: parsed.metadata,
      compressed_bytes: readOppxBuffer(source).length - HEADER_SIZE - Buffer.byteLength(JSON.stringify(parsed.metadata)),
      tarball_bytes: parsed.tarball.length,
    }
  } catch (e) {
    return {
      valid: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

export function suggestOppxFilename(metadata?: OppxPackageMetadata): string {
  const id = metadata?.provider_id ?? 'provider'
  const version = metadata?.version ?? '0.0.0'
  const safeId = id.replace(/[^\w.-]+/g, '-')
  const safeVer = version.replace(/[^\w.-]+/g, '-')
  return `opptrix-provider-${safeId}-${safeVer}${PACKAGE_FILE_EXTENSION}`
}
