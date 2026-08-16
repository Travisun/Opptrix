/**
 * Self-Harness Phase 2/3 — 本地可晋升跑法仓（用户库 documents，跨应用升级保留）。
 *
 * namespace=`harness`，id=`store`（完整仓）；formatVersion=2：按模型分桶 + 审计 + 自动晋升偏好。
 */

import { getUserDataStore } from '@opptrix/user-store'
import { listSkillIndex } from '@opptrix/agent-skills'
import {
  isHarnessPatchKind,
  type HarnessPatch,
  type HarnessProposal,
} from './proposal.js'
import { assertProposalSafe } from './proposal.js'

export const HARNESS_STORE_NAMESPACE = 'harness'
export const HARNESS_STORE_DOC_ID = 'store'
export const HARNESS_ACTIVE_DOC_ID = 'active'
/** 当前文档格式版本；迁移幂等 */
export const HARNESS_FORMAT_VERSION = 2
export const HARNESS_WILDCARD_BUCKET = '*' as const
export const AUDIT_LOG_MAX = 200

export type HarnessAuditAction =
  | 'promote_manual'
  | 'promote_auto'
  | 'rollback_model'
  | 'rollback_default'
  | 'set_auto_promote'
  | 'migrate_v1_to_v2'
  | 'skip_auto_promote'

export interface HarnessAuditEntry {
  at: string
  action: HarnessAuditAction | string
  modelRef?: string
  versionId?: string | null
  detail?: string
}

export type HarnessPatchTier = 'A' | 'B' | 'C'

export interface SkippedPatchRecord {
  kind: string
  reason: string
  skillName?: string
}

export interface HarnessVersionRecord {
  id: string
  createdAt: string
  proposalId?: string
  summary?: string
  patches: HarnessPatch[]
  skippedPatches: SkippedPatchRecord[]
  exportMarkdown?: string
  modelBucket?: string
  tier?: HarnessPatchTier
}

export interface HarnessAutoPromotePref {
  enabled: boolean
  updatedAt: string
}

export interface HarnessStoreDocument {
  formatVersion: number
  /** 全局默认 active（兼容 v1；解析时等价 activeByModel['*']） */
  activeVersionId: string | null
  activeByModel: Record<string, string | null>
  autoPromote: HarnessAutoPromotePref
  auditLog: HarnessAuditEntry[]
  versions: Record<string, HarnessVersionRecord>
  [key: string]: unknown
}

export interface HarnessActivePointer {
  formatVersion: number
  activeVersionId: string | null
  updatedAt: string
}

function nowIso(): string {
  return new Date().toISOString()
}

function emptyStore(): HarnessStoreDocument {
  return {
    formatVersion: HARNESS_FORMAT_VERSION,
    activeVersionId: null,
    activeByModel: { [HARNESS_WILDCARD_BUCKET]: null },
    autoPromote: { enabled: true, updatedAt: nowIso() },
    auditLog: [],
    versions: {},
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function trimAuditLog(entries: HarnessAuditEntry[]): HarnessAuditEntry[] {
  if (entries.length <= AUDIT_LOG_MAX) return entries
  return entries.slice(-AUDIT_LOG_MAX)
}

function appendAudit(
  store: HarnessStoreDocument,
  entry: Omit<HarnessAuditEntry, 'at'> & { at?: string },
): void {
  store.auditLog = trimAuditLog([
    ...store.auditLog,
    { ...entry, at: entry.at ?? nowIso() },
  ])
}

/**
 * 版本档位：A 可自动；B 仅人工；含未知 kind → B。
 */
export function classifyVersionTier(patches: readonly HarnessPatch[]): HarnessPatchTier {
  if (!patches.length) return 'A'
  let hasB = false
  for (const p of patches) {
    if (!isHarnessPatchKind(p.kind)) {
      hasB = true
      continue
    }
    if (p.kind === 'skill_body_replace_span') {
      hasB = true
      continue
    }
    if (p.kind !== 'skill_body_append' && p.kind !== 'route_hint_append') {
      hasB = true
    }
  }
  return hasB ? 'B' : 'A'
}

/** 规范化 session.model / API 入参；空 → null；不做大小写折叠 */
export function normalizeHarnessModelRef(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const trimmed = raw.trim()
  return trimmed.length ? trimmed : null
}

function providerPrefixFromModelRef(modelRef: string): string | null {
  const colonIdx = modelRef.indexOf(':')
  if (colonIdx <= 0) return null
  const provider = modelRef.slice(0, colonIdx).trim()
  return provider.length ? provider : null
}

function hasOwnBucket(
  map: Record<string, string | null>,
  key: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(map, key)
}

/**
 * 解析顺序：精确 modelRef → provider:* → * / activeVersionId → null
 */
export function resolveActiveHarnessVersionId(
  store: HarnessStoreDocument,
  modelRef: string | null | undefined,
): string | null {
  const normalized = normalizeHarnessModelRef(modelRef)
  if (normalized && hasOwnBucket(store.activeByModel, normalized)) {
    return store.activeByModel[normalized] ?? null
  }
  if (normalized) {
    const provider = providerPrefixFromModelRef(normalized)
    if (provider) {
      const wild = `${provider}:*`
      if (hasOwnBucket(store.activeByModel, wild)) {
        return store.activeByModel[wild] ?? null
      }
    }
  }
  if (hasOwnBucket(store.activeByModel, HARNESS_WILDCARD_BUCKET)) {
    return store.activeByModel[HARNESS_WILDCARD_BUCKET] ?? null
  }
  return store.activeVersionId ?? null
}

function normalizeActiveByModel(
  raw: unknown,
  activeVersionId: string | null,
): Record<string, string | null> {
  const out: Record<string, string | null> = {}
  if (isRecord(raw)) {
    for (const [k, v] of Object.entries(raw)) {
      if (typeof k !== 'string' || !k.trim()) continue
      if (v === null || typeof v === 'string') {
        out[k] = v
      }
    }
  }
  if (!hasOwnBucket(out, HARNESS_WILDCARD_BUCKET)) {
    out[HARNESS_WILDCARD_BUCKET] = activeVersionId
  }
  return out
}

function parseAuditLog(raw: unknown): HarnessAuditEntry[] {
  if (!Array.isArray(raw)) return []
  const entries: HarnessAuditEntry[] = []
  for (const item of raw) {
    if (!isRecord(item)) continue
    if (typeof item.action !== 'string' || typeof item.at !== 'string') continue
    const entry: HarnessAuditEntry = {
      at: item.at,
      action: item.action,
    }
    if (typeof item.modelRef === 'string') entry.modelRef = item.modelRef
    if (item.versionId === null || typeof item.versionId === 'string') {
      entry.versionId = item.versionId as string | null
    }
    if (typeof item.detail === 'string') entry.detail = item.detail.slice(0, 200)
    entries.push(entry)
  }
  return trimAuditLog(entries)
}

function parseAutoPromote(raw: unknown): HarnessAutoPromotePref {
  if (isRecord(raw) && typeof raw.enabled === 'boolean') {
    return {
      enabled: raw.enabled,
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : nowIso(),
    }
  }
  return { enabled: true, updatedAt: nowIso() }
}

function migrateVersions(
  versionsIn: Record<string, unknown>,
  formatVersion: number,
): Record<string, HarnessVersionRecord> {
  const versions: Record<string, HarnessVersionRecord> = {}
  for (const [id, v] of Object.entries(versionsIn)) {
    if (!isRecord(v)) continue
    const patchesRaw = Array.isArray(v.patches) ? v.patches : []
    const patches: HarnessPatch[] = []
    const skipped: SkippedPatchRecord[] = Array.isArray(v.skippedPatches)
      ? (v.skippedPatches as SkippedPatchRecord[]).filter(s => isRecord(s as unknown))
      : []

    for (const p of patchesRaw) {
      if (!isRecord(p) || typeof p.kind !== 'string') {
        skipped.push({
          kind: String((p as { kind?: unknown })?.kind ?? 'unknown'),
          reason: 'malformed_patch',
        })
        continue
      }
      if (!isHarnessPatchKind(p.kind)) {
        skipped.push({ kind: p.kind, reason: 'unknown_patch_kind' })
        continue
      }
      patches.push(p as unknown as HarnessPatch)
    }

    // formatVersion 0 → 1：补齐 skippedPatches 字段（已在上方保证数组）
    if (formatVersion < 1 && !Array.isArray(v.skippedPatches)) {
      // no-op beyond ensuring array exists
    }

    const modelBucket =
      typeof v.modelBucket === 'string' && v.modelBucket.trim()
        ? v.modelBucket.trim()
        : HARNESS_WILDCARD_BUCKET
    const tier: HarnessPatchTier =
      v.tier === 'A' || v.tier === 'B' || v.tier === 'C'
        ? v.tier
        : classifyVersionTier(patches)

    versions[id] = {
      id: typeof v.id === 'string' ? v.id : id,
      createdAt: typeof v.createdAt === 'string' ? v.createdAt : nowIso(),
      proposalId: typeof v.proposalId === 'string' ? v.proposalId : undefined,
      summary: typeof v.summary === 'string' ? v.summary : undefined,
      patches,
      skippedPatches: skipped,
      exportMarkdown: typeof v.exportMarkdown === 'string' ? v.exportMarkdown : undefined,
      modelBucket,
      tier,
    }
  }
  return versions
}

/**
 * 幂等迁移任意 raw → formatVersion 2；未知顶层字段保留。
 */
export function migrateHarnessStore(raw: unknown): HarnessStoreDocument {
  if (!isRecord(raw)) return emptyStore()

  const incomingFormat =
    typeof raw.formatVersion === 'number' && Number.isFinite(raw.formatVersion)
      ? raw.formatVersion
      : 0

  let activeVersionId: string | null =
    typeof raw.activeVersionId === 'string' || raw.activeVersionId === null
      ? (raw.activeVersionId as string | null)
      : null

  const versionsIn = isRecord(raw.versions) ? raw.versions : {}
  const versions = migrateVersions(versionsIn, incomingFormat)

  if (activeVersionId && !versions[activeVersionId]) {
    activeVersionId = null
  }

  const alreadyV2 =
    incomingFormat >= 2 && isRecord(raw.activeByModel)

  let activeByModel = normalizeActiveByModel(
    raw.activeByModel,
    activeVersionId,
  )
  // 双向对齐 * 与 activeVersionId
  if (!hasOwnBucket(activeByModel, HARNESS_WILDCARD_BUCKET)) {
    activeByModel[HARNESS_WILDCARD_BUCKET] = activeVersionId
  }
  // 清理各桶脏指针：versionId 非 null 但不在 versions 中 → null
  for (const key of Object.keys(activeByModel)) {
    const vid = activeByModel[key]
    if (vid != null && !versions[vid]) {
      activeByModel[key] = null
    }
  }
  activeVersionId = activeByModel[HARNESS_WILDCARD_BUCKET] ?? null
  if (activeVersionId && !versions[activeVersionId]) {
    activeVersionId = null
    activeByModel[HARNESS_WILDCARD_BUCKET] = null
  }

  let auditLog = parseAuditLog(raw.auditLog)
  const autoPromote = parseAutoPromote(raw.autoPromote)

  if (!alreadyV2 && incomingFormat < 2) {
    const hasMigrateAudit = auditLog.some(e => e.action === 'migrate_v1_to_v2')
    if (!hasMigrateAudit) {
      auditLog = trimAuditLog([
        ...auditLog,
        {
          at: nowIso(),
          action: 'migrate_v1_to_v2',
          detail: 'idempotent',
        },
      ])
    }
  }

  const base: HarnessStoreDocument = {
    ...raw,
    formatVersion: HARNESS_FORMAT_VERSION,
    activeVersionId,
    activeByModel,
    autoPromote,
    auditLog,
    versions,
  }

  return base
}

function softSkipMissingSkills(version: HarnessVersionRecord): HarnessVersionRecord {
  let skillNames: Set<string> | null = null
  try {
    skillNames = new Set(listSkillIndex().map(s => s.name))
  } catch {
    skillNames = null
  }
  if (!skillNames) return version

  const skipped = [...version.skippedPatches]
  for (const p of version.patches) {
    if (p.kind === 'skill_body_append' || p.kind === 'skill_body_replace_span') {
      if (!skillNames.has(p.skillName)) {
        const already = skipped.some(
          s => s.skillName === p.skillName && s.reason === 'skill_not_found',
        )
        if (!already) {
          skipped.push({
            kind: p.kind,
            skillName: p.skillName,
            reason: 'skill_not_found',
          })
        }
      }
    }
  }
  return { ...version, skippedPatches: skipped }
}

export function loadHarnessStore(): HarnessStoreDocument {
  const raw = getUserDataStore().getDocument<unknown>(HARNESS_STORE_NAMESPACE, HARNESS_STORE_DOC_ID)
  return migrateHarnessStore(raw)
}

export function saveHarnessStore(doc: HarnessStoreDocument): void {
  const migrated = migrateHarnessStore(doc)
  migrated.formatVersion = HARNESS_FORMAT_VERSION
  // 对齐 * 桶与全局指针
  if (!hasOwnBucket(migrated.activeByModel, HARNESS_WILDCARD_BUCKET)) {
    migrated.activeByModel[HARNESS_WILDCARD_BUCKET] = migrated.activeVersionId
  }
  migrated.activeVersionId = migrated.activeByModel[HARNESS_WILDCARD_BUCKET] ?? null
  migrated.auditLog = trimAuditLog(migrated.auditLog ?? [])
  getUserDataStore().setDocument(HARNESS_STORE_NAMESPACE, HARNESS_STORE_DOC_ID, migrated)
  const active: HarnessActivePointer = {
    formatVersion: HARNESS_FORMAT_VERSION,
    activeVersionId: migrated.activeVersionId,
    updatedAt: nowIso(),
  }
  getUserDataStore().setDocument(HARNESS_STORE_NAMESPACE, HARNESS_ACTIVE_DOC_ID, active)
}

export function listHarnessVersions(): HarnessVersionRecord[] {
  const store = loadHarnessStore()
  return Object.values(store.versions).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Phase1 兼容：全局 * 桶 active */
export function getActiveHarnessVersion(): HarnessVersionRecord | null {
  return getActiveHarnessVersionForModel(null)
}

export function getActiveHarnessVersionForModel(
  modelRef: string | null | undefined,
): HarnessVersionRecord | null {
  const store = loadHarnessStore()
  const id = resolveActiveHarnessVersionId(store, modelRef)
  if (!id) return null
  return store.versions[id] ?? null
}

export function proposalToExportMarkdown(proposal: HarnessProposal, versionId: string): string {
  const lines = [
    `# Harness 跑法版本 ${versionId}`,
    '',
    `- proposalId: ${proposal.id}`,
    `- createdAt: ${proposal.createdAt}`,
    `- summary: ${proposal.summary}`,
    `- weaknesses: ${proposal.targetWeaknessCodes.join(', ') || '(none)'}`,
    '',
    '## Patches',
    '',
  ]
  for (const p of proposal.patches) {
    lines.push(`### ${p.kind}`)
    if (p.kind === 'skill_body_append') {
      lines.push(`- skill: ${p.skillName}`, '', '```', p.text, '```', '')
    } else if (p.kind === 'skill_body_replace_span') {
      lines.push(`- skill: ${p.skillName}`, `- from: ${p.from}`, `- to: ${p.to}`, '')
    } else {
      lines.push('', '```', p.text, '```', '')
    }
  }
  return lines.join('\n')
}

/**
 * 晋升：写入本地仓并设为对应 modelBucket 的 active（不改内置技能文件）。
 */
export function promoteHarnessProposal(
  proposal: HarnessProposal,
  opts?: {
    versionId?: string
    modelBucket?: string
    source?: 'manual' | 'auto'
  },
): HarnessVersionRecord {
  assertProposalSafe(proposal)
  const versionId = opts?.versionId ?? `hv-${Date.now().toString(36)}`
  const modelBucket =
    normalizeHarnessModelRef(opts?.modelBucket) ?? HARNESS_WILDCARD_BUCKET
  const source = opts?.source ?? 'manual'
  const tier = classifyVersionTier(proposal.patches)

  let version: HarnessVersionRecord = {
    id: versionId,
    createdAt: nowIso(),
    proposalId: proposal.id,
    summary: proposal.summary,
    patches: [...proposal.patches],
    skippedPatches: [],
    exportMarkdown: proposalToExportMarkdown(proposal, versionId),
    modelBucket,
    tier,
  }
  version = softSkipMissingSkills(version)

  const store = loadHarnessStore()
  store.versions[versionId] = version
  store.activeByModel[modelBucket] = versionId
  if (modelBucket === HARNESS_WILDCARD_BUCKET) {
    store.activeVersionId = versionId
  }
  appendAudit(store, {
    action: source === 'auto' ? 'promote_auto' : 'promote_manual',
    modelRef: modelBucket,
    versionId,
    detail: proposal.summary?.slice(0, 120),
  })
  saveHarnessStore(store)
  clearHarnessOverlayCache()
  return version
}

/** 清空指定模型桶 active */
export function rollbackHarnessForModel(modelRef: string): void {
  const key = normalizeHarnessModelRef(modelRef) ?? HARNESS_WILDCARD_BUCKET
  const store = loadHarnessStore()
  store.activeByModel[key] = null
  if (key === HARNESS_WILDCARD_BUCKET) {
    store.activeVersionId = null
  }
  appendAudit(store, {
    action: 'rollback_model',
    modelRef: key,
    versionId: null,
  })
  saveHarnessStore(store)
  clearHarnessOverlayCache()
}

/**
 * 无参：兼容 Phase1 = 清空 '*'（及 activeVersionId）
 * 有参：等同 rollbackHarnessForModel
 */
export function rollbackHarnessToDefault(modelRef?: string): void {
  if (modelRef !== undefined) {
    rollbackHarnessForModel(modelRef)
    return
  }
  const store = loadHarnessStore()
  store.activeByModel[HARNESS_WILDCARD_BUCKET] = null
  store.activeVersionId = null
  appendAudit(store, {
    action: 'rollback_default',
    modelRef: HARNESS_WILDCARD_BUCKET,
    versionId: null,
  })
  saveHarnessStore(store)
  clearHarnessOverlayCache()
}

export function getHarnessAutoPromotePref(): HarnessAutoPromotePref {
  return loadHarnessStore().autoPromote
}

export function setHarnessAutoPromote(enabled: boolean): HarnessAutoPromotePref {
  const store = loadHarnessStore()
  const pref: HarnessAutoPromotePref = { enabled, updatedAt: nowIso() }
  store.autoPromote = pref
  appendAudit(store, {
    action: 'set_auto_promote',
    detail: enabled ? 'enabled' : 'disabled',
  })
  saveHarnessStore(store)
  return pref
}

/** env `OPPTRIX_HARNESS_AUTO_PROMOTE` 为 0|false|off 时强制关闭自动合入 */
export function isHarnessAutoPromoteEnvForcedOff(): boolean {
  const env = process.env.OPPTRIX_HARNESS_AUTO_PROMOTE
  if (env == null) return false
  const v = env.trim().toLowerCase()
  return v === '0' || v === 'false' || v === 'off'
}

/**
 * 自动晋升是否开启：env 最高优先（0|false|off → 关），其次 store.autoPromote。
 */
export function isHarnessAutoPromoteEnabled(): boolean {
  if (isHarnessAutoPromoteEnvForcedOff()) return false
  return loadHarnessStore().autoPromote.enabled !== false
}

/** REST / UI 用：有效开关 + 可选 env 强制关标记 */
export function getHarnessAutoPromoteEffectiveState(): {
  enabled: boolean
  updatedAt: string
  envForcedOff?: boolean
} {
  const pref = getHarnessAutoPromotePref()
  const envForcedOff = isHarnessAutoPromoteEnvForcedOff()
  return {
    enabled: isHarnessAutoPromoteEnabled(),
    updatedAt: pref.updatedAt,
    ...(envForcedOff ? { envForcedOff: true as const } : {}),
  }
}

export function appendHarnessAudit(
  entry: Omit<HarnessAuditEntry, 'at'> & { at?: string },
): void {
  const store = loadHarnessStore()
  appendAudit(store, entry)
  saveHarnessStore(store)
}

/** 测试 / 会话：清空 overlay 解析缓存 */
let overlayCacheEpoch = 0
const overlayBodyCache = new Map<string, string>()

export function clearHarnessOverlayCache(): void {
  overlayCacheEpoch += 1
  overlayBodyCache.clear()
}

export function getHarnessOverlayCacheEpoch(): number {
  return overlayCacheEpoch
}

export function readOverlayBodyCache(key: string): string | undefined {
  return overlayBodyCache.get(key)
}

export function writeOverlayBodyCache(key: string, body: string): void {
  overlayBodyCache.set(key, body)
}
