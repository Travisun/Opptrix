/**
 * DeepSeek DSML 工具调用标记：部分线路把 invoke 写进 message.content，
 * 而未填结构化 tool_calls。本模块剥离用户可见泄漏，并在可能时解析为 OpenAI ToolCall。
 */

import { randomUUID } from 'node:crypto'
import type { ToolCall } from './provider.js'

/** 全角 ｜ 与 ASCII | 均可；允许紧邻空格 */
const DSML = String.raw`(?:｜|\|)\s*DSML\s*(?:｜|\|)`

const BLOCK_OPEN = String.raw`<\s*${DSML}\s*(?:tool_calls|function_calls)\s*>`
const BLOCK_CLOSE = String.raw`<\s*/\s*${DSML}\s*(?:tool_calls|function_calls)\s*>`

const COMPLETE_BLOCK_RE = new RegExp(`${BLOCK_OPEN}[\\s\\S]*?${BLOCK_CLOSE}`, 'gi')
const OPEN_TAG_RE = new RegExp(BLOCK_OPEN, 'i')

const INVOKE_RE = new RegExp(
  String.raw`<\s*${DSML}\s*invoke\s+name\s*=\s*["']([^"']+)["']\s*>` +
    String.raw`([\s\S]*?)` +
    String.raw`<\s*/\s*${DSML}\s*invoke\s*>`,
  'gi',
)

const PARAMETER_RE = new RegExp(
  String.raw`<\s*${DSML}\s*parameter\s+([^>]*?)\s*>` +
    String.raw`([\s\S]*?)` +
    String.raw`<\s*/\s*${DSML}\s*parameter\s*>`,
  'gi',
)

const NAME_ATTR_RE = /\bname\s*=\s*["']([^"']+)["']/i

export function stripDsmlToolMarkup(text: string): string {
  if (!text) return text
  let out = text.replace(COMPLETE_BLOCK_RE, '')
  const open = OPEN_TAG_RE.exec(out)
  if (open && open.index != null) {
    out = out.slice(0, open.index)
  }
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trimEnd()
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

function parseInvokes(blockBody: string): ToolCall[] {
  const calls: ToolCall[] = []
  INVOKE_RE.lastIndex = 0
  let inv: RegExpExecArray | null
  while ((inv = INVOKE_RE.exec(blockBody)) !== null) {
    const name = (inv[1] ?? '').trim()
    if (!name) continue
    const inner = inv[2] ?? ''
    const args: Record<string, unknown> = {}
    PARAMETER_RE.lastIndex = 0
    let param: RegExpExecArray | null
    while ((param = PARAMETER_RE.exec(inner)) !== null) {
      const attrs = param[1] ?? ''
      const nameMatch = NAME_ATTR_RE.exec(attrs)
      const key = nameMatch?.[1]?.trim()
      if (!key) continue
      args[key] = coerceParamValue(param[2] ?? '', attrs)
    }
    calls.push({
      id: `call_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
      type: 'function',
      function: {
        name,
        arguments: JSON.stringify(args),
      },
    })
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
  return OPEN_TAG_RE.test(text)
}
