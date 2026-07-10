const fs = require('fs')
const path = require('path')
const { app } = require('electron')

const GUARD_FILENAME = 'update-install-guard.json'
const LAST_RUN_VERSION_FILENAME = 'update-last-run-version.json'
const MAX_ATTEMPTS = 3
const ATTEMPT_WINDOW_MS = 30 * 60 * 1000
const BLOCK_DURATION_MS = 60 * 60 * 1000

function guardFilePath() {
  return path.join(app.getPath('userData'), GUARD_FILENAME)
}

function readGuardState() {
  const filePath = guardFilePath()
  if (!fs.existsSync(filePath)) return null
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function writeGuardState(state) {
  fs.mkdirSync(path.dirname(guardFilePath()), { recursive: true })
  fs.writeFileSync(guardFilePath(), JSON.stringify(state, null, 2), 'utf8')
}

function clearGuardState() {
  try {
    fs.unlinkSync(guardFilePath())
  } catch {
    // ignore missing file
  }
}

function lastRunVersionFilePath() {
  return path.join(app.getPath('userData'), LAST_RUN_VERSION_FILENAME)
}

function readLastRunVersion() {
  const filePath = lastRunVersionFilePath()
  if (!fs.existsSync(filePath)) return null
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return typeof data?.version === 'string' ? data.version : null
  } catch {
    return null
  }
}

function writeLastRunVersion(version) {
  fs.mkdirSync(path.dirname(lastRunVersionFilePath()), { recursive: true })
  fs.writeFileSync(
    lastRunVersionFilePath(),
    JSON.stringify({ version, at: new Date().toISOString() }, null, 2),
    'utf8',
  )
}

function reconcileInstallGuard(currentVersion) {
  const state = readGuardState()
  if (!state?.targetVersion) return
  if (state.targetVersion === currentVersion) {
    clearGuardState()
  }
}

function isInstallBlocked(cacheKey) {
  const state = readGuardState()
  if (!state || state.cacheKey !== cacheKey) return false
  if (state.blockedUntil && Date.now() < Date.parse(state.blockedUntil)) {
    return true
  }
  if (state.blockedUntil && Date.now() >= Date.parse(state.blockedUntil)) {
    clearGuardState()
    return false
  }
  const recentAttempts = (state.attempts ?? []).filter(
    (entry) => Date.now() - Date.parse(entry.at) <= ATTEMPT_WINDOW_MS,
  )
  return recentAttempts.length >= MAX_ATTEMPTS
}

function recordInstallAttempt({ cacheKey, targetVersion }) {
  const now = new Date().toISOString()
  const state = readGuardState()
  const attempts = state?.cacheKey === cacheKey ? [...(state.attempts ?? [])] : []
  attempts.push({ at: now })
  const recentAttempts = attempts.filter(
    (entry) => Date.now() - Date.parse(entry.at) <= ATTEMPT_WINDOW_MS,
  )
  const blockedUntil = recentAttempts.length >= MAX_ATTEMPTS
    ? new Date(Date.now() + BLOCK_DURATION_MS).toISOString()
    : null

  writeGuardState({
    cacheKey,
    targetVersion,
    attempts: recentAttempts,
    blockedUntil,
    updatedAt: now,
  })
}

function getInstallBlockReason(cacheKey) {
  const state = readGuardState()
  if (!state || state.cacheKey !== cacheKey) return null
  if (state.blockedUntil && Date.now() < Date.parse(state.blockedUntil)) {
    return '自动安装多次未成功，请稍后再试，或在「关于 Opptrix」中手动点击「重启更新」。'
  }
  return null
}

module.exports = {
  reconcileInstallGuard,
  isInstallBlocked,
  recordInstallAttempt,
  getInstallBlockReason,
  clearGuardState,
  readLastRunVersion,
  writeLastRunVersion,
}
