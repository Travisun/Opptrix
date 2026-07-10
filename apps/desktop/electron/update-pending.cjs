const fs = require('fs')
const os = require('os')
const path = require('path')
const { app } = require('electron')

function readUpdaterCacheDirName() {
  if (!app.isPackaged) return '@opptrixdesktop-updater'
  const configPath = path.join(process.resourcesPath, 'app-update.yml')
  try {
    const text = fs.readFileSync(configPath, 'utf8')
    const match = text.match(/^\s*updaterCacheDirName:\s*['"]?([^'"\n]+)['"]?\s*$/m)
    return match?.[1]?.trim() || '@opptrixdesktop-updater'
  } catch {
    return '@opptrixdesktop-updater'
  }
}

function getPlatformCacheRoot() {
  const home = os.homedir()
  if (process.platform === 'win32') {
    return process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local')
  }
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Caches')
  }
  return process.env.XDG_CACHE_HOME || path.join(home, '.cache')
}

function getUpdaterCacheRoot() {
  return path.join(getPlatformCacheRoot(), readUpdaterCacheDirName())
}

function parseVersionFromArtifactName(fileName) {
  const base = path.basename(String(fileName ?? ''))
  const patterns = [
    /^Opptrix-(.+?)-MacOS-/i,
    /^Opptrix-(.+?)-Windows\./i,
    /^Opptrix-(.+?)-Linux\./i,
    /^opptrix[_-](.+?)[_.-]/i,
  ]
  for (const pattern of patterns) {
    const match = base.match(pattern)
    if (match?.[1]) return match[1]
  }
  return null
}

function readPendingDownloadFromDisk() {
  const pendingDir = path.join(getUpdaterCacheRoot(), 'pending')
  const infoPath = path.join(pendingDir, 'update-info.json')
  if (!fs.existsSync(infoPath)) return null

  try {
    const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'))
    if (!info?.fileName || !info?.sha512) return null
    const zipPath = path.join(pendingDir, info.fileName)
    if (!fs.existsSync(zipPath)) return null
    const version = parseVersionFromArtifactName(info.fileName)
    return {
      fileName: info.fileName,
      sha512: info.sha512,
      zipPath,
      version,
      cacheKey: `${info.sha512}:${info.fileName}`,
    }
  } catch {
    return null
  }
}

function loadSemver() {
  const candidates = [
    'semver',
    path.join(__dirname, '../build/updater-deps/packages/semver'),
  ]
  for (const candidate of candidates) {
    try {
      return require(candidate)
    } catch {
      // try next
    }
  }
  return null
}

function compareVersions(left, right) {
  const semver = loadSemver()
  if (semver?.valid(left) && semver.valid(right)) {
    return semver.compare(left, right)
  }
  return String(left).localeCompare(String(right), undefined, { numeric: true })
}

function isVersionNewer(candidate, current) {
  if (!candidate || !current) return false
  return compareVersions(candidate, current) > 0
}

function clearPendingDownloadCache() {
  const pendingDir = path.join(getUpdaterCacheRoot(), 'pending')
  if (!fs.existsSync(pendingDir)) return false
  try {
    fs.rmSync(pendingDir, { recursive: true, force: true })
    return true
  } catch (err) {
    console.warn('[updater] failed to clear pending cache:', err)
    return false
  }
}

module.exports = {
  getUpdaterCacheRoot,
  readPendingDownloadFromDisk,
  parseVersionFromArtifactName,
  compareVersions,
  isVersionNewer,
  clearPendingDownloadCache,
}
