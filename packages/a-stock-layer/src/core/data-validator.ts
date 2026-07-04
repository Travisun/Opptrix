/**
 * Provider response data validator — validates data quality at the engine level
 * before returning to callers. Catches stale, malformed, or incomplete responses
 * that individual providers may slip through.
 *
 * Design: per-capability validators with field-level checks. Lightweight by design —
 * no deep schema validation, just the minimum needed to distinguish "real data"
 * from "garbage that happens to be a non-empty array".
 */

import { Capability } from './capabilities.js'

export interface ValidationResult {
  valid: boolean
  reason?: string
}

// ── Helpers ──

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function hasNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function hasString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0
}

/** Check that a code field looks like a valid stock/index code. */
function isValidCode(v: unknown): boolean {
  if (!hasString(v)) return false
  // CN: 6 digits; US: 1-5 letters; CRYPTO: contains /
  return /^\d{6}$/.test(v) || /^[A-Z]{1,5}$/.test(v) || /^[A-Z]+\/[A-Z]+$/.test(v)
}

/** Check that a date string is within N days of now. */
function isDateFresh(dateStr: unknown, maxAgeDays: number): boolean {
  if (!hasString(dateStr)) return false
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return false
  const ageMs = Date.now() - d.getTime()
  return ageMs >= 0 && ageMs < maxAgeDays * 86_400_000
}

/** Check that a price-like value is plausible (positive and non-trivial). */
function isPlausiblePrice(v: unknown): boolean {
  if (!hasNumber(v)) return false
  return v > 0 && v < 1_000_000 // reject negative, zero, and absurdly large
}

// ── Per-capability validators ──

type Validator = (data: unknown[]) => ValidationResult

const realtimeValidator: Validator = (data) => {
  // At least one item must have a valid code AND a plausible price
  const hasValid = data.some(item =>
    isRecord(item) && isValidCode(item.code) && isPlausiblePrice(item.price),
  )
  if (!hasValid) return { valid: false, reason: 'no items with valid code+price' }
  return { valid: true }
}

const klineValidator: Validator = (data) => {
  const hasValid = data.some(item =>
    isRecord(item) && isValidCode(item.code) && hasString(item.date),
  )
  if (!hasValid) return { valid: false, reason: 'no items with valid code+date' }
  return { valid: true }
}

const profileValidator: Validator = (data) => {
  const hasValid = data.some(item =>
    isRecord(item) && isValidCode(item.code) && hasString(item.name),
  )
  if (!hasValid) return { valid: false, reason: 'no items with valid code+name' }
  return { valid: true }
}

const newsValidator: Validator = (data) => {
  const hasValid = data.some(item =>
    isRecord(item) && hasString(item.title),
  )
  if (!hasValid) return { valid: false, reason: 'no items with title' }
  return { valid: true }
}

const genericValidator: Validator = (data) => {
  // At least one item must be a non-empty record
  const hasValid = data.some(item => isRecord(item) && Object.keys(item).length > 0)
  if (!hasValid) return { valid: false, reason: 'no non-empty records' }
  return { valid: true }
}

const validators = new Map<Capability, Validator>([
  [Capability.STOCK_REALTIME, realtimeValidator],
  [Capability.INDEX_REALTIME, realtimeValidator],
  [Capability.STOCK_KLINE, klineValidator],
  [Capability.INDEX_KLINE, klineValidator],
  [Capability.STOCK_PROFILE, profileValidator],
  [Capability.NEWS, newsValidator],
])

/**
 * Validate provider response data for a given capability.
 * Returns { valid: true } if data passes, { valid: false, reason } otherwise.
 */
export function validateResponse(cap: Capability, data: unknown[]): ValidationResult {
  if (!Array.isArray(data) || data.length === 0) {
    return { valid: false, reason: 'empty or non-array' }
  }

  const validator = validators.get(cap) ?? genericValidator
  return validator(data)
}
