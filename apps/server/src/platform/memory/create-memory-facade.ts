import { randomUUID } from 'node:crypto'
import type {
  DurableMemoryEntry,
  MemoryFacade,
  MemoryProvenance,
  MemoryWorkingSnapshot,
} from './types.js'

/** Global cap for in-memory durable promotions. */
export const DURABLE_MEMORY_CAP = 256

function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value
  if (value == null) return fallback
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return fallback
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

function normalizeWorkingSnapshot(raw: unknown): MemoryWorkingSnapshot | null {
  if (raw == null) return null
  if (typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const goal = asString(o.goal)
  const entities = asString(o.entities)
  const facts = asString(o.facts)
  const workingState = asString(o.workingState)
  const updatedAt = asString(o.updatedAt, '')
  const compactVersion = asNumber(o.compactVersion, 0)
  const sourceMessageCount = asNumber(o.sourceMessageCount, 0)
  const nonEmpty = Boolean(
    goal.trim() || entities.trim() || facts.trim() || workingState.trim(),
  )
  return {
    goal,
    entities,
    facts,
    workingState,
    updatedAt,
    compactVersion,
    sourceMessageCount,
    nonEmpty,
  }
}

function cloneProvenance(p: MemoryProvenance): MemoryProvenance {
  const out: MemoryProvenance = { source: p.source }
  if (p.at !== undefined) out.at = p.at
  if (p.ref !== undefined) out.ref = p.ref
  return out
}

function cloneEntry(e: DurableMemoryEntry): DurableMemoryEntry {
  return {
    id: e.id,
    sessionId: e.sessionId,
    kind: e.kind,
    content: e.content,
    provenance: cloneProvenance(e.provenance),
    createdAt: e.createdAt,
  }
}

/** In-memory MemoryFacade: late-bound working reader + durable promote with provenance. */
export function createMemoryFacade(): MemoryFacade {
  let workingReader:
    | ((sessionId: string) => MemoryWorkingSnapshot | null | unknown)
    | null = null
  const durable: DurableMemoryEntry[] = []

  return {
    bindWorkingSource(reader) {
      workingReader = reader
    },

    getWorking(sessionId) {
      if (!workingReader) return null
      const sid = String(sessionId ?? '').trim()
      try {
        return normalizeWorkingSnapshot(workingReader(sid))
      } catch {
        return null
      }
    },

    promote(input) {
      const sessionId = String(input?.sessionId ?? '').trim()
      const kind = String(input?.kind ?? '').trim()
      const content = String(input?.content ?? '').trim()
      if (!sessionId) {
        return { ok: false, error: 'sessionId required' }
      }
      if (!kind) {
        return { ok: false, error: 'kind required' }
      }
      if (!content) {
        return { ok: false, error: 'content required' }
      }

      const source = String(input?.provenance?.source ?? '').trim()
      if (!source) {
        return {
          ok: false,
          denialCode: 'provenance_required',
          error: 'provenance.source required',
        }
      }

      if (durable.length >= DURABLE_MEMORY_CAP) {
        return { ok: false, error: 'durable memory store full' }
      }

      const provenance: MemoryProvenance = { source }
      const at = input.provenance?.at
      const ref = input.provenance?.ref
      if (typeof at === 'string' && at.trim()) provenance.at = at.trim()
      if (typeof ref === 'string' && ref.trim()) provenance.ref = ref.trim()

      const id = randomUUID()
      durable.push({
        id,
        sessionId,
        kind,
        content,
        provenance,
        createdAt: new Date().toISOString(),
      })
      return { ok: true, id }
    },

    listDurable(sessionId) {
      const sid =
        sessionId === undefined || sessionId === null
          ? null
          : String(sessionId).trim()
      const rows =
        sid && sid.length > 0
          ? durable.filter((e) => e.sessionId === sid)
          : durable
      return rows.map(cloneEntry)
    },
  }
}
