/**
 * 聊天标题人性化：技能 → 中文短标题，标的 → 名称（非代码）。
 * 写入 session.title / 协作 label 等持久化字段时使用。
 */
import type { InstrumentRef } from './market-data.js'
import {
  buildOpptrixInstrumentId,
  parseInstrumentNamespace,
  parseOpptrixInstrumentId,
  tryParseInstrumentInput,
} from './instrument-symbol.js'
import { instrumentDisplayCode, instrumentRefKey } from './instrument-ref.js'
import { skillTitleForName } from './builtin-skill-titles.js'

export type ChatTitleNameLookup = ReadonlyMap<string, string>

const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const SKILL_AT_RE = /@skill:([a-z0-9]+(?:-[a-z0-9]+)*)/g

/** Opptrix ID / 命名空间等裸码片段 */
const BARE_INSTRUMENT_TOKEN_RE =
  /\b(?:CN|US|HK|JP|KR|CRYPTO):(?:[A-Z][A-Z0-9_]*:)?[A-Z0-9./_-]+\b|\bCN:(?:SH|SZ|BJ)[.:]\d{6}\b/gi

export function isValidSkillName(name: string): boolean {
  if (!name || name.length < 1 || name.length > 64) return false
  if (name.startsWith('-') || name.endsWith('-')) return false
  if (name.includes('--')) return false
  return SKILL_NAME_RE.test(name)
}

export function isInstrumentNamespace(code: string): boolean {
  return parseInstrumentNamespace(code.trim()) != null
}

function isOpptrixInstrumentCode(code: string): boolean {
  return parseOpptrixInstrumentId(code.trim()) != null
}

function normalizeLookupKey(raw: string): string {
  return raw.trim()
}

function lookupName(token: string, lookup: ChatTitleNameLookup | undefined): string | null {
  if (!lookup?.size) return null
  const key = normalizeLookupKey(token)
  if (!key) return null
  const direct = lookup.get(key)
  if (direct) return direct
  const upper = key.toUpperCase()
  if (upper !== key) {
    const hit = lookup.get(upper)
    if (hit) return hit
  }
  const parsed = tryParseInstrumentInput(key)
  if (parsed) {
    const byKey = lookup.get(instrumentRefKey(parsed))
    if (byKey) return byKey
    const byId = lookup.get(buildOpptrixInstrumentId(parsed))
    if (byId) return byId
    const byDisplay = lookup.get(instrumentDisplayCode(parsed))
    if (byDisplay) return byDisplay
  }
  return null
}

function isLikelyBareCode(name: string, code: string): boolean {
  const n = name.trim()
  const c = code.trim()
  if (!n || n === c) return true
  if (isOpptrixInstrumentCode(n) || isInstrumentNamespace(n)) return true
  if (/^[A-Z0-9:./_-]+$/i.test(n) && n.length >= 4) return true
  return false
}

/** 从 code / instrumentKey → 名称条目构建 lookup */
export function buildChatTitleNameLookup(
  entries: Iterable<{ keys: string[]; name: string }>,
): Map<string, string> {
  const map = new Map<string, string>()
  for (const entry of entries) {
    const name = entry.name.trim()
    if (!name) continue
    for (const key of entry.keys) {
      const k = key.trim()
      if (k) map.set(k, name)
    }
  }
  return map
}

/** 从标题文本中提取可能需要 resolve-names 的 InstrumentRef */
export function collectInstrumentRefsForTitle(
  text: string,
  lookup: ChatTitleNameLookup,
): InstrumentRef[] {
  const refs: InstrumentRef[] = []
  const seen = new Set<string>()
  const pushRef = (ref: InstrumentRef | null) => {
    if (!ref) return
    const key = instrumentRefKey(ref)
    if (seen.has(key)) return
    if (lookupName(key, lookup) || lookupName(buildOpptrixInstrumentId(ref), lookup)) return
    seen.add(key)
    refs.push(ref)
  }

  let m: RegExpExecArray | null
  const parenRe = /\(([^)]+)\)/g
  while ((m = parenRe.exec(text)) !== null) {
    const inner = m[1]?.trim() ?? ''
    if (!inner || (!isInstrumentNamespace(inner) && !isOpptrixInstrumentCode(inner))) continue
    pushRef(tryParseInstrumentInput(inner))
  }

  const bareRe = new RegExp(BARE_INSTRUMENT_TOKEN_RE.source, BARE_INSTRUMENT_TOKEN_RE.flags)
  while ((m = bareRe.exec(text)) !== null) {
    const token = m[0]?.trim() ?? ''
    if (!token) continue
    if (lookupName(token, lookup)) continue
    pushRef(tryParseInstrumentInput(token))
  }

  return refs
}

/**
 * 将含 @skill / 标的代码的原文转为用户可读标题（同步；lookup 可含 resolve-names 结果）。
 */
export function humanizeChatTitle(
  raw: string,
  lookup?: ChatTitleNameLookup,
  maxLen = 48,
): string {
  let s = raw.replace(/\s+/g, ' ').trim()
  if (!s) return '新对话'

  s = s.replace(SKILL_AT_RE, (_, skillName: string) => {
    if (!isValidSkillName(skillName)) return `@skill:${skillName}`
    return skillTitleForName(skillName)
  })

  s = s.replace(/([^\s(]+)\(([^)]+)\)/g, (full, namePart: string, codePart: string) => {
    const code = codePart.trim()
    if (!isInstrumentNamespace(code) && !isOpptrixInstrumentCode(code)) return full
    const resolved = lookupName(code, lookup)
    const name = namePart.trim()
    if (resolved) return resolved
    if (name && !isLikelyBareCode(name, code)) return name
    return code
  })

  s = s.replace(BARE_INSTRUMENT_TOKEN_RE, (token) => {
    const resolved = lookupName(token, lookup)
    return resolved ?? token
  })

  s = s.replace(/\s+/g, ' ').trim()
  if (s.length <= maxLen) return s
  return `${s.slice(0, maxLen)}…`
}
