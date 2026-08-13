/**
 * 沙盒内自带 Mozilla CA bundle — pip/npm HTTPS 不依赖系统钥匙串。
 * 探测顺序：dist/assets → 包根 assets → OPPTRIX_SSL_CERT_FILE。
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
 * 向子进程 env 注入 SSL_CERT_FILE / REQUESTS_CA_BUNDLE / CURL_CA_BUNDLE / NODE_EXTRA_CA_CERTS。
 * @returns 注入的证书路径；未找到则 null 且不改 env
 */
export function applyBundledCaCertEnv(env: NodeJS.ProcessEnv): string | null {
  const certPath = resolveBundledCaCertPath()
  if (!certPath) return null
  env.SSL_CERT_FILE = certPath
  env.REQUESTS_CA_BUNDLE = certPath
  env.CURL_CA_BUNDLE = certPath
  env.NODE_EXTRA_CA_CERTS = certPath
  return certPath
}

/** 证书文件及其所在目录 — 供 sandbox allowRead */
export function bundledCaCertAllowReadPaths(): string[] {
  const certPath = resolveBundledCaCertPath()
  if (!certPath) return []
  const dir = path.dirname(certPath)
  if (dir === certPath) return [certPath]
  return [dir, certPath]
}
