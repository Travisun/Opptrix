/**
 * DeepSeek DSML 工具调用标记：部分线路把 invoke 写进 message.content，
 * 而未填结构化 tool_calls。本模块剥离用户可见泄漏，并在可能时解析为 OpenAI ToolCall。
 */

import { randomUUID } from 'node:crypto'
import type { ToolCall } from './provider.js'

/**
 * 全角 ｜ 与 ASCII | 均可；两侧各允许 1+ 个；允许紧邻空格。
 * 必须含 DSML 关键字，禁止裸 `|`，避免误伤 Markdown 表格。
 * strip / detect / parse / invoke / parameter 共用此模式，语义不分叉。
 */
const DSML = String.raw`(?:｜|\|)+\s*DSML\s*(?:｜|\|)+`

const BLOCK_OPEN = String.raw`<\s*${DSML}\s*(?:tool_calls|function_calls)\s*>`
const BLOCK_CLOSE = String.raw`<\s*/\s*${DSML}\s*(?:tool_calls|function_calls)\s*>`

const COMPLETE_BLOCK_RE = new RegExp(`${BLOCK_OPEN}[\\s\\S]*?${BLOCK_CLOSE}`, 'gi')
const OPEN_TAG_RE = new RegExp(BLOCK_OPEN, 'i')
const BLOCK_CLOSE_RE = new RegExp(BLOCK_CLOSE, 'i')

const INVOKE_OPEN_RE = new RegExp(
  String.raw`<\s*${DSML}\s*invoke\s+name\s*=\s*["']([^"']+)["']\s*>`,
  'gi',
)
const INVOKE_CLOSE_RE = new RegExp(String.raw`<\s*/\s*${DSML}\s*invoke\s*>`, 'gi')

const PARAMETER_RE = new RegExp(
  String.raw`<\s*${DSML}\s*parameter\s+([^>]*?)\s*>` +
    String.raw`([\s\S]*?)` +
    String.raw`<\s*/\s*${DSML}\s*parameter\s*>`,
  'gi',
)
const PARAMETER_OPEN_RE = new RegExp(
  String.raw`<\s*${DSML}\s*parameter\s+([^>]*?)\s*>`,
  'gi',
)

/** 残缺开标签兜底：不要求完整 `>`，从该处截到 EOS（仍须含 DSML） */
const LOOSE_OPEN_ANY_RE = new RegExp(
  String.raw`<\s*${DSML}\s*(?:tool_calls|function_calls|invoke|parameter)\b`,
  'i',
)

const NAME_ATTR_RE = /\bname\s*=\s*["']([^"']+)["']/i

function tidyVisibleText(text: string): string {
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trimEnd()
}

export function stripDsmlToolMarkup(text: string): string {
  if (!text) return text
  let out = text.replace(COMPLETE_BLOCK_RE, '')
  const open = OPEN_TAG_RE.exec(out)
  if (open && open.index != null) {
    out = out.slice(0, open.index)
  }
  // 未匹配的 invoke 开标签：从该处截断到 EOS，防止泄漏
  INVOKE_OPEN_RE.lastIndex = 0
  const inv = INVOKE_OPEN_RE.exec(out)
  if (inv && inv.index != null) {
    out = out.slice(0, inv.index)
  }
  // 残缺开标签回退：完整块/invoke 之后仍残留时，从该处截到 EOS
  const loose = LOOSE_OPEN_ANY_RE.exec(out)
  if (loose && loose.index != null) {
    out = out.slice(0, loose.index)
  }
  return tidyVisibleText(out)
}

function coerceParamValue(raw: string, attrs: string): unknown {
  const trimmed = raw.trim()
  const forceString = /\bstring\s*=\s*["']true["']/i.test(attrs)
  if (forceString) return trimmed
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(trimmed)) return Number(trimmed)
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}'))
    || (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed) as unknown
    } catch {
      return trimmed
    }
  }
  return trimmed
}

function parseParameters(inner: string): Record<string, unknown> {
  const args: Record<string, unknown> = {}
  let lastEnd = 0
  PARAMETER_RE.lastIndex = 0
  let param: RegExpExecArray | null
  while ((param = PARAMETER_RE.exec(inner)) !== null) {
    const attrs = param[1] ?? ''
    const nameMatch = NAME_ATTR_RE.exec(attrs)
    const key = nameMatch?.[1]?.trim()
    if (key) {
      args[key] = coerceParamValue(param[2] ?? '', attrs)
    }
    lastEnd = param.index + param[0].length
  }

  // 末尾未闭合 parameter：取值到 EOS
  PARAMETER_OPEN_RE.lastIndex = lastEnd
  const openParam = PARAMETER_OPEN_RE.exec(inner)
  if (openParam) {
    const attrs = openParam[1] ?? ''
    const nameMatch = NAME_ATTR_RE.exec(attrs)
    const key = nameMatch?.[1]?.trim()
    if (key && !(key in args)) {
      const valueStart = openParam.index + openParam[0].length
      args[key] = coerceParamValue(inner.slice(valueStart), attrs)
    }
  }
  return args
}

function makeToolCall(name: string, args: Record<string, unknown>): ToolCall {
  return {
    id: `call_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
    type: 'function',
    function: {
      name,
      arguments: JSON.stringify(args),
    },
  }
}

/**
 * 解析完整与未闭合的 invoke：
 * - 有闭合标签则取闭合体内参数
 * - 无闭合则取到下一 invoke / tool_calls 闭合 / EOS
 */
function parseInvokes(blockBody: string): ToolCall[] {
  const calls: ToolCall[] = []
  let searchFrom = 0

  while (searchFrom < blockBody.length) {
    INVOKE_OPEN_RE.lastIndex = searchFrom
    const open = INVOKE_OPEN_RE.exec(blockBody)
    if (!open || open.index == null) break

    const name = (open[1] ?? '').trim()
    const bodyStart = open.index + open[0].length

    INVOKE_CLOSE_RE.lastIndex = bodyStart
    const close = INVOKE_CLOSE_RE.exec(blockBody)

    INVOKE_OPEN_RE.lastIndex = bodyStart
    const nextOpen = INVOKE_OPEN_RE.exec(blockBody)

    let bodyEnd: number
    let nextSearch: number

    if (close && (!nextOpen || close.index < nextOpen.index)) {
      bodyEnd = close.index
      nextSearch = close.index + close[0].length
    } else if (nextOpen && nextOpen.index != null) {
      bodyEnd = nextOpen.index
      nextSearch = nextOpen.index
    } else {
      const rest = blockBody.slice(bodyStart)
      const blockClose = BLOCK_CLOSE_RE.exec(rest)
      if (blockClose && blockClose.index != null) {
        bodyEnd = bodyStart + blockClose.index
      } else {
        bodyEnd = blockBody.length
      }
      nextSearch = bodyEnd
    }

    if (name) {
      calls.push(makeToolCall(name, parseParameters(blockBody.slice(bodyStart, bodyEnd))))
    }
    searchFrom = Math.max(nextSearch, bodyStart)
  }

  return calls
}

function extractDsmlBlocks(text: string): string[] {
  const bodies: string[] = []
  COMPLETE_BLOCK_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = COMPLETE_BLOCK_RE.exec(text)) !== null) {
    const full = m[0]
    const openMatch = new RegExp(`^${BLOCK_OPEN}`, 'i').exec(full)
    const closeMatch = new RegExp(`${BLOCK_CLOSE}$`, 'i').exec(full)
    if (!openMatch) continue
    const start = openMatch[0].length
    const end = closeMatch ? full.length - closeMatch[0].length : full.length
    bodies.push(full.slice(start, end))
  }
  const strippedComplete = text.replace(COMPLETE_BLOCK_RE, '')
  const open = OPEN_TAG_RE.exec(strippedComplete)
  if (open && open.index != null) {
    const afterOpen = strippedComplete.slice(open.index + open[0].length)
    bodies.push(afterOpen)
  } else {
    // 孤立 invoke：无 tool_calls / function_calls 包裹时仍解析
    INVOKE_OPEN_RE.lastIndex = 0
    const inv = INVOKE_OPEN_RE.exec(strippedComplete)
    if (inv && inv.index != null) {
      bodies.push(strippedComplete.slice(inv.index))
    }
  }
  return bodies
}

/**
 * 剥离 DSML 工具标记；若可解析出 invoke，则返回 OpenAI 形 tool_calls。
 */
export function tryParseDsmlToolCalls(text: string): {
  text: string
  toolCalls: ToolCall[]
} {
  if (!text) return { text: text ?? '', toolCalls: [] }
  const bodies = extractDsmlBlocks(text)
  const toolCalls: ToolCall[] = []
  for (const body of bodies) {
    toolCalls.push(...parseInvokes(body))
  }
  return {
    text: stripDsmlToolMarkup(text),
    toolCalls,
  }
}

export function contentLooksLikeDsmlToolMarkup(text: string): boolean {
  if (!text) return false
  if (OPEN_TAG_RE.test(text)) return true
  INVOKE_OPEN_RE.lastIndex = 0
  if (INVOKE_OPEN_RE.test(text)) return true
  return LOOSE_OPEN_ANY_RE.test(text)
}
