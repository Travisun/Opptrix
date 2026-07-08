/**
 * Provider 响应数据校验器 — 在引擎层校验 Provider 返回的数据质量。
 *
 * 用途：拦截过期、格式异常或字段缺失的响应，防止脏数据流入上层。
 * 设计：按 Capability 分发到专用校验器，做字段级最低校验（非深度 Schema 校验）。
 * 校验原则：区分"有真实数据"与"碰巧是非空数组的垃圾数据"。
 */

import { Capability } from './capabilities.js'

/**
 * 数据校验结果 — valid 为 true 表示数据可用，false 时 reason 说明拒绝原因。
 *
 * 调用方据此决定：跳过当前 Provider 并尝试下一个（sequential 策略），
 * 或记录熔断（连续多次 invalid 会触发熔断器）。
 */
export interface ValidationResult {
  /** 校验是否通过 */
  valid: boolean
  /** 校验失败原因（如 "no items with valid code+price"、"empty or non-array"） */
  reason?: string
}

// ── 类型守卫辅助函数 ──

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function hasNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function hasString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0
}

/** 校验代码字段是否为合法格式：CN 6位 / HK 5位 / US ticker / CRYPTO 含斜杠 */
function isValidCode(v: unknown): boolean {
  if (!hasString(v)) return false
  return /^\d{6}$/.test(v)
    || /^\d{5}$/.test(v)
    || /^[A-Z][A-Z0-9.-]{0,11}$/.test(v)
    || /^[A-Z]+\/[A-Z]+$/.test(v)
}

/** 校验日期字符串是否在 N 天有效期内（防止返回过期数据） */
function isDateFresh(dateStr: unknown, maxAgeDays: number): boolean {
  if (!hasString(dateStr)) return false
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return false
  const ageMs = Date.now() - d.getTime()
  return ageMs >= 0 && ageMs < maxAgeDays * 86_400_000
}

/** 校验价格字段是否合理（正数且非极端值） */
function isPlausiblePrice(v: unknown): boolean {
  if (!hasNumber(v)) return false
  return v > 0 && v < 1_000_000
}

// ── 按 Capability 分发的专用校验器 ──

type Validator = (data: unknown[]) => ValidationResult

/** 实时行情校验：至少一条数据含合法 code + 合理 price */
const realtimeValidator: Validator = (data) => {
  const hasValid = data.some(item =>
    isRecord(item) && isValidCode(item.code) && isPlausiblePrice(item.price),
  )
  if (!hasValid) return { valid: false, reason: 'no items with valid code+price' }
  return { valid: true }
}

/** K 线数据校验：至少一条数据含合法 code + 非空 date */
const klineValidator: Validator = (data) => {
  const hasValid = data.some(item =>
    isRecord(item) && isValidCode(item.code) && hasString(item.date),
  )
  if (!hasValid) return { valid: false, reason: 'no items with valid code+date' }
  return { valid: true }
}

/** 公司资料校验：至少一条数据含合法 code + 非空 name */
const profileValidator: Validator = (data) => {
  const hasValid = data.some(item =>
    isRecord(item) && isValidCode(item.code) && hasString(item.name),
  )
  if (!hasValid) return { valid: false, reason: 'no items with valid code+name' }
  return { valid: true }
}

/** 新闻/公告校验：至少一条数据含非空 title */
const newsValidator: Validator = (data) => {
  const hasValid = data.some(item =>
    isRecord(item) && hasString(item.title),
  )
  if (!hasValid) return { valid: false, reason: 'no items with title' }
  return { valid: true }
}

/** 通用兜底校验：至少一条非空对象记录 */
const genericValidator: Validator = (data) => {
  const hasValid = data.some(item => isRecord(item) && Object.keys(item).length > 0)
  if (!hasValid) return { valid: false, reason: 'no non-empty records' }
  return { valid: true }
}

/** Capability → Validator 映射表 */
const validators = new Map<Capability, Validator>([
  [Capability.STOCK_REALTIME, realtimeValidator],
  [Capability.INDEX_REALTIME, realtimeValidator],
  [Capability.STOCK_KLINE, klineValidator],
  [Capability.INDEX_KLINE, klineValidator],
  [Capability.STOCK_PROFILE, profileValidator],
  [Capability.NEWS, newsValidator],
])

/**
 * 校验 Provider 响应数据 — 根据 Capability 分派到对应校验器。
 * @param cap  数据能力类型
 * @param data Provider 返回的数据数组
 * @returns { valid: true } 表示通过，{ valid: false, reason } 表示拒绝
 */
export function validateResponse(cap: Capability, data: unknown[]): ValidationResult {
  if (!Array.isArray(data) || data.length === 0) {
    return { valid: false, reason: 'empty or non-array' }
  }

  const validator = validators.get(cap) ?? genericValidator
  return validator(data)
}
