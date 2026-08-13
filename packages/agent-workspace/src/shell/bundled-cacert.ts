/**
 * 沙盒内自带 Mozilla CA bundle — pip/npm HTTPS 不依赖系统钥匙串。
 * 探测顺序：dist/assets → 包根 assets → OPPTRIX_SSL_CERT_FILE。
 * 物化到 grant 根 `.opptrix/cacert.pem`，确保路径落在 sandbox allowRead 内
 *（源包若在 homedir 下会被 denyRead 挡住）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const CA_BUNDLE_BASENAME = 'cacert.pem'

function isExistingFile(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isFile()
  } catch {
    return false
  }
}

/** 解析随包 CA 证书绝对路径；找不到返回 null */
export function resolveBundledCaCertPath(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url))
  // dist/shell → dist/assets；dist/shell → ../../assets（包根）；src/shell → ../assets
  const candidates = [
    path.join(here, '..', 'assets', CA_BUNDLE_BASENAME),
    path.join(here, '..', '..', 'assets', CA_BUNDLE_BASENAME),
    path.join(here, '..', '..', 'dist', 'assets', CA_BUNDLE_BASENAME),
  ]
  for (const candidate of candidates) {
    if (isExistingFile(candidate)) return path.resolve(candidate)
  }

  const envOverride = process.env.OPPTRIX_SSL_CERT_FILE?.trim()
  if (envOverride && isExistingFile(envOverride)) {
    return path.resolve(envOverride)
  }
  return null
}

/**
 * 将随包 CA 复制到 grant 根下 `.opptrix/cacert.pem`（永远在 allowRead 内）。
 * 源不存在或复制失败返回 null。
 */
export function materializeBundledCaCert(grantRootAbs: string): string | null {
  const source = resolveBundledCaCertPath()
  if (!source) return null
  const root = path.resolve(grantRootAbs)
  const destDir = path.join(root, '.opptrix')
  const dest = path.join(destDir, CA_BUNDLE_BASENAME)
  try {
    let needCopy = true
    if (isExistingFile(dest)) {
      const srcStat = fs.statSync(source)
      const destStat = fs.statSync(dest)
      if (srcStat.size === destStat.size && srcStat.mtimeMs === destStat.mtimeMs) {
        needCopy = false
      }
    }
    if (needCopy) {
      fs.mkdirSync(destDir, { recursive: true })
      fs.copyFileSync(source, dest)
      const srcStat = fs.statSync(source)
      fs.utimesSync(dest, srcStat.atime, srcStat.mtime)
    }
    return path.resolve(dest)
  } catch {
    return null
  }
}

/**
 * 向子进程 env 注入 SSL_CERT_FILE / REQUESTS_CA_BUNDLE / CURL_CA_BUNDLE /
 * NODE_EXTRA_CA_CERTS / PIP_CERT / CERT_PATH。
 * @param certPath 若传入则用之；否则 resolveBundledCaCertPath()
 * @returns 注入的证书路径；未找到则 null 且不改 env
 */
export function applyBundledCaCertEnv(
  env: NodeJS.ProcessEnv,
  certPath?: string | null,
): string | null {
  const resolved = (certPath && certPath.trim())
    ? path.resolve(certPath.trim())
    : resolveBundledCaCertPath()
  if (!resolved) return null
  env.SSL_CERT_FILE = resolved
  env.REQUESTS_CA_BUNDLE = resolved
  env.CURL_CA_BUNDLE = resolved
  env.NODE_EXTRA_CA_CERTS = resolved
  env.PIP_CERT = resolved
  env.CERT_PATH = resolved
  return resolved
}

/** 证书文件及其所在目录 — 供 sandbox allowRead */
export function bundledCaCertAllowReadPaths(): string[] {
  const certPath = resolveBundledCaCertPath()
  if (!certPath) return []
  const dir = path.dirname(certPath)
  if (dir === certPath) return [certPath]
  return [dir, certPath]
}
