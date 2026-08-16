/**
 * Self-Harness Phase 2 — 冷启动技能正文叠层 + 自适应 soft-skip（按模型桶）。
 */

import {
  clearHarnessOverlayCache,
  getActiveHarnessVersionForModel,
  getHarnessOverlayCacheEpoch,
  readOverlayBodyCache,
  writeOverlayBodyCache,
  type SkippedPatchRecord,
} from './local-store.js'
import { isHarnessPatchKind, type HarnessPatch } from './proposal.js'

export interface ApplyOverlayResult {
  body: string
  applied: number
  skippedPatches: SkippedPatchRecord[]
  versionId: string | null
}

/**
 * 对单个技能 body 应用 active 版本补丁。
 * - 无 active → 原样返回（与 Phase0 前一致）
 * - 未知 kind / 非本技能补丁 → soft-skip，不抛崩
 * - route_hint_append → soft-skip（生效在 turn-tail）
 * - 会话内按 versionId+skillName 缓存解析结果
 */
export function applyHarnessSkillOverlay(
  skillName: string,
  body: string,
  opts?: {
    bypassCache?: boolean
    /** 缺省：无模型上下文 → 仅解析 '*' 桶（兼容旧调用） */
    modelRef?: string | null
  },
): ApplyOverlayResult {
  const active = getActiveHarnessVersionForModel(opts?.modelRef)
  if (!active || !active.patches.length) {
    return {
      body,
      applied: 0,
      skippedPatches: active?.skippedPatches ?? [],
      versionId: active?.id ?? null,
    }
  }

  const cacheKey = `${getHarnessOverlayCacheEpoch()}::${active.id}::${skillName}`
  if (!opts?.bypassCache) {
    const cached = readOverlayBodyCache(cacheKey)
    if (cached != null) {
      return {
        body: cached,
        applied: -1,
        skippedPatches: active.skippedPatches,
        versionId: active.id,
      }
    }
  }

  let next = body
  let applied = 0
  const skipped: SkippedPatchRecord[] = [...active.skippedPatches]

  for (const patch of active.patches) {
    const result = applyOnePatch(skillName, next, patch)
    if (result.skip) {
      skipped.push(result.skip)
      continue
    }
    next = result.body
    applied += 1
  }

  writeOverlayBodyCache(cacheKey, next)
  return {
    body: next,
    applied,
    skippedPatches: skipped,
    versionId: active.id,
  }
}

function applyOnePatch(
  skillName: string,
  body: string,
  patch: HarnessPatch,
): { body: string; skip?: SkippedPatchRecord } {
  if (!isHarnessPatchKind(patch.kind)) {
    return {
      body,
      skip: { kind: String((patch as { kind?: string }).kind), reason: 'unknown_patch_kind' },
    }
  }

  if (patch.kind === 'route_hint_append') {
    // 技能叠层仍 soft-skip；真正生效仅在 turn-tail
    return {
      body,
      skip: { kind: patch.kind, reason: 'route_hint_not_mounted' },
    }
  }

  if (patch.kind === 'skill_body_append') {
    if (patch.skillName !== skillName) {
      return { body }
    }
    if (!patch.text) return { body }
    if (body.includes(patch.text.trim())) return { body }
    return { body: `${body}\n${patch.text}` }
  }

  if (patch.kind === 'skill_body_replace_span') {
    if (patch.skillName !== skillName) {
      return { body }
    }
    if (!patch.from || !body.includes(patch.from)) {
      return {
        body,
        skip: {
          kind: patch.kind,
          skillName: patch.skillName,
          reason: 'replace_span_not_found',
        },
      }
    }
    return { body: body.split(patch.from).join(patch.to) }
  }

  return {
    body,
    skip: { kind: String((patch as { kind?: string }).kind), reason: 'unknown_patch_kind' },
  }
}

export { clearHarnessOverlayCache }
