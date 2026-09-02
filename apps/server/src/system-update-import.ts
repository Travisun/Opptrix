/**
 * Offline import of CDN-format hot-update packages (multipart upload → extract).
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  ensureLayout,
  evaluateRuntimeRequires,
  extractUpdateArchive,
  isVersionBlocked,
  patchState,
  readRuntimeMarker,
  readState,
  resolveSystemPaths,
  sha256File,
  type SystemUpdateState,
} from '@opptrix/system-update'
import {
  compareSemver,
  fetchHotLatest,
  hotPackageUrls,
  parseSemver,
  readChannelEnv,
} from './system-update-channel.js'
import { buildSystemUpdateUserAgent } from './system-update-user-agent.js'
import {
  buildSystemUpdateStatus,
  type SystemUpdateStatusDto,
} from './system-update-service.js'

const ARCHIVE_NAME_RE =
  /^opptrix-runtime-v(\d+\.\d+\.\d+(?:[-+][\w.-]*)?)\.(bin|tar\.gz|tgz)$/i
const SHA256_NAME_RE =
  /^opptrix-runtime-v(\d+\.\d+\.\d+(?:[-+][\w.-]*)?)\.sha256$/i

export class SystemUpdateImportError extends Error {
  readonly status: number
  readonly code: string

  constructor(message: string, status: number, code: string) {
    super(message)
    this.name = 'SystemUpdateImportError'
    this.status = status
    this.code = code
  }
}

/** Parse semver from CDN-style archive basename. */
export function parseVersionFromArchiveFilename(filename: string): string | null {
  const base = path.basename(String(filename ?? '').trim())
  const m = ARCHIVE_NAME_RE.exec(base)
  if (!m?.[1]) return null
  const version = m[1].trim()
  return parseSemver(version) ? version : null
}

/** Parse semver from CDN-style `.sha256` sidecar basename. */
export function parseVersionFromSha256Filename(
  filename: string,
  archiveFilename?: string,
): string | null {
  const base = path.basename(String(filename ?? '').trim())
  const m = SHA256_NAME_RE.exec(base)
  if (m?.[1]) {
    const version = m[1].trim()
    return parseSemver(version) ? version : null
  }
  if (archiveFilename) {
    const archiveBase = path.basename(String(archiveFilename).trim())
    if (archiveBase && base === `${archiveBase}.sha256`) {
      return parseVersionFromArchiveFilename(archiveBase)
    }
  }
  return null
}

function readSidecarHex(shaPath: string): string {
  const text = fs.readFileSync(shaPath, 'utf8').trim()
  const first = text.split(/\s+/)[0] ?? ''
  const hex = first.toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    throw new SystemUpdateImportError('校验文件格式无效', 400, 'invalid_sha_sidecar')
  }
  return hex
}

/** Refuse blocked versions and versions not newer than any blocked entry. */
export function assertImportVersionAllowed(
  state: SystemUpdateState,
  version: string,
): void {
  if (isVersionBlocked(state, version)) {
    throw new SystemUpdateImportError(
      '此版本暂时无法安装，请等待后续新版本',
      409,
      'version_blocked',
    )
  }
  const blocked = state.blockedVersions ?? []
  for (const b of blocked) {
    if (compareSemver(version, b) <= 0) {
      throw new SystemUpdateImportError(
        '此版本暂时无法安装，请等待后续新版本',
        409,
        'version_blocked',
      )
    }
  }
}

async function crossCheckCdnSha256WhenOnline(
  version: string,
  localHex: string,
): Promise<void> {
  const env = readChannelEnv()
  let latest: Awaited<ReturnType<typeof fetchHotLatest>> = null
  try {
    latest = await fetchHotLatest(env, { timeoutMs: 20_000 })
  } catch {
    return
  }
  if (!latest || latest.version !== version) return

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 20_000)
  try {
    const res = await fetch(latest.sha256Url, {
      method: 'GET',
      headers: {
        Accept: 'text/plain,*/*',
        'User-Agent': buildSystemUpdateUserAgent(version),
      },
      signal: ac.signal,
    })
    if (!res.ok) return
    const text = await res.text()
    const cdnHex = text.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
    if (!/^[0-9a-f]{64}$/.test(cdnHex)) return
    if (cdnHex !== localHex) {
      throw new SystemUpdateImportError(
        '更新包校验值与官方通道不一致',
        400,
        'bad_digest',
      )
    }
  } catch (err) {
    if (err instanceof SystemUpdateImportError) throw err
    /* offline / CDN unreachable — local sidecar is enough */
  } finally {
    clearTimeout(timer)
  }
}

export interface ImportUpdateFilesInput {
  packagePath: string
  packageOriginalName: string
  sha256Path: string
  sha256OriginalName: string
}

export async function importUpdateFromFiles(
  input: ImportUpdateFilesInput,
): Promise<{ version: string; status: SystemUpdateStatusDto }> {
  const archiveVersion = parseVersionFromArchiveFilename(input.packageOriginalName)
  if (!archiveVersion) {
    throw new SystemUpdateImportError(
      '更新包文件名无效，需为 opptrix-runtime-v版本号.bin 或 .tar.gz',
      400,
      'invalid_archive',
    )
  }

  const shaVersion = parseVersionFromSha256Filename(
    input.sha256OriginalName,
    input.packageOriginalName,
  )
  if (!shaVersion) {
    throw new SystemUpdateImportError(
      '校验文件名无效，需为 opptrix-runtime-v版本号.sha256 或与更新包同名的 .sha256',
      400,
      'missing_sha',
    )
  }
  if (shaVersion !== archiveVersion) {
    throw new SystemUpdateImportError(
      '更新包与校验文件的版本不一致',
      400,
      'invalid_archive',
    )
  }

  const version = archiveVersion
  const state = readState()
  assertImportVersionAllowed(state, version)

  if (!fs.existsSync(input.sha256Path)) {
    throw new SystemUpdateImportError('缺少校验文件', 400, 'missing_sha')
  }
  if (!fs.existsSync(input.packagePath)) {
    throw new SystemUpdateImportError('缺少更新包', 400, 'invalid_archive')
  }

  const localHex = readSidecarHex(input.sha256Path)
  let actualHex: string
  try {
    actualHex = sha256File(input.packagePath)
  } catch {
    throw new SystemUpdateImportError('无法读取更新包', 400, 'invalid_archive')
  }
  if (actualHex !== localHex) {
    throw new SystemUpdateImportError(
      '更新包校验未通过，请确认文件完整且未被改动',
      400,
      'bad_digest',
    )
  }

  await crossCheckCdnSha256WhenOnline(version, localHex)

  ensureLayout()
  const { updateDir } = resolveSystemPaths()
  const pkgNames = hotPackageUrls(version, readChannelEnv().cdnBase)
  const destArchive = path.join(updateDir, pkgNames.binName)
  const destSha = path.join(updateDir, pkgNames.sha256Name)

  fs.mkdirSync(updateDir, { recursive: true })
  fs.copyFileSync(input.packagePath, destArchive)
  fs.copyFileSync(input.sha256Path, destSha)

  let extracted: ReturnType<typeof extractUpdateArchive>
  try {
    extracted = extractUpdateArchive({
      archivePath: destArchive,
      version,
      sha256Path: destSha,
      markPending: false,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/sha256|sidecar|mismatch/i.test(msg)) {
      throw new SystemUpdateImportError(
        '更新包校验未通过，请确认文件完整且未被改动',
        400,
        'bad_digest',
      )
    }
    throw new SystemUpdateImportError(
      '更新包无法解压或内容无效',
      400,
      'invalid_archive',
    )
  }

  evaluateRuntimeRequires(readRuntimeMarker(extracted.slotPath))

  const size = fs.existsSync(destArchive) ? fs.statSync(destArchive).size : 0
  patchState({
    pendingVersion: version,
    uiPhase: 'normal',
    downloadJob: {
      id: `import-${version}`,
      version,
      status: 'done',
      bytesReceived: size,
      bytesTotal: size,
      error: null,
    },
  })

  return {
    version,
    status: buildSystemUpdateStatus(),
  }
}
