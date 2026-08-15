import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { resolvePythonRuntimeRoot } from '@opptrix/shared'
import { installDirName, type PythonPlatformArtifact } from './catalog.js'
import {
  linkPythonCurrent,
  pythonBinaryCandidates,
  readInstallManifest,
  type PythonInstallManifest,
} from './installer.js'

export const BUNDLED_PYTHON_MANIFEST = 'bundle-manifest.json'

export interface BundledPythonManifest {
  version: string
  platformKey: string
  kind: PythonPlatformArtifact['kind']
  stagedAt: string
}

/**
 * 安装包内 Python 树根目录。
 * 优先 `OPPTRIX_PYTHON_BUNDLED_DIR`；否则 `OPPTRIX_RESOURCES_PATH` / Electron resources 下的 `python/`。
 */
export function resolveBundledPythonRoot(): string | null {
  const fromEnv = process.env.OPPTRIX_PYTHON_BUNDLED_DIR?.trim()
  if (fromEnv) return path.resolve(fromEnv)

  const resources = process.env.OPPTRIX_RESOURCES_PATH?.trim()
  if (resources) {
    return path.join(path.resolve(resources), 'python')
  }

  // ELECTRON_RUN_AS_NODE / 测试：从 runtime-stage 旁推（桌面开发少见）
  const stage = process.env.OPPTRIX_RUNTIME_STAGE?.trim()
  if (stage) {
    const sibling = path.join(path.dirname(stage), 'python')
    if (fs.existsSync(sibling)) return sibling
    const nested = path.join(stage, 'python')
    if (fs.existsSync(nested)) return nested
  }

  return null
}

export function bundledPythonCandidatePaths(bundleRoot: string): string[] {
  return pythonBinaryCandidates(bundleRoot)
}

export async function readBundledPythonManifest(
  bundleRoot: string,
): Promise<BundledPythonManifest | null> {
  const manifestPath = path.join(bundleRoot, BUNDLED_PYTHON_MANIFEST)
  try {
    const raw = await fsPromises.readFile(manifestPath, 'utf8')
    const parsed = JSON.parse(raw) as BundledPythonManifest
    if (
      typeof parsed.version !== 'string'
      || typeof parsed.platformKey !== 'string'
      || typeof parsed.kind !== 'string'
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fsPromises.access(p)
    return true
  } catch {
    return false
  }
}

async function hasPythonBinary(root: string): Promise<boolean> {
  for (const candidate of pythonBinaryCandidates(root)) {
    if (await pathExists(candidate)) return true
  }
  return false
}

/**
 * 若用户托管 `current` 尚无可用解释器，则从安装包内 Python 树复制到
 * `~/.opptrix/runtimes/python/<version>-<platform>/` 并链接 `current`。
 * 已有用户托管时不覆盖。
 */
export async function seedBundledPythonIfNeeded(): Promise<{
  seeded: boolean
  reason: string
  installDir?: string
}> {
  const runtimeRoot = resolvePythonRuntimeRoot()
  const currentRoot = path.join(runtimeRoot, 'current')
  if (await hasPythonBinary(currentRoot)) {
    return { seeded: false, reason: 'user_current_present' }
  }

  const bundleRoot = resolveBundledPythonRoot()
  if (!bundleRoot || !(await hasPythonBinary(bundleRoot))) {
    return { seeded: false, reason: 'bundle_missing' }
  }

  const bundledManifest = await readBundledPythonManifest(bundleRoot)
  const version = bundledManifest?.version ?? 'bundled'
  const platformKey = bundledManifest?.platformKey ?? `${process.platform}-${process.arch}`
  const kind = bundledManifest?.kind ?? 'standalone'

  const artifactLike = {
    version,
    platformKey,
    kind,
  } as PythonPlatformArtifact
  const installDir = path.join(runtimeRoot, installDirName(artifactLike))

  await fsPromises.mkdir(runtimeRoot, { recursive: true })
  await fsPromises.rm(installDir, { recursive: true, force: true })
  await fsPromises.cp(bundleRoot, installDir, { recursive: true })

  const pythonPath = pythonBinaryCandidates(installDir).find(p => fs.existsSync(p))
  if (!pythonPath) {
    await fsPromises.rm(installDir, { recursive: true, force: true })
    return { seeded: false, reason: 'seed_copy_incomplete' }
  }

  await linkPythonCurrent(runtimeRoot, installDir)

  const installManifest: PythonInstallManifest = {
    version,
    platformKey,
    kind,
    installedAt: new Date().toISOString(),
    installDir,
    runtimeRoot: installDir,
    pythonPath,
    pythonVersion: `Python ${version}`,
  }
  await fsPromises.writeFile(
    path.join(installDir, 'manifest.json'),
    `${JSON.stringify(installManifest, null, 2)}\n`,
    'utf8',
  )

  return { seeded: true, reason: 'seeded_from_bundle', installDir }
}

/** 测试用：读取用户 installDir 的 manifest（若有） */
export async function readUserPythonInstallManifest(
  installDir: string,
): Promise<PythonInstallManifest | null> {
  return readInstallManifest(installDir)
}
