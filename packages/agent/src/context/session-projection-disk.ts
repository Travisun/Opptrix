/**
 * ContextProjection disk storage under ~/.opptrix/session-state/<id>/
 * SQLite keeps ContextProjectionRef (pointer) only; engine memory hydrates full body.
 * Never under agent-workspace.
 */

import fs from 'node:fs'
import path from 'node:path'
import {
  assertSafeSessionId,
  resolveSessionStateDir,
} from '@opptrix/agent-workspace'
import type { ChatMessage } from '../llm/provider.js'
import type { ContextProjection } from './projection.js'

export const CONTEXT_PROJECTION_PATH_KEY = 'context-projection.json'
const PROJECTION_FILE = CONTEXT_PROJECTION_PATH_KEY

/** SQLite 指针：全文只在 disk；引擎 hydrate 后仍用完整 ContextProjection */
export interface ContextProjectionRef {
  storage: 'disk'
  pathKey: string
  updatedAt: string
  compacted: boolean
  projectionVersion?: number
  coveredCount?: number
}

export function resolveContextProjectionPath(sessionId: string): string {
  return path.join(resolveSessionStateDir(sessionId), PROJECTION_FILE)
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isChatMessage(v: unknown): v is ChatMessage {
  if (!isRecord(v)) return false
  const role = v.role
  return role === 'system' || role === 'user' || role === 'assistant' || role === 'tool'
}

/** 校验磁盘/未知 JSON → ContextProjection；失败返回 null（fail-closed） */
export function parseContextProjection(raw: unknown): ContextProjection | null {
  if (!isRecord(raw)) return null
  if (raw.schemaVersion !== 1) return null
  if (!Array.isArray(raw.messages) || !raw.messages.every(isChatMessage)) return null
  if (typeof raw.coveredCount !== 'number' || !Number.isFinite(raw.coveredCount)) return null
  if (typeof raw.keepRecent !== 'number' || !Number.isFinite(raw.keepRecent)) return null
  if (typeof raw.projectionVersion !== 'number' || !Number.isFinite(raw.projectionVersion)) return null
  if (typeof raw.updatedAt !== 'string' || !raw.updatedAt) return null
  const coveredPrefixHash = raw.coveredPrefixHash
  if (coveredPrefixHash != null && typeof coveredPrefixHash !== 'string') return null
  return {
    schemaVersion: 1,
    messages: raw.messages as ChatMessage[],
    coveredCount: raw.coveredCount,
    keepRecent: raw.keepRecent,
    ...(typeof coveredPrefixHash === 'string' ? { coveredPrefixHash } : {}),
    projectionVersion: raw.projectionVersion,
    updatedAt: raw.updatedAt,
  }
}

export function isContextProjectionRef(raw: unknown): raw is ContextProjectionRef {
  if (!isRecord(raw)) return false
  if (raw.storage !== 'disk') return false
  if (typeof raw.pathKey !== 'string' || !raw.pathKey) return false
  if (typeof raw.updatedAt !== 'string' || !raw.updatedAt) return false
  if (typeof raw.compacted !== 'boolean') return false
  if (raw.projectionVersion != null && typeof raw.projectionVersion !== 'number') return false
  if (raw.coveredCount != null && typeof raw.coveredCount !== 'number') return false
  // 全文投影带 schemaVersion + messages；指针没有
  if (raw.schemaVersion != null || Array.isArray(raw.messages)) return false
  return true
}

export function isFullContextProjection(raw: unknown): raw is ContextProjection {
  return parseContextProjection(raw) != null
}

export function contextProjectionToRef(projection: ContextProjection): ContextProjectionRef {
  return {
    storage: 'disk',
    pathKey: CONTEXT_PROJECTION_PATH_KEY,
    updatedAt: projection.updatedAt,
    compacted: true,
    projectionVersion: projection.projectionVersion,
    coveredCount: projection.coveredCount,
  }
}

export function readContextProjectionFromDisk(sessionId: string): ContextProjection | null {
  try {
    assertSafeSessionId(sessionId)
    const filePath = resolveContextProjectionPath(sessionId)
    if (!fs.existsSync(filePath)) return null
    const text = fs.readFileSync(filePath, 'utf8')
    return parseContextProjection(JSON.parse(text) as unknown)
  } catch {
    return null
  }
}

/** dual-write：projection 非空落盘；null 则幂等删文件 */
export function writeContextProjectionToDisk(
  sessionId: string,
  projection: ContextProjection | null | undefined,
): void {
  try {
    const safe = assertSafeSessionId(sessionId)
    const dir = resolveSessionStateDir(safe)
    const filePath = path.join(dir, PROJECTION_FILE)
    if (!projection) {
      try {
        fs.rmSync(filePath, { force: true })
      } catch {
        /* ignore */
      }
      return
    }
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(projection), 'utf8')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[session-state] 写入 context-projection 失败 (${sessionId}): ${msg}`)
  }
}

/**
 * 读路径 hydrate：disk 优先；旧 SQLite 全文 → 写盘；指针无盘 → null。
 * 返回引擎可用的完整 ContextProjection（或 null）。
 */
export function hydrateContextProjection(
  sessionId: string,
  stored: unknown,
): {
  projection: ContextProjection | null
  /** 若 SQLite 仍是全文，调用方应改存指针 */
  needsPointerRewrite: boolean
} {
  const fromDisk = readContextProjectionFromDisk(sessionId)
  if (fromDisk) {
    return {
      projection: fromDisk,
      needsPointerRewrite: isFullContextProjection(stored),
    }
  }
  if (isFullContextProjection(stored)) {
    writeContextProjectionToDisk(sessionId, stored)
    return { projection: stored, needsPointerRewrite: true }
  }
  if (isContextProjectionRef(stored)) {
    // 指针无盘文件 → fail-closed
    return { projection: null, needsPointerRewrite: false }
  }
  return { projection: null, needsPointerRewrite: false }
}

/** Composer / API 用的占用百分比（0–100） */
export function computeContextUsagePercent(usedTokens: number, limitTokens: number): number {
  if (!(limitTokens > 0) || !Number.isFinite(limitTokens)) return 0
  if (!Number.isFinite(usedTokens) || usedTokens <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((usedTokens / limitTokens) * 100)))
}
