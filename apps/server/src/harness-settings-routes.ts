import type { FastifyInstance } from 'fastify'
import {
  HARNESS_WILDCARD_BUCKET,
  getActiveHarnessVersionForModel,
  getHarnessAutoPromoteEffectiveState,
  listHarnessVersions,
  loadHarnessStore,
  normalizeHarnessModelRef,
  rollbackHarnessForModel,
  setHarnessAutoPromote,
  type HarnessPatchTier,
  type HarnessStoreDocument,
  type HarnessVersionRecord,
} from '@opptrix/agent'

type VersionDto = {
  id: string
  createdAt: string
  summary: string | null
  modelBucket: string
  tier: HarnessPatchTier
  patchCount: number
}

type ActiveVersionDto = {
  id: string
  createdAt: string
  summary: string | null
  tier: HarnessPatchTier
}

function toVersionDto(v: HarnessVersionRecord): VersionDto {
  return {
    id: v.id,
    createdAt: v.createdAt,
    summary: v.summary ?? null,
    modelBucket: v.modelBucket ?? HARNESS_WILDCARD_BUCKET,
    tier: v.tier ?? 'A',
    patchCount: Array.isArray(v.patches) ? v.patches.length : 0,
  }
}

function toActiveVersionDto(v: HarnessVersionRecord): ActiveVersionDto {
  return {
    id: v.id,
    createdAt: v.createdAt,
    summary: v.summary ?? null,
    tier: v.tier ?? 'A',
  }
}

/** 与 resolveActiveHarnessVersionId 同序，返回实际命中的桶键 */
function resolveHitBucket(
  store: HarnessStoreDocument,
  modelRef: string | null | undefined,
): string | null {
  const normalized = normalizeHarnessModelRef(modelRef)
  if (normalized && Object.prototype.hasOwnProperty.call(store.activeByModel, normalized)) {
    return normalized
  }
  if (normalized) {
    const colonIdx = normalized.indexOf(':')
    if (colonIdx > 0) {
      const provider = normalized.slice(0, colonIdx).trim()
      if (provider) {
        const wild = `${provider}:*`
        if (Object.prototype.hasOwnProperty.call(store.activeByModel, wild)) {
          return wild
        }
      }
    }
  }
  if (Object.prototype.hasOwnProperty.call(store.activeByModel, HARNESS_WILDCARD_BUCKET)) {
    return HARNESS_WILDCARD_BUCKET
  }
  if (store.activeVersionId) return HARNESS_WILDCARD_BUCKET
  return null
}

function filterVersionsForModel(
  versions: HarnessVersionRecord[],
  modelRefRaw: string | undefined,
): HarnessVersionRecord[] {
  if (modelRefRaw === undefined) return versions
  const want = normalizeHarnessModelRef(modelRefRaw) ?? HARNESS_WILDCARD_BUCKET
  return versions.filter(v => {
    const bucket = v.modelBucket ?? HARNESS_WILDCARD_BUCKET
    return bucket === want || bucket === HARNESS_WILDCARD_BUCKET
  })
}

function parseAuditLimit(raw: unknown): number | { error: string } {
  if (raw === undefined || raw === null || raw === '') return 50
  const n = typeof raw === 'number' ? raw : Number(String(raw))
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
    return { error: '请提供有效的条数上限' }
  }
  return Math.min(n, 200)
}

export function registerHarnessSettingsRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: { modelRef?: string } }>(
    '/api/settings/harness/versions',
    async (req) => {
      const versions = filterVersionsForModel(
        listHarnessVersions(),
        req.query.modelRef,
      ).map(toVersionDto)
      return { versions }
    },
  )

  app.get<{ Querystring: { modelRef?: string } }>(
    '/api/settings/harness/active',
    async (req, reply) => {
      if (!('modelRef' in req.query)) {
        return reply.status(400).send({ error: '请指定当前模型' })
      }
      const modelRefRaw = req.query.modelRef ?? ''
      const modelRef = normalizeHarnessModelRef(modelRefRaw) ?? HARNESS_WILDCARD_BUCKET
      const store = loadHarnessStore()
      const resolvedBucket = resolveHitBucket(store, modelRefRaw)
      const active = getActiveHarnessVersionForModel(modelRefRaw)
      return {
        modelRef,
        resolvedBucket,
        version: active ? toActiveVersionDto(active) : null,
      }
    },
  )

  app.post<{ Body: { modelRef?: unknown } }>(
    '/api/settings/harness/rollback',
    async (req, reply) => {
      const body = req.body
      if (body == null || typeof body !== 'object' || Array.isArray(body)) {
        return reply.status(400).send({ error: '请检查提交内容' })
      }
      if (!('modelRef' in body) || typeof body.modelRef !== 'string') {
        return reply.status(400).send({ error: '请指定要恢复的模型' })
      }
      const modelRef = normalizeHarnessModelRef(body.modelRef) ?? HARNESS_WILDCARD_BUCKET
      rollbackHarnessForModel(body.modelRef)
      return { ok: true as const, modelRef }
    },
  )

  app.get('/api/settings/harness/auto-promote', async () => {
    return getHarnessAutoPromoteEffectiveState()
  })

  app.put<{ Body: { enabled?: unknown } }>(
    '/api/settings/harness/auto-promote',
    async (req, reply) => {
      const body = req.body
      if (body == null || typeof body !== 'object' || Array.isArray(body)) {
        return reply.status(400).send({ error: '请检查提交内容' })
      }
      if (typeof body.enabled !== 'boolean') {
        return reply.status(400).send({ error: '请选择开启或关闭' })
      }
      setHarnessAutoPromote(body.enabled)
      // 仍可写 store；返回有效状态（env 强制关时 enabled 仍为 false）
      return getHarnessAutoPromoteEffectiveState()
    },
  )

  app.get<{ Querystring: { limit?: string } }>(
    '/api/settings/harness/audit',
    async (req, reply) => {
      const parsed = parseAuditLimit(req.query.limit)
      if (typeof parsed === 'object') {
        return reply.status(400).send(parsed)
      }
      const store = loadHarnessStore()
      const entries = [...(store.auditLog ?? [])]
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, parsed)
        .map(e => ({
          at: e.at,
          action: e.action,
          ...(e.modelRef !== undefined ? { modelRef: e.modelRef } : {}),
          ...(e.versionId !== undefined ? { versionId: e.versionId } : {}),
          ...(e.detail !== undefined ? { detail: e.detail } : {}),
        }))
      return { entries }
    },
  )
}
