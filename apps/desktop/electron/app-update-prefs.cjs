const fs = require('fs')
const path = require('path')
const { app } = require('electron')

const PREFS_FILENAME = 'app-update-prefs.json'
/** 默认关闭自动下载：发现更新后提醒，由用户确认再下载 */
const DEFAULT_AUTO_DOWNLOAD = false

function prefsFilePath() {
  return path.join(app.getPath('userData'), PREFS_FILENAME)
}

function readAppUpdatePrefs() {
  const filePath = prefsFilePath()
  if (!fs.existsSync(filePath)) {
    return { autoDownload: DEFAULT_AUTO_DOWNLOAD }
  }
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return {
      autoDownload: typeof data?.autoDownload === 'boolean'
        ? data.autoDownload
        : DEFAULT_AUTO_DOWNLOAD,
    }
  } catch {
    return { autoDownload: DEFAULT_AUTO_DOWNLOAD }
  }
}

function writeAppUpdatePrefs(prefs) {
  const next = {
    autoDownload: typeof prefs?.autoDownload === 'boolean'
      ? prefs.autoDownload
      : DEFAULT_AUTO_DOWNLOAD,
  }
  fs.mkdirSync(path.dirname(prefsFilePath()), { recursive: true })
  fs.writeFileSync(prefsFilePath(), JSON.stringify(next, null, 2), 'utf8')
  return next
}

function getAutoDownloadPreference() {
  return readAppUpdatePrefs().autoDownload
}

function setAutoDownloadPreference(enabled) {
  return writeAppUpdatePrefs({ autoDownload: Boolean(enabled) }).autoDownload
}

module.exports = {
  readAppUpdatePrefs,
  writeAppUpdatePrefs,
  getAutoDownloadPreference,
  setAutoDownloadPreference,
  DEFAULT_AUTO_DOWNLOAD,
}
