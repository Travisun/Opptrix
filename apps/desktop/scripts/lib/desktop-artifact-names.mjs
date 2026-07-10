/** User-facing platform labels in release artifact file names. */
export const MAC_ARTIFACT_LABEL = {
  arm64: 'MacOS-(M CPU)',
  x64: 'MacOS-(Intel CPU)',
}

export const WIN_ARTIFACT_LABEL = 'Windows'
export const LINUX_ARTIFACT_LABEL = 'Linux'

const ARTIFACT_TEMPLATE = '${productName}-${version}-${platformLabel}.${ext}'

export function resolveMacArch(platformArgs) {
  if (platformArgs.includes('--arm64')) return 'arm64'
  if (platformArgs.includes('--x64')) return 'x64'
  const envArch = process.env.OPPTRIX_RUNTIME_ARCH?.trim()
  if (envArch === 'arm64' || envArch === 'x64') return envArch
  return process.arch === 'arm64' ? 'arm64' : 'x64'
}

export function detectBuildTarget(platformArgs) {
  if (platformArgs.includes('--mac')) return 'mac'
  if (platformArgs.includes('--win')) return 'win'
  if (platformArgs.includes('--linux')) return 'linux'
  if (process.platform === 'darwin') return 'mac'
  if (process.platform === 'win32') return 'win'
  if (process.platform === 'linux') return 'linux'
  return null
}

function artifactNameTemplate(platformLabel) {
  return ARTIFACT_TEMPLATE.replace('${platformLabel}', platformLabel)
}

/** Append electron-builder -c.*.artifactName overrides for release-friendly file names. */
export function appendDesktopArtifactNameArgs(ebArgs, platformArgs) {
  const target = detectBuildTarget(platformArgs)
  if (target === 'mac') {
    const arch = resolveMacArch(platformArgs)
    const label = MAC_ARTIFACT_LABEL[arch] ?? `MacOS-(${arch})`
    ebArgs.push(`-c.mac.artifactName=${artifactNameTemplate(label)}`)
    return
  }
  if (target === 'win') {
    ebArgs.push(`-c.win.artifactName=${artifactNameTemplate(WIN_ARTIFACT_LABEL)}`)
    return
  }
  if (target === 'linux') {
    ebArgs.push(`-c.linux.artifactName=${artifactNameTemplate(LINUX_ARTIFACT_LABEL)}`)
  }
}
