export const PYTHON_RUNTIME_VERSION = '3.12.8'

/** Miniconda3 py312 — 国内镜像稳定，macOS / Linux 默认安装包 */
export const MINICONDA_VERSION = '24.11.1-0'

export type PythonArtifactKind = 'embed' | 'standalone' | 'miniconda'

export interface PythonPlatformArtifact {
  platformKey: string
  version: string
  kind: PythonArtifactKind
  filename: string
  urls: readonly string[]
  sha256?: string
  expectedSizeBytes?: number
}

function buildWindowsEmbedUrls(arch: 'amd64' | 'arm64'): string[] {
  const filename = `python-${PYTHON_RUNTIME_VERSION}-embed-${arch}.zip`
  return [
    `https://cdn.npmmirror.com/binaries/python/${PYTHON_RUNTIME_VERSION}/${filename}`,
    `https://registry.npmmirror.com/-/binary/python/${PYTHON_RUNTIME_VERSION}/${filename}`,
    `https://npmmirror.com/mirrors/python/${PYTHON_RUNTIME_VERSION}/${filename}`,
    `https://mirrors.huaweicloud.com/python/${PYTHON_RUNTIME_VERSION}/${filename}`,
    `https://www.python.org/ftp/python/${PYTHON_RUNTIME_VERSION}/${filename}`,
  ]
}

function buildMinicondaUrls(platformSuffix: string): string[] {
  const filename = `Miniconda3-py312_${MINICONDA_VERSION}-${platformSuffix}.sh`
  return [
    `https://mirrors.tuna.tsinghua.edu.cn/anaconda/miniconda/${filename}`,
    `https://mirrors.ustc.edu.cn/anaconda/miniconda/${filename}`,
    `https://repo.anaconda.com/miniconda/${filename}`,
  ]
}

const ARTIFACTS: Record<string, PythonPlatformArtifact> = {
  'win-amd64': {
    platformKey: 'win-amd64',
    version: PYTHON_RUNTIME_VERSION,
    kind: 'embed',
    filename: `python-${PYTHON_RUNTIME_VERSION}-embed-amd64.zip`,
    urls: buildWindowsEmbedUrls('amd64'),
  },
  'win-arm64': {
    platformKey: 'win-arm64',
    version: PYTHON_RUNTIME_VERSION,
    kind: 'embed',
    filename: `python-${PYTHON_RUNTIME_VERSION}-embed-arm64.zip`,
    urls: buildWindowsEmbedUrls('arm64'),
  },
  'darwin-arm64': {
    platformKey: 'darwin-arm64',
    version: PYTHON_RUNTIME_VERSION,
    kind: 'miniconda',
    filename: `Miniconda3-py312_${MINICONDA_VERSION}-MacOSX-arm64.sh`,
    urls: buildMinicondaUrls('MacOSX-arm64'),
  },
  'darwin-x64': {
    platformKey: 'darwin-x64',
    version: PYTHON_RUNTIME_VERSION,
    kind: 'miniconda',
    filename: `Miniconda3-py312_${MINICONDA_VERSION}-MacOSX-x86_64.sh`,
    urls: buildMinicondaUrls('MacOSX-x86_64'),
  },
  'linux-x64': {
    platformKey: 'linux-x64',
    version: PYTHON_RUNTIME_VERSION,
    kind: 'miniconda',
    filename: `Miniconda3-py312_${MINICONDA_VERSION}-Linux-x86_64.sh`,
    urls: buildMinicondaUrls('Linux-x86_64'),
  },
  'linux-arm64': {
    platformKey: 'linux-arm64',
    version: PYTHON_RUNTIME_VERSION,
    kind: 'miniconda',
    filename: `Miniconda3-py312_${MINICONDA_VERSION}-Linux-aarch64.sh`,
    urls: buildMinicondaUrls('Linux-aarch64'),
  },
}

/**
 * 将 Node `process.platform` / `process.arch`（或打包目标）映射到 catalog key。
 * 与 `OPPTRIX_RUNTIME_PLATFORM` / `OPPTRIX_RUNTIME_ARCH` 对齐；未知组合返回 null。
 */
export function pythonPlatformKeyFromTarget(
  platform: string,
  arch: string,
): string | null {
  const a = arch === 'amd64' || arch === 'x86_64' ? 'x64' : arch === 'aarch64' ? 'arm64' : arch
  if (platform === 'win32') {
    return a === 'arm64' ? 'win-arm64' : 'win-amd64'
  }
  if (platform === 'darwin') {
    return a === 'arm64' ? 'darwin-arm64' : 'darwin-x64'
  }
  if (platform === 'linux') {
    return a === 'arm64' ? 'linux-arm64' : 'linux-x64'
  }
  return null
}

export function detectPythonPlatformKey(): string | null {
  return pythonPlatformKeyFromTarget(process.platform, process.arch)
}

export function resolvePythonPlatformArtifact(): PythonPlatformArtifact | null {
  const key = detectPythonPlatformKey()
  if (!key) return null
  return ARTIFACTS[key] ?? null
}

export function getPythonPlatformArtifact(platformKey: string): PythonPlatformArtifact | undefined {
  return ARTIFACTS[platformKey]
}

export function listPythonPlatformArtifacts(): readonly PythonPlatformArtifact[] {
  return Object.values(ARTIFACTS)
}

export function installDirName(artifact: PythonPlatformArtifact): string {
  return `${artifact.version}-${artifact.platformKey}`
}
