import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { resolvePythonRuntimeRoot } from '@opptrix/shared'
import type { PythonPlatformArtifact } from './catalog.js'
import { installDirName } from './catalog.js'

const execFileAsync = promisify(execFile)

export interface PythonInstallManifest {
  version: string
  platformKey: string
  kind: PythonPlatformArtifact['kind']
  installedAt: string
  installDir: string
  runtimeRoot: string
  pythonPath: string
  pythonVersion: string
}

export interface PythonInstallResult {
  manifest: PythonInstallManifest
  installDir: string
  runtimeRoot: string
  pythonPath: string
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function extractArchive(archivePath: string, destDir: string): Promise<void> {
  await fs.mkdir(destDir, { recursive: true })
  if (process.platform === 'win32') {
    await execFileAsync(
      'tar',
      ['-xf', archivePath, '-C', destDir],
      { timeout: 10 * 60 * 1000 },
    )
    return
  }
  await execFileAsync(
    'tar',
    ['-xzf', archivePath, '-C', destDir],
    { timeout: 10 * 60 * 1000 },
  )
}

async function installMiniconda(scriptPath: string, installDir: string): Promise<void> {
  // Miniconda 要求 -p 目标目录不存在；由安装脚本自行创建
  await execFileAsync(
    'bash',
    [scriptPath, '-b', '-p', installDir],
    { timeout: 15 * 60 * 1000 },
  )
}

async function findRuntimeRoot(installDir: string, kind: PythonPlatformArtifact['kind']): Promise<string> {
  if (kind === 'embed' || kind === 'miniconda') return installDir
  const nested = path.join(installDir, 'python')
  if (await fileExists(path.join(nested, 'bin', 'python3'))) return nested
  if (await fileExists(path.join(nested, 'bin', 'python'))) return nested
  if (await fileExists(path.join(installDir, 'bin', 'python3'))) return installDir
  return installDir
}

async function resolvePythonBinary(runtimeRoot: string): Promise<string | null> {
  const candidates = process.platform === 'win32'
    ? [
      path.join(runtimeRoot, 'python.exe'),
      path.join(runtimeRoot, 'Scripts', 'python.exe'),
    ]
    : [
      path.join(runtimeRoot, 'bin', 'python3'),
      path.join(runtimeRoot, 'bin', 'python'),
    ]
  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate
  }
  return null
}

async function configureWindowsEmbed(runtimeRoot: string, version: string): Promise<void> {
  const majorMinor = version.split('.').slice(0, 2).join('')
  const pthName = `python${majorMinor}._pth`
  const pthPath = path.join(runtimeRoot, pthName)
  if (!(await fileExists(pthPath))) return

  const zipName = `python${majorMinor}.zip`
  const lines = [
    zipName,
    '.',
    './Lib/site-packages',
    'import site',
  ]
  await fs.writeFile(pthPath, `${lines.join('\r\n')}\r\n`, 'utf8')
  await fs.mkdir(path.join(runtimeRoot, 'Lib', 'site-packages'), { recursive: true })
}

async function linkCurrent(runtimeRoot: string, targetDir: string): Promise<void> {
  const currentPath = path.join(runtimeRoot, 'current')
  await fs.rm(currentPath, { recursive: true, force: true })
  const linkType = process.platform === 'win32' ? 'junction' : 'dir'
  await fs.symlink(path.resolve(targetDir), currentPath, linkType)
}

async function probePythonVersion(pythonPath: string): Promise<string> {
  const { stdout } = await execFileAsync(pythonPath, ['--version'], { timeout: 15_000 })
  const version = stdout.trim().split('\n')[0]?.trim() ?? stdout.trim()
  if (!version.includes('Python')) {
    throw new Error('安装后无法识别 Python 版本')
  }
  return version
}

export function resolveInstallPaths(artifact: PythonPlatformArtifact): {
  runtimeRoot: string
  installDir: string
  archivePath: string
} {
  const runtimeRoot = resolvePythonRuntimeRoot()
  const installDir = path.join(runtimeRoot, installDirName(artifact))
  const archivePath = path.join(os.tmpdir(), `opptrix-python-${process.pid}-${artifact.filename}`)
  return { runtimeRoot, installDir, archivePath }
}

/** 安装前清理：去掉 current 与目标目录；miniconda 不预创建目标目录 */
export async function prepareCleanInstallDir(
  runtimeRoot: string,
  installDir: string,
  kind: PythonPlatformArtifact['kind'],
): Promise<void> {
  await fs.mkdir(runtimeRoot, { recursive: true })
  // 先拆掉 current，避免指向即将删除的目录时在部分系统上 rm 失败
  await fs.rm(path.join(runtimeRoot, 'current'), { recursive: true, force: true })
  // 覆盖重装：清理失败残留或上次安装目录
  await fs.rm(installDir, { recursive: true, force: true })
  // embed 需要先有空目录再解压；miniconda 禁止目标已存在，留给安装脚本创建
  if (kind !== 'miniconda') {
    await fs.mkdir(installDir, { recursive: true })
  }
}

export async function installPythonArtifact(
  artifact: PythonPlatformArtifact,
  archivePath: string,
): Promise<PythonInstallResult> {
  const { runtimeRoot, installDir } = resolveInstallPaths(artifact)
  await prepareCleanInstallDir(runtimeRoot, installDir, artifact.kind)

  if (artifact.kind === 'miniconda') {
    await installMiniconda(archivePath, installDir)
  } else {
    await extractArchive(archivePath, installDir)
  }
  const effectiveRoot = await findRuntimeRoot(installDir, artifact.kind)

  if (artifact.kind === 'embed') {
    await configureWindowsEmbed(effectiveRoot, artifact.version)
  }

  const pythonPath = await resolvePythonBinary(effectiveRoot)
  if (!pythonPath) {
    throw new Error('安装完成后未找到 Python 可执行文件')
  }

  const pythonVersion = await probePythonVersion(pythonPath)
  if (!pythonVersion.includes(artifact.version.split('.')[0] ?? '3')) {
    throw new Error('Python 版本与预期不符，请重试')
  }

  await linkCurrent(runtimeRoot, effectiveRoot)

  const manifest: PythonInstallManifest = {
    version: artifact.version,
    platformKey: artifact.platformKey,
    kind: artifact.kind,
    installedAt: new Date().toISOString(),
    installDir,
    runtimeRoot: effectiveRoot,
    pythonPath,
    pythonVersion,
  }

  await fs.writeFile(
    path.join(installDir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  )

  return {
    manifest,
    installDir,
    runtimeRoot: effectiveRoot,
    pythonPath,
  }
}

export async function readInstallManifest(installDir: string): Promise<PythonInstallManifest | null> {
  const manifestPath = path.join(installDir, 'manifest.json')
  if (!(await fileExists(manifestPath))) return null
  try {
    const raw = await fs.readFile(manifestPath, 'utf8')
    return JSON.parse(raw) as PythonInstallManifest
  } catch {
    return null
  }
}
