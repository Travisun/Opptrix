/**
 * 将用户消息 sendText 解析为可渲染段：纯文本 / 技能 chip / 标的 chip。
 * 与 Composer `createChipElement` 的 sendText 约定对齐：
 * - `@skill:valid-name`
 * - `名称(NAMESPACE)`（NAMESPACE 为 Stock-index 统一命名空间）
 */

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

/** 与 `buildInstrumentNamespace` / parseInstrumentNamespaceLocal 对齐的 NAMESPACE。 */
const INSTRUMENT_NAMESPACE_RE =
  /^(?:CN:(?:SH|SZ|BJ)[.:]\d{6}|US:(?:(?:NYSE|NASDAQ|AMEX)\.)?[A-Z0-9.-]+|HK:\d{5}|CRYPTO:(?:(?:BINANCE|OKX)\.)?[A-Z0-9]+\/[A-Z0-9]+|JP:[A-Z0-9.-]+|KR:\d{1,6})$/i

export function isInstrumentNamespace(code: string): boolean {
  return INSTRUMENT_NAMESPACE_RE.test(code.trim())
}

function marketLabelFromNamespace(code: string): string | null {
  const upper = code.trim().toUpperCase()
  if (upper.startsWith('CN:')) return null
  if (upper.startsWith('US:')) return '美股'
  if (upper.startsWith('HK:')) return '港股'
  if (upper.startsWith('JP:')) return '日股'
  if (upper.startsWith('KR:')) return '韩股'
  if (upper.startsWith('CRYPTO:')) return 'Crypto'
  return null
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
  // 空白 / 括号打断名称；其余（含中文、字母数字、点号等）可构成名称
  return ch !== '(' && ch !== ')' && !/\s/.test(ch)
}

/**
 * 从 `from` 起找下一处 `名称(NAMESPACE)`。
 * 先定位合法 NAMESPACE 的括号对，再向前取连续非空白非括号作为名称。
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
    // 向前取名称：紧贴 `(` 的连续非空白非括号字符
    let nameStart = open
    while (nameStart > from && isInstrumentNameChar(input[nameStart - 1]!)) {
      nameStart -= 1
    }
    // 名称须从 from 可达：中间只能是「将被记为 text」的前缀
    // 若 nameStart > from，前缀是 text；名称本身不能为空
    if (nameStart === open) {
      search = close + 1
      continue
    }
    // 若 from 落在名称中间，不能从 from 切开名称 → 跳过，让调用方逐字前进
    if (nameStart < from) {
      search = open + 1
      continue
    }
    const name = input.slice(nameStart, open)
    return {
      start: nameStart,
      end: close + 1,
      name,
      code,
      market: marketLabelFromNamespace(code),
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
