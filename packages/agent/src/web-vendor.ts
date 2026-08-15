/**
 * 离线网页制品 vendor 根目录解析与 manifest 读取。
 * 查找顺序：OPPTRIX_WEB_VENDOR_DIR → OPPTRIX_RESOURCES_PATH/web-vendor
 * → monorepo apps/desktop/resources/web-vendor → cwd 相对回退。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export interface WebVendorFileEntry {
  id: string
  version: string
  files: string[]
  globals?: string[]
  description?: string
  tags?: string[]
}

export interface WebVendorManifest {
  version: string
  libs: WebVendorFileEntry[]
}

function candidateRoots(): string[] {
  const out: string[] = []
  const envDir = process.env.OPPTRIX_WEB_VENDOR_DIR?.trim()
  if (envDir) out.push(envDir)

  const resources = process.env.OPPTRIX_RESOURCES_PATH?.trim()
  if (resources) out.push(path.join(resources, 'web-vendor'))

  // packages/agent/{src|dist} → walk up looking for monorepo vendor dir
  try {
    let dir = path.dirname(fileURLToPath(import.meta.url))
    for (let i = 0; i < 8; i++) {
      out.push(path.join(dir, 'apps/desktop/resources/web-vendor'))
      const parent = path.dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  } catch {
    /* ignore */
  }

  out.push(path.join(process.cwd(), 'apps/desktop/resources/web-vendor'))
  out.push(path.join(process.cwd(), 'resources/web-vendor'))
  return out
}

export function resolveWebVendorRoot(): string | null {
  for (const root of candidateRoots()) {
    try {
      const resolved = path.resolve(root)
      if (fs.existsSync(path.join(resolved, 'manifest.json'))) return resolved
    } catch {
      /* continue */
    }
  }
  return null
}

export function readWebVendorManifest(): WebVendorManifest | null {
  const root = resolveWebVendorRoot()
  if (!root) return null
  try {
    const raw = fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')
    const parsed = JSON.parse(raw) as WebVendorManifest
    if (!parsed || !Array.isArray(parsed.libs)) return null
    return parsed
  } catch {
    return null
  }
}

/** 摘要：供 create_web / list_web_vendor 返回给模型 */
export function summarizeWebVendorLibs(manifest?: WebVendorManifest | null): Array<{
  id: string
  version: string
  entry?: string
  globals?: string[]
  description?: string
  tags?: string[]
  hrefPrefix: string
}> {
  const m = manifest ?? readWebVendorManifest()
  if (!m) return []
  return m.libs.map(lib => ({
    id: lib.id,
    version: lib.version,
    entry: lib.files[0],
    globals: lib.globals,
    description: lib.description,
    tags: lib.tags,
    hrefPrefix: `/opptrix-vendor/${lib.id}/`,
  }))
}

/**
 * 安全解析 vendor 内相对路径。
 * relativePath 如 `chart.js/chart.umd.min.js` 或 `manifest.json`
 */
export function resolveSafeVendorRelativePath(relativePath: string): string | null {
  const root = resolveWebVendorRoot()
  if (!root) return null
  let rel = relativePath.trim().replace(/\\/g, '/')
  if (rel.startsWith('/')) rel = rel.slice(1)
  if (
    !rel
    || rel.includes('\0')
    || rel.split('/').some(seg => seg === '..' || seg === '')
    || path.isAbsolute(rel)
  ) {
    return null
  }
  const expected = path.resolve(root, rel)
  const rootResolved = path.resolve(root)
  if (!expected.startsWith(rootResolved + path.sep) && expected !== rootResolved) {
    return null
  }
  if (!fs.existsSync(expected) || !fs.statSync(expected).isFile()) return null
  return expected
}
