/**
 * macOS Developer ID sign/verify inventory — single source of truth.
 *
 * Paths in the checklist are relative to Opptrix.app/Contents/Resources/.
 * Update apps/desktop/resources/mac-sign-checklist.json when Playwright /
 * Chromium (CFT), nested .app/.framework, native .node/.dylib, or bundled
 * python layout changes.
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

/** Absolute path to the checklist JSON (repo / packaged desktop resources). */
const MAC_SIGN_CHECKLIST_PATH = path.join(
  __dirname,
  '..',
  '..',
  'resources',
  'mac-sign-checklist.json',
)

/**
 * Lightweight glob matcher (supports `*` and `**` only). No new deps.
 * @param {string} pattern posix-style relative pattern
 * @param {string} relPath posix-style relative path (no leading ./)
 */
function matchGlob(pattern, relPath) {
  const normPattern = pattern.replace(/\\/g, '/')
  const normPath = relPath.replace(/\\/g, '/')
  const segs = normPattern.split('/')
  const parts = normPath.split('/').filter((p) => p.length > 0)

  /**
   * @param {number} si
   * @param {number} pi
   * @returns {boolean}
   */
  function walk(si, pi) {
    if (si === segs.length) return pi === parts.length
    const seg = segs[si]
    if (seg === '**') {
      if (si === segs.length - 1) return true
      for (let k = pi; k <= parts.length; k += 1) {
        if (walk(si + 1, k)) return true
      }
      return false
    }
    if (pi >= parts.length) return false
    if (!matchSeg(seg, parts[pi])) return false
    return walk(si + 1, pi + 1)
  }

  return walk(0, 0)
}

/**
 * @param {string} seg
 * @param {string} name
 */
function matchSeg(seg, name) {
  if (seg === '*') return true
  if (!seg.includes('*')) return seg === name
  const re = new RegExp(
    `^${seg.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`,
  )
  return re.test(name)
}

/**
 * Walk resourcesRoot collecting files and directories (for .app / .framework).
 * @param {string} dir
 * @param {string[]} acc
 * @param {string} root
 */
function walkEntries(dir, acc = [], root = dir) {
  if (!fs.existsSync(dir)) return acc
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return acc
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    const rel = path.relative(root, full)
    if (entry.isDirectory()) {
      acc.push(full)
      // Still walk into bundles (Chrome.app contains Helpers + Framework).
      walkEntries(full, acc, root)
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      acc.push(full)
    }
  }
  return acc
}

/**
 * @returns {{
 *   version: number
 *   description?: string
 *   updateWhen?: string[]
 *   signTrees: Array<{ id: string, rel: string, mode: string, hardFail?: boolean }>
 *   mustVerify: Array<{
 *     id: string
 *     glob: string
 *     requireDeveloperId?: boolean
 *     required?: boolean
 *     kind?: string
 *   }>
 * }}
 */
function loadMacSignChecklist(checklistPath = MAC_SIGN_CHECKLIST_PATH) {
  if (!fs.existsSync(checklistPath)) {
    throw new Error(`mac-sign-checklist: missing ${checklistPath}`)
  }
  const raw = JSON.parse(fs.readFileSync(checklistPath, 'utf8'))
  if (!raw || typeof raw !== 'object') {
    throw new Error('mac-sign-checklist: invalid JSON root')
  }
  if (!Array.isArray(raw.signTrees) || !Array.isArray(raw.mustVerify)) {
    throw new Error('mac-sign-checklist: signTrees and mustVerify must be arrays')
  }
  return raw
}

/**
 * Expand mustVerify globs under resourcesRoot.
 * Throws when a required entry matches zero paths (stale checklist / incomplete stage).
 *
 * @param {string} resourcesRoot Opptrix.app/Contents/Resources
 * @param {ReturnType<typeof loadMacSignChecklist>} checklist
 * @returns {Array<{ id: string, glob: string, requireDeveloperId: boolean, kind?: string, paths: string[] }>}
 */
function resolveMustVerify(resourcesRoot, checklist) {
  /** Longest non-wildcard path prefix → absolute walk roots (avoid scanning all of Resources). */
  /** @type {Map<string, string[]>} */
  const entriesByRoot = new Map()
  for (const entry of checklist.mustVerify) {
    const prefixSegs = []
    for (const seg of String(entry.glob).replace(/\\/g, '/').split('/')) {
      if (seg.includes('*')) break
      prefixSegs.push(seg)
    }
    const prefix = prefixSegs.join('/')
    const walkRoot = prefix
      ? path.join(resourcesRoot, ...prefixSegs)
      : resourcesRoot
    const key = walkRoot
    if (!entriesByRoot.has(key)) entriesByRoot.set(key, [])
    entriesByRoot.get(key).push(entry)
  }

  /** @type {Map<string, Array<{ abs: string, rel: string }>>} */
  const listingByRoot = new Map()
  for (const walkRoot of entriesByRoot.keys()) {
    if (!fs.existsSync(walkRoot)) {
      listingByRoot.set(walkRoot, [])
      continue
    }
    const absList = walkEntries(walkRoot)
    listingByRoot.set(
      walkRoot,
      absList.map((abs) => ({
        abs,
        rel: path.relative(resourcesRoot, abs).split(path.sep).join('/'),
      })),
    )
  }

  /** @type {Array<{ id: string, glob: string, requireDeveloperId: boolean, kind?: string, paths: string[] }>} */
  const resolved = []
  for (const [walkRoot, entries] of entriesByRoot) {
    const byRel = listingByRoot.get(walkRoot) ?? []
    for (const entry of entries) {
      const hits = byRel
        .filter((item) => matchGlob(entry.glob, item.rel))
        .map((item) => item.abs)
      if (entry.required !== false && hits.length === 0) {
        throw new Error(
          `mac-sign-checklist: required mustVerify "${entry.id}" matched 0 paths `
            + `(glob=${entry.glob} under ${resourcesRoot}). `
            + `Update the checklist or fix stage (Playwright / native layout drift).`,
        )
      }
      resolved.push({
        id: entry.id,
        glob: entry.glob,
        requireDeveloperId: entry.requireDeveloperId !== false,
        kind: entry.kind,
        paths: hits,
      })
    }
  }
  return resolved
}

/**
 * Assert Developer ID seals for every resolved mustVerify hit.
 *
 * @param {string} resourcesRoot
 * @param {ReturnType<typeof loadMacSignChecklist>} checklist
 * @param {(filePath: string) => void} assertDeveloperIdSignedFn
 */
function assertMustVerifySigned(resourcesRoot, checklist, assertDeveloperIdSignedFn) {
  const resolved = resolveMustVerify(resourcesRoot, checklist)
  let checked = 0
  for (const entry of resolved) {
    if (!entry.requireDeveloperId) continue
    for (const target of entry.paths) {
      try {
        assertDeveloperIdSignedFn(target)
        checked += 1
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        throw new Error(
          `mac-sign-checklist: mustVerify "${entry.id}" failed for ${target}: `
            + message.split('\n')[0],
        )
      }
    }
  }
  return { resolved, checked }
}

module.exports = {
  MAC_SIGN_CHECKLIST_PATH,
  loadMacSignChecklist,
  resolveMustVerify,
  assertMustVerifySigned,
  matchGlob,
}
