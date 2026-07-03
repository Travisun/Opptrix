import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolveUserDataRoot } from '@opptrix/shared'
import {
  inspectOppxPackage,
  unpackOppx,
  validatePluginDirectory,
  type ProviderPluginManifest,
} from './oppx.js'

export interface InstalledProviderEntry {
  providerId: string
  version: string
  title?: string
  installedAt: string
  source: 'oppx' | 'directory'
  path: string
}

export interface InstalledProvidersIndex {
  version: 1
  providers: Record<string, InstalledProviderEntry>
}

export function providersRootDir(dataRoot = resolveUserDataRoot()): string {
  return path.join(dataRoot, 'providers')
}

export function installedIndexPath(dataRoot = resolveUserDataRoot()): string {
  return path.join(providersRootDir(dataRoot), 'installed.json')
}

export function installedProviderDir(providerId: string, dataRoot = resolveUserDataRoot()): string {
  return path.join(providersRootDir(dataRoot), providerId)
}

export function readInstalledIndex(dataRoot = resolveUserDataRoot()): InstalledProvidersIndex {
  const indexPath = installedIndexPath(dataRoot)
  if (!fs.existsSync(indexPath)) {
    return { version: 1, providers: {} }
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as InstalledProvidersIndex
    if (parsed?.version !== 1 || typeof parsed.providers !== 'object' || !parsed.providers) {
      return { version: 1, providers: {} }
    }
    return parsed
  } catch {
    return { version: 1, providers: {} }
  }
}

export function writeInstalledIndex(index: InstalledProvidersIndex, dataRoot = resolveUserDataRoot()): void {
  const root = providersRootDir(dataRoot)
  fs.mkdirSync(root, { recursive: true })
  fs.writeFileSync(installedIndexPath(dataRoot), `${JSON.stringify(index, null, 2)}\n`, 'utf8')
}

function copyDirectoryRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true })
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name)
    const to = path.join(dest, name)
    const stat = fs.statSync(from)
    if (stat.isDirectory()) {
      copyDirectoryRecursive(from, to)
    } else if (stat.isFile()) {
      fs.copyFileSync(from, to)
    }
  }
}

function removeDirectoryRecursive(dir: string): void {
  if (!fs.existsSync(dir)) return
  fs.rmSync(dir, { recursive: true, force: true })
}

function upsertInstalledEntry(
  index: InstalledProvidersIndex,
  manifest: ProviderPluginManifest,
  destDir: string,
  source: InstalledProviderEntry['source'],
): InstalledProviderEntry {
  const entry: InstalledProviderEntry = {
    providerId: manifest.providerId,
    version: manifest.version,
    title: manifest.title,
    installedAt: new Date().toISOString(),
    source,
    path: destDir,
  }
  index.providers[manifest.providerId] = entry
  return entry
}

export function installFromDirectory(
  sourceDir: string,
  opts?: { dataRoot?: string },
): InstalledProviderEntry {
  const dataRoot = opts?.dataRoot ?? resolveUserDataRoot()
  const resolvedSource = path.resolve(sourceDir)
  if (!fs.existsSync(resolvedSource) || !fs.statSync(resolvedSource).isDirectory()) {
    throw new Error(`插件目录不存在：${resolvedSource}`)
  }

  const manifest = validatePluginDirectory(resolvedSource)
  const destDir = installedProviderDir(manifest.providerId, dataRoot)
  removeDirectoryRecursive(destDir)
  copyDirectoryRecursive(resolvedSource, destDir)

  const index = readInstalledIndex(dataRoot)
  const entry = upsertInstalledEntry(index, manifest, destDir, 'directory')
  writeInstalledIndex(index, dataRoot)
  return entry
}

export function installFromOppx(
  oppxPath: string,
  opts?: { dataRoot?: string },
): InstalledProviderEntry {
  const dataRoot = opts?.dataRoot ?? resolveUserDataRoot()
  const resolvedPath = path.resolve(oppxPath)
  if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
    throw new Error(`插件包不存在：${resolvedPath}`)
  }

  const inspected = inspectOppxPackage(resolvedPath)
  if (!inspected.valid || !inspected.metadata) {
    throw new Error(inspected.error ?? '插件包无效')
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `oppx-install-${process.pid}-`))
  try {
    unpackOppx(resolvedPath, tempDir)
    const manifest = validatePluginDirectory(tempDir)
    if (manifest.providerId !== inspected.metadata.provider_id) {
      throw new Error('插件包元数据与 provider.json 中的 id 不一致')
    }
    if (manifest.version !== inspected.metadata.version) {
      throw new Error('插件包元数据与 provider.json 中的 version 不一致')
    }

    const destDir = installedProviderDir(manifest.providerId, dataRoot)
    removeDirectoryRecursive(destDir)
    copyDirectoryRecursive(tempDir, destDir)

    const index = readInstalledIndex(dataRoot)
    const entry = upsertInstalledEntry(index, manifest, destDir, 'oppx')
    writeInstalledIndex(index, dataRoot)
    return entry
  } finally {
    removeDirectoryRecursive(tempDir)
  }
}

export function uninstall(providerId: string, opts?: { dataRoot?: string }): boolean {
  const dataRoot = opts?.dataRoot ?? resolveUserDataRoot()
  const index = readInstalledIndex(dataRoot)
  const existing = index.providers[providerId]
  if (!existing) return false

  removeDirectoryRecursive(existing.path)
  delete index.providers[providerId]
  writeInstalledIndex(index, dataRoot)
  return true
}

export function listInstalledProviders(dataRoot = resolveUserDataRoot()): InstalledProviderEntry[] {
  return Object.values(readInstalledIndex(dataRoot).providers)
    .sort((a, b) => a.providerId.localeCompare(b.providerId))
}
