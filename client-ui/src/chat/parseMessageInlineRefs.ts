/**
 * 将用户消息 sendText 解析为可渲染段：纯文本 / 技能 chip / 标的 chip。
 * 与 Composer `createChipElement` 的 sendText 约定对齐：
 * - `@skill:valid-name`
 * - `名称(CODE)` — CODE 为 OpptrixQuant 统一 ID（如 CN:STOCK:600519.SH）或 legacy 命名空间（CN:SH.600519）
 */
import type { InstrumentRef } from '../types/instrument'
import {
  marketDisplayName,
  normalizeInstrumentRef,
  parseInstrumentNamespace,
  parseOpptrixInstrumentId,
} from '../market/instrument'

export type MessageInlineRefSegment =
  | { kind: 'text'; value: string }
  | { kind: 'skill'; name: string }
  | { kind: 'instrument'; name: string; code: string; market: string | null }

/** 与 packages/agent-skills `isValidSkillName` 同口径（hyphen 小写）。 */
const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function isValidSkillName(name: string): boolean {
  if (!name || name.length < 1 || name.length > 64) return false
  if (name.startsWith('-') || name.endsWith('-')) return false
  if (name.includes('--')) return false
  return SKILL_NAME_RE.test(name)
}

/** 解析括号内标的 code → InstrumentRef（Opptrix ID 优先，兼容 legacy 命名空间） */
export function parseInstrumentRefFromInlineCode(code: string): InstrumentRef | null {
  const trimmed = code.trim()
  if (!trimmed) return null
  const opptrix = parseOpptrixInstrumentId(trimmed)
  if (opptrix) {
    return normalizeInstrumentRef(opptrix as InstrumentRef)
  }
  return parseInstrumentNamespace(trimmed)
}

/** 括号内是否为可路由的标的 code（Opptrix ID 或 Stock-index 命名空间） */
export function isInstrumentNamespace(code: string): boolean {
  return parseInstrumentRefFromInlineCode(code) != null
}

function marketLabelFromCode(code: string): string | null {
  const ref = parseInstrumentRefFromInlineCode(code)
  if (!ref || ref.market === 'CN') return null
  return marketDisplayName(ref.market)
}

const SKILL_AT = '@skill:'

function tryMatchSkill(input: string, from: number): { end: number; name: string } | null {
  if (!input.startsWith(SKILL_AT, from)) return null
  const start = from + SKILL_AT.length
  let end = start
  while (end < input.length) {
    const ch = input[end]!
    if ((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch === '-') {
      end += 1
      continue
    }
    break
  }
  if (end === start) return null
  const name = input.slice(start, end)
  if (!isValidSkillName(name)) return null
  return { end, name }
}

function isInstrumentNameChar(ch: string): boolean {
  return ch !== '(' && ch !== ')' && !/\s/.test(ch)
}

/**
 * 从 `from` 起找下一处 `名称(CODE)`。
 * CODE 须为 Opptrix ID 或 legacy 命名空间；普通括号内容跳过。
 */
function tryMatchInstrument(
  input: string,
  from: number,
): { start: number; end: number; name: string; code: string; market: string | null } | null {
  let search = from
  while (search < input.length) {
    const open = input.indexOf('(', search)
    if (open < 0) return null
    const close = input.indexOf(')', open + 1)
    if (close < 0) return null
    const code = input.slice(open + 1, close)
    if (!isInstrumentNamespace(code)) {
      search = open + 1
      continue
    }
    let nameStart = open
    while (nameStart > from && isInstrumentNameChar(input[nameStart - 1]!)) {
      nameStart -= 1
    }
    if (nameStart === open) {
      search = close + 1
      continue
    }
    if (nameStart < from) {
      search = open + 1
      continue
    }
    const name = input.slice(nameStart, open)
    return {
      start: nameStart,
      end: close + 1,
      name,
      code: code.trim(),
      market: marketLabelFromCode(code),
    }
  }
  return null
}

function pushText(out: MessageInlineRefSegment[], value: string) {
  if (!value) return
  const last = out[out.length - 1]
  if (last?.kind === 'text') {
    last.value += value
    return
  }
  out.push({ kind: 'text', value })
}

/**
 * 解析消息正文中的内联引用。调用方应先压扁空白（如 `text.replace(/\s+/g, ' ')`）。
 */
export function parseMessageInlineRefs(input: string): MessageInlineRefSegment[] {
  if (!input) return []
  const out: MessageInlineRefSegment[] = []
  let i = 0
  while (i < input.length) {
    const skill = tryMatchSkill(input, i)
    if (skill) {
      out.push({ kind: 'skill', name: skill.name })
      i = skill.end
      continue
    }

    const instrument = tryMatchInstrument(input, i)
    if (instrument) {
      if (instrument.start > i) {
        pushText(out, input.slice(i, instrument.start))
      }
      out.push({
        kind: 'instrument',
        name: instrument.name,
        code: instrument.code,
        market: instrument.market,
      })
      i = instrument.end
      continue
    }

    pushText(out, input[i]!)
    i += 1
  }
  return out
}
