/**
 * Main-window size / position persistence (cross-platform).
 *
 * Pure helpers are unit-tested without Electron. File I/O uses an injected
 * userData directory (never a hard-coded home path).
 */

const fs = require('fs')
const path = require('path')

/** Product default from preferred desktop layout (still ≥ MIN_*). */
const DEFAULT_WIDTH = 1115
const DEFAULT_HEIGHT = 635
/** Keep in sync with DESKTOP_CHAT_MIN_WIDTH in client-ui/src/desktop/constants.ts */
const MIN_WIDTH = 510
const MIN_HEIGHT = 600
const WORK_AREA_WIDTH_RATIO = 0.7
const WORK_AREA_HEIGHT_RATIO = 0.75
const WINDOW_STATE_FILENAME = 'window-state.json'
const SAVE_DEBOUNCE_MS = 400
/** Minimum overlap (px) with a display work area to treat position as visible. */
const VISIBLE_OVERLAP_PX = 48

/**
 * @typedef {{ x: number, y: number, width: number, height: number }} Rect
 * @typedef {{
 *   width: number,
 *   height: number,
 *   x?: number,
 *   y?: number,
 *   isMaximized?: boolean,
 * }} WindowState
 * @typedef {{
 *   width: number,
 *   height: number,
 *   x?: number,
 *   y?: number,
 *   center: boolean,
 *   isMaximized: boolean,
 * }} WindowPlacement
 */

/**
 * @param {unknown} n
 * @returns {n is number}
 */
function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n)
}

/**
 * Default size for first launch (or when saved state is unusable).
 * @param {{ width: number, height: number } | null | undefined} workAreaSize
 * @returns {{ width: number, height: number }}
 */
function computeDefaultSize(workAreaSize) {
  let width = DEFAULT_WIDTH
  let height = DEFAULT_HEIGHT
  if (
    workAreaSize &&
    isFiniteNumber(workAreaSize.width) &&
    isFiniteNumber(workAreaSize.height) &&
    workAreaSize.width > 0 &&
    workAreaSize.height > 0
  ) {
    const targetW = Math.min(DEFAULT_WIDTH, Math.round(workAreaSize.width * WORK_AREA_WIDTH_RATIO))
    const targetH = Math.min(DEFAULT_HEIGHT, Math.round(workAreaSize.height * WORK_AREA_HEIGHT_RATIO))
    width = Math.max(MIN_WIDTH, targetW)
    height = Math.max(MIN_HEIGHT, targetH)
  }
  return { width, height }
}

/**
 * Clamp outer size to mins and optional work-area caps.
 * @param {number} width
 * @param {number} height
 * @param {{ width: number, height: number } | null | undefined} [workAreaSize]
 * @returns {{ width: number, height: number }}
 */
function clampWindowSize(width, height, workAreaSize) {
  let w = Math.round(Number(width))
  let h = Math.round(Number(height))
  if (!Number.isFinite(w) || w < MIN_WIDTH) w = MIN_WIDTH
  if (!Number.isFinite(h) || h < MIN_HEIGHT) h = MIN_HEIGHT
  if (
    workAreaSize &&
    isFiniteNumber(workAreaSize.width) &&
    isFiniteNumber(workAreaSize.height) &&
    workAreaSize.width > 0 &&
    workAreaSize.height > 0
  ) {
    w = Math.min(w, workAreaSize.width)
    h = Math.min(h, workAreaSize.height)
    w = Math.max(MIN_WIDTH, w)
    h = Math.max(MIN_HEIGHT, h)
  }
  return { width: w, height: h }
}

/**
 * @param {unknown} raw
 * @returns {WindowState | null}
 */
function parseWindowState(raw) {
  if (!raw || typeof raw !== 'object') return null
  const rec = /** @type {Record<string, unknown>} */ (raw)
  const width = Number(rec.width)
  const height = Number(rec.height)
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null
  if (width <= 0 || height <= 0) return null

  /** @type {WindowState} */
  const state = {
    width: Math.round(width),
    height: Math.round(height),
  }
  if (isFiniteNumber(rec.x)) state.x = Math.round(/** @type {number} */ (rec.x))
  if (isFiniteNumber(rec.y)) state.y = Math.round(/** @type {number} */ (rec.y))
  if (typeof rec.isMaximized === 'boolean') state.isMaximized = rec.isMaximized
  return state
}

/**
 * True when `bounds` meaningfully intersects at least one work area
 * (multi-monitor safe; off-screen monitors → false → caller recenters).
 * @param {Rect} bounds
 * @param {Rect[]} workAreas
 */
function isBoundsVisibleOnAnyDisplay(bounds, workAreas) {
  if (!Array.isArray(workAreas) || workAreas.length === 0) return false
  if (
    !isFiniteNumber(bounds.x) ||
    !isFiniteNumber(bounds.y) ||
    !isFiniteNumber(bounds.width) ||
    !isFiniteNumber(bounds.height)
  ) {
    return false
  }
  for (const wa of workAreas) {
    if (
      !wa ||
      !isFiniteNumber(wa.x) ||
      !isFiniteNumber(wa.y) ||
      !isFiniteNumber(wa.width) ||
      !isFiniteNumber(wa.height)
    ) {
      continue
    }
    const overlapW =
      Math.min(bounds.x + bounds.width, wa.x + wa.width) - Math.max(bounds.x, wa.x)
    const overlapH =
      Math.min(bounds.y + bounds.height, wa.y + wa.height) - Math.max(bounds.y, wa.y)
    if (overlapW >= VISIBLE_OVERLAP_PX && overlapH >= VISIBLE_OVERLAP_PX) {
      return true
    }
  }
  return false
}

/**
 * Resolve BrowserWindow placement from saved state + current displays.
 * Invalid / off-screen positions fall back to centered defaults (size still restored when valid).
 * @param {WindowState | null | undefined} saved
 * @param {Rect | { width: number, height: number } | null | undefined} primaryWorkArea
 * @param {Rect[] | null | undefined} [allWorkAreas]
 * @returns {WindowPlacement}
 */
function resolveWindowPlacement(saved, primaryWorkArea, allWorkAreas) {
  const workSize =
    primaryWorkArea && isFiniteNumber(primaryWorkArea.width) && isFiniteNumber(primaryWorkArea.height)
      ? { width: primaryWorkArea.width, height: primaryWorkArea.height }
      : null
  const defaults = computeDefaultSize(workSize)
  const areas =
    Array.isArray(allWorkAreas) && allWorkAreas.length > 0
      ? allWorkAreas
      : primaryWorkArea &&
          isFiniteNumber(/** @type {Rect} */ (primaryWorkArea).x) &&
          isFiniteNumber(/** @type {Rect} */ (primaryWorkArea).y)
        ? [/** @type {Rect} */ (primaryWorkArea)]
        : []

  if (!saved) {
    return { ...defaults, center: true, isMaximized: false }
  }

  const size = clampWindowSize(saved.width, saved.height, workSize)
  const isMaximized = saved.isMaximized === true

  if (isFiniteNumber(saved.x) && isFiniteNumber(saved.y) && areas.length > 0) {
    const candidate = { x: saved.x, y: saved.y, ...size }
    if (isBoundsVisibleOnAnyDisplay(candidate, areas)) {
      return {
        ...size,
        x: saved.x,
        y: saved.y,
        center: false,
        isMaximized,
      }
    }
  }

  return { ...size, center: true, isMaximized }
}

/**
 * Build JSON to persist. Maximized / fullscreen must not overwrite normal bounds.
 * @param {{
 *   bounds: Rect,
 *   isMaximized: boolean,
 *   isFullScreen: boolean,
 * }} snapshot
 * @param {WindowState | null | undefined} previousNormal
 * @returns {WindowState}
 */
function buildStateToSave(snapshot, previousNormal) {
  const prev = previousNormal && parseWindowState(previousNormal)
  const fallback = computeDefaultSize(null)

  if (snapshot.isFullScreen || snapshot.isMaximized) {
    /** @type {WindowState} */
    const next = {
      width: prev?.width ?? fallback.width,
      height: prev?.height ?? fallback.height,
      // Fullscreen: preserve prior maximized flag; maximize alone → isMaximized true
      isMaximized: snapshot.isFullScreen
        ? Boolean(prev?.isMaximized)
        : true,
    }
    if (isFiniteNumber(prev?.x)) next.x = prev.x
    if (isFiniteNumber(prev?.y)) next.y = prev.y
    return next
  }

  const b = snapshot.bounds
  /** @type {WindowState} */
  const next = {
    width: Math.round(b.width),
    height: Math.round(b.height),
    x: Math.round(b.x),
    y: Math.round(b.y),
    isMaximized: false,
  }
  return next
}

/**
 * @param {string} userDataDir
 */
function windowStateFilePath(userDataDir) {
  return path.join(userDataDir, WINDOW_STATE_FILENAME)
}

/**
 * @param {string} userDataDir
 * @returns {WindowState | null}
 */
function readWindowStateFile(userDataDir) {
  if (typeof userDataDir !== 'string' || !userDataDir) return null
  const filePath = windowStateFilePath(userDataDir)
  try {
    if (!fs.existsSync(filePath)) return null
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return parseWindowState(raw)
  } catch {
    return null
  }
}

/**
 * @param {string} userDataDir
 * @param {WindowState} state
 * @returns {WindowState | null}
 */
function writeWindowStateFile(userDataDir, state) {
  if (typeof userDataDir !== 'string' || !userDataDir) return null
  const parsed = parseWindowState(state)
  if (!parsed) return null
  const filePath = windowStateFilePath(userDataDir)
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8')
    return parsed
  } catch {
    return null
  }
}

/**
 * Debounced persist helper (resize / move); call flush on close.
 * @param {() => void} saveFn
 * @param {number} [debounceMs]
 */
function createPersistScheduler(saveFn, debounceMs = SAVE_DEBOUNCE_MS) {
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null
  return {
    schedule() {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        saveFn()
      }, debounceMs)
    },
    flush() {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      saveFn()
    },
  }
}

module.exports = {
  DEFAULT_WIDTH,
  DEFAULT_HEIGHT,
  MIN_WIDTH,
  MIN_HEIGHT,
  WORK_AREA_WIDTH_RATIO,
  WORK_AREA_HEIGHT_RATIO,
  WINDOW_STATE_FILENAME,
  SAVE_DEBOUNCE_MS,
  computeDefaultSize,
  clampWindowSize,
  parseWindowState,
  isBoundsVisibleOnAnyDisplay,
  resolveWindowPlacement,
  buildStateToSave,
  windowStateFilePath,
  readWindowStateFile,
  writeWindowStateFile,
  createPersistScheduler,
}
