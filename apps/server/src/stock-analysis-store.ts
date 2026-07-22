import { getUserDataStore } from '@opptrix/user-store'

const NAMESPACE = 'stock_analysis'

/** Persisted analysis payload — mirrors client RawDecisionPayload shape. */
export interface StockAnalysisRaw {
  evalData: unknown
  strategy: unknown
  institution: unknown
  cyq: unknown
  radar: unknown
}

export interface StockAnalysisRecord {
  instrumentKey: string
  analyzedAt: string
  raw: StockAnalysisRaw
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function isStockAnalysisRaw(value: unknown): value is StockAnalysisRaw {
  if (!isRecord(value)) return false
  return (
    'evalData' in value
    && 'strategy' in value
    && 'institution' in value
    && 'cyq' in value
    && 'radar' in value
  )
}

function parseRecord(value: unknown, expectedKey?: string): StockAnalysisRecord | null {
  if (!isRecord(value)) return null
  const instrumentKey = value.instrumentKey
  const analyzedAt = value.analyzedAt
  if (typeof instrumentKey !== 'string' || !instrumentKey.trim()) return null
  if (typeof analyzedAt !== 'string' || !analyzedAt.trim()) return null
  if (!isStockAnalysisRaw(value.raw)) return null
  if (expectedKey && instrumentKey !== expectedKey) return null
  return {
    instrumentKey,
    analyzedAt,
    raw: {
      evalData: value.raw.evalData ?? null,
      strategy: value.raw.strategy ?? null,
      institution: value.raw.institution ?? null,
      cyq: value.raw.cyq ?? null,
      radar: value.raw.radar ?? null,
    },
  }
}

export function getLatestStockAnalysis(instrumentKey: string): StockAnalysisRecord | null {
  const key = instrumentKey.trim()
  if (!key) return null
  const stored = getUserDataStore().getDocument<unknown>(NAMESPACE, key)
  return parseRecord(stored, key)
}

export function saveStockAnalysis(record: StockAnalysisRecord): StockAnalysisRecord {
  const key = record.instrumentKey.trim()
  const normalized: StockAnalysisRecord = {
    instrumentKey: key,
    analyzedAt: record.analyzedAt,
    raw: {
      evalData: record.raw.evalData ?? null,
      strategy: record.raw.strategy ?? null,
      institution: record.raw.institution ?? null,
      cyq: record.raw.cyq ?? null,
      radar: record.raw.radar ?? null,
    },
  }
  getUserDataStore().setDocument(NAMESPACE, key, normalized)
  return normalized
}

export function deleteStockAnalysis(instrumentKey: string): boolean {
  const key = instrumentKey.trim()
  if (!key) return false
  getUserDataStore().deleteDocument(NAMESPACE, key)
  return true
}

export function parseStockAnalysisBody(
  instrumentKey: string,
  body: unknown,
): { ok: true; record: StockAnalysisRecord } | { ok: false; error: string } {
  const key = instrumentKey.trim()
  if (!key) return { ok: false, error: 'instrumentKey required' }
  if (!isRecord(body)) return { ok: false, error: 'body required' }
  const analyzedAt = typeof body.analyzedAt === 'string' ? body.analyzedAt.trim() : ''
  if (!analyzedAt) return { ok: false, error: 'analyzedAt required' }
  if (!isStockAnalysisRaw(body.raw)) return { ok: false, error: 'raw payload invalid' }
  return {
    ok: true,
    record: {
      instrumentKey: key,
      analyzedAt,
      raw: {
        evalData: body.raw.evalData ?? null,
        strategy: body.raw.strategy ?? null,
        institution: body.raw.institution ?? null,
        cyq: body.raw.cyq ?? null,
        radar: body.raw.radar ?? null,
      },
    },
  }
}
