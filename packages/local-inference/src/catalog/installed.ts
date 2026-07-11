import fs from 'node:fs'
import path from 'node:path'
import type { CatalogModel } from '../types.js'
import { listLlmsSearchDirs } from '../paths.js'

export type InstalledModel = {
  filename: string
  path: string
  sizeBytes: number
}

export function listInstalledGgufModels(repoRoot?: string): InstalledModel[] {
  const dirs = listLlmsSearchDirs(repoRoot)
  const seen = new Set<string>()
  const installed: InstalledModel[] = []

  for (const dir of dirs) {
    let names: string[] = []
    try {
      names = fs.readdirSync(dir).filter(name => name.toLowerCase().endsWith('.gguf'))
    } catch {
      continue
    }
    for (const name of names) {
      const fullPath = path.join(dir, name)
      if (seen.has(fullPath)) continue
      seen.add(fullPath)
      let sizeBytes = 0
      try {
        sizeBytes = fs.statSync(fullPath).size
      } catch { /* ignore */ }
      installed.push({ filename: name, path: fullPath, sizeBytes })
    }
  }

  return installed.sort((a, b) => a.filename.localeCompare(b.filename, 'zh-CN'))
}

export function isCatalogModelInstalled(item: CatalogModel, installedNames: Set<string>): boolean {
  const { filename, family, purpose } = item
  if (installedNames.has(filename)) return true

  if (family === 'hy-mt') {
    if (/Q4_K_M/i.test(filename)) {
      return [...installedNames].some(name => /hy[-_]?mt/i.test(name) && /Q4_K_M/i.test(name))
    }
    if (/Q8_0/i.test(filename)) {
      return [...installedNames].some(name => /hy[-_]?mt/i.test(name) && /Q8_0/i.test(name))
    }
  }

  if (family === 'smolvlm') {
    if (purpose === 'vision_mmproj') {
      return [...installedNames].some(name => /mmproj/i.test(name) && /smolvlm/i.test(name))
    }
    return [...installedNames].some(name => /smolvlm/i.test(name) && !/mmproj/i.test(name))
  }

  return false
}

export function resolveTranslationModelPath(
  repoRoot: string | undefined,
  preferredFilename = '__auto__',
): string | null {
  const installed = listInstalledGgufModels(repoRoot)
  const translation = installed.filter(p => {
    const name = path.basename(p.path)
    if (/smolvlm|mmproj/i.test(name)) return false
    return /hy[-_]?mt/i.test(name)
  })

  const preferred = String(preferredFilename ?? '__auto__').trim()
  if (preferred && preferred !== '__auto__') {
    const exact = translation.find(p => path.basename(p.path) === preferred)
    if (exact) return exact.path
  }

  const q4 = translation.find(p => /Q4_K_M/i.test(path.basename(p.path)))
  if (q4) return q4.path
  return translation[0]?.path ?? null
}
