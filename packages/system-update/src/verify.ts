/**
 * Verify that a slot directory is a usable Opptrix runtime tree.
 */
import fs from 'node:fs'
import path from 'node:path'
import { RUNTIME_MARKER_FILENAME, SERVER_ENTRY_SEGMENTS } from './constants.js'
import { assertSafeVersion, resolveSystemDir, slotPath } from './paths.js'

export interface VerifySlotResult {
  ok: boolean
  reason?: string
  slotPath: string
  hasMarker: boolean
  hasServerEntry: boolean
}

export function verifySlotDirectory(slotDir: string): VerifySlotResult {
  const abs = path.resolve(slotDir)
  const marker = path.join(abs, RUNTIME_MARKER_FILENAME)
  const serverEntry = path.join(abs, ...SERVER_ENTRY_SEGMENTS)
  const hasMarker = fs.existsSync(marker)
  const hasServerEntry = fs.existsSync(serverEntry)

  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    return {
      ok: false,
      reason: `slot directory missing: ${abs}`,
      slotPath: abs,
      hasMarker,
      hasServerEntry,
    }
  }

  if (!hasMarker && !hasServerEntry) {
    return {
      ok: false,
      reason:
        `slot incomplete: need ${RUNTIME_MARKER_FILENAME} or ${SERVER_ENTRY_SEGMENTS.join('/')}`,
      slotPath: abs,
      hasMarker,
      hasServerEntry,
    }
  }

  return { ok: true, slotPath: abs, hasMarker, hasServerEntry }
}

export function verifySlotVersion(
  version: string,
  systemDir?: string,
): VerifySlotResult {
  assertSafeVersion(version)
  const root = resolveSystemDir(systemDir)
  return verifySlotDirectory(slotPath(root, version))
}
