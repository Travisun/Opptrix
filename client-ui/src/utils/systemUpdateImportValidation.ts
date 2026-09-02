const ARCHIVE_NAME_RE =
  /^opptrix-runtime-v(\d+\.\d+\.\d+(?:[-+][\w.-]*)?)\.(bin|tar\.gz|tgz)$/i
const SHA256_NAME_RE =
  /^opptrix-runtime-v(\d+\.\d+\.\d+(?:[-+][\w.-]*)?)\.sha256$/i
const SEMVER_RE = /^\d+\.\d+\.\d+(?:[-+][\w.-]*)?$/

export type ImportFilePickResult = {
  ok: boolean
  version: string | null
  message: string | null
}

function parseArchiveVersion(filename: string): string | null {
  const base = filename.trim().split(/[/\\]/).pop() ?? ''
  const m = ARCHIVE_NAME_RE.exec(base)
  if (!m?.[1]) return null
  const version = m[1].trim()
  return SEMVER_RE.test(version) ? version : null
}

function parseShaVersion(filename: string, archiveFilename?: string | null): string | null {
  const base = filename.trim().split(/[/\\]/).pop() ?? ''
  const m = SHA256_NAME_RE.exec(base)
  if (m?.[1]) {
    const version = m[1].trim()
    return SEMVER_RE.test(version) ? version : null
  }
  if (archiveFilename) {
    const archiveBase = archiveFilename.trim().split(/[/\\]/).pop() ?? ''
    if (archiveBase && base === `${archiveBase}.sha256`) {
      return parseArchiveVersion(archiveBase)
    }
  }
  return null
}

export function validateImportPackageFilename(filename: string): ImportFilePickResult {
  const version = parseArchiveVersion(filename)
  if (!version) {
    return {
      ok: false,
      version: null,
      message: '文件名需为 opptrix-runtime-v版本号.bin 或 .tar.gz',
    }
  }
  return { ok: true, version, message: null }
}

export function validateImportShaFilename(
  filename: string,
  packageFilename?: string | null,
): ImportFilePickResult {
  const version = parseShaVersion(filename, packageFilename)
  if (!version) {
    return {
      ok: false,
      version: null,
      message: packageFilename
        ? '需为与更新包同名的 .sha256，或 opptrix-runtime-v版本号.sha256'
        : '文件名需为 opptrix-runtime-v版本号.sha256，或与更新包同名',
    }
  }
  return { ok: true, version, message: null }
}

export async function readSha256SidecarHex(file: File): Promise<ImportFilePickResult> {
  const maxBytes = 512
  const slice = file.size > maxBytes ? file.slice(0, maxBytes) : file
  let text: string
  try {
    text = await slice.text()
  } catch {
    return { ok: false, version: null, message: '无法读取校验文件' }
  }
  const hex = (text.trim().split(/\s+/)[0] ?? '').toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    return { ok: false, version: null, message: '校验文件内容格式无效' }
  }
  return { ok: true, version: null, message: null }
}

export function validateImportPair(
  packageFile: File | null,
  shaFile: File | null,
): { ok: boolean; errors: string[]; version: string | null } {
  const errors: string[] = []
  if (!packageFile) errors.push('请选择更新包')
  if (!shaFile) errors.push('请选择校验文件')
  if (!packageFile || !shaFile) {
    return { ok: false, errors, version: null }
  }

  const pkg = validateImportPackageFilename(packageFile.name)
  if (!pkg.ok) errors.push(pkg.message ?? '更新包文件名无效')

  const sha = validateImportShaFilename(shaFile.name, packageFile.name)
  if (!sha.ok) errors.push(sha.message ?? '校验文件名无效')

  if (pkg.ok && sha.ok && pkg.version !== sha.version) {
    errors.push('更新包与校验文件的版本不一致')
  }

  return {
    ok: errors.length === 0,
    errors,
    version: pkg.ok ? pkg.version : null,
  }
}

export function formatImportFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}
