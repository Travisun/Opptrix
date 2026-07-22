/**
 * MCP SDK 标准 Client 工具函数：
 * - createSdkConnection: 按 record 构造 SDK Client + Transport（stdio / streamable-http / sse）
 * - parseToolResult: 解析 SDK CallToolResult（保留现有错误处理语义）
 * - toOpenAiTool: MCP tool schema → OpenAI function-calling 格式
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type {
  jsonSchemaValidator,
  JsonSchemaType,
  JsonSchemaValidatorResult,
} from '@modelcontextprotocol/sdk/validation/types.js'
import type { McpServerRecord } from '@opptrix/shared'
import type { OpenAiTool, JsonSchema } from '../../tools.js'

/** 外部 Client 禁用 outputSchema 校验，避免上游 schema 不匹配导致 callTool 抛错 */
const PERMISSIVE_VALIDATOR: jsonSchemaValidator = {
  getValidator<T>(_schema: JsonSchemaType) {
    return (input: unknown): JsonSchemaValidatorResult<T> => ({
      valid: true,
      data: input as T,
      errorMessage: undefined,
    })
  },
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** 鉴权/业务错误载荷：{ data: null, message } 或 { error: ... } */
function detectStructuredError(data: unknown): string | null {
  if (!isRecord(data)) return null
  if ('error' in data && data.error != null && data.error !== '') {
    return String(data.error)
  }
  if ('data' in data && data.data === null && typeof data.message === 'string' && data.message) {
    return data.message
  }
  return null
}

export interface ExternalToolDef {
  name: string
  description: string
  inputSchema: JsonSchema
}

type AnyTransport = StdioClientTransport | StreamableHTTPClientTransport | SSEClientTransport

export interface SdkConnection {
  client: Client
  transport: AnyTransport
}

/** 合并非密钥 headers + secrets（含回退 Bearer 注入），用于所有 HTTP 请求 */
function buildHeaders(record: McpServerRecord): Record<string, string> {
  const cfg = record.transportConfig
  const headers: Record<string, string> =
    cfg.transport !== 'stdio' ? { ...(cfg.headers ?? {}) } : {}
  for (const [k, v] of Object.entries(record.secrets)) {
    if (v && !headers[k]) headers[k] = v
  }
  const hasAuth = headers.Authorization || headers.authorization
  if (!hasAuth) {
    const bearer = record.secrets.authorization
      ?? record.secrets.bearer
      ?? record.secrets.api_key
      ?? ''
    if (bearer) {
      headers.Authorization = bearer.startsWith('Bearer ') ? bearer : `Bearer ${bearer}`
    }
  }
  return headers
}

/** 按 record 构造 SDK Client + Transport（尚未 connect） */
export function createSdkConnection(record: McpServerRecord): SdkConnection {
  const client = new Client(
    { name: 'opptrix-host', version: '0.7.0' },
    { jsonSchemaValidator: PERMISSIVE_VALIDATOR },
  )
  const cfg = record.transportConfig
  let transport: AnyTransport
  if (cfg.transport === 'stdio') {
    const env: Record<string, string> = {
      ...Object.fromEntries(
        Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string'),
      ),
      ...(cfg.env ?? {}),
      ...record.secrets,
    }
    transport = new StdioClientTransport({
      command: cfg.command,
      args: cfg.args ?? [],
      cwd: cfg.cwd,
      env,
      stderr: 'pipe',
    })
  } else if (cfg.transport === 'sse') {
    transport = new SSEClientTransport(new URL(cfg.url), {
      requestInit: { headers: buildHeaders(record) },
    })
  } else {
    transport = new StreamableHTTPClientTransport(new URL(cfg.url), {
      requestInit: { headers: buildHeaders(record) },
    })
  }
  return { client, transport }
}

/** 解析 CallToolResult → 业务返回值（structuredContent 优先；鉴权载荷抛异常） */
export function parseToolResult(
  serverId: string,
  toolName: string,
  result: unknown,
): unknown {
  const payload = (result && typeof result === 'object' && 'toolResult' in result
    ? (result as { toolResult: unknown }).toolResult
    : result) as CallToolResult

  const structured = payload.structuredContent
  if (structured !== undefined && structured !== null) {
    if (payload.isError) {
      const errMsg = detectStructuredError(structured)
      throw new Error(errMsg ?? `MCP ${serverId}/${toolName} failed`)
    }
    const errMsg = detectStructuredError(structured)
    if (errMsg) throw new Error(errMsg)
    return structured
  }

  const content = Array.isArray(payload.content) ? payload.content : []
  const text = content
    .filter((c): c is { type: 'text'; text: string } =>
      typeof c === 'object' && c !== null && (c as { type?: string }).type === 'text'
      && typeof (c as { text?: unknown }).text === 'string',
    )
    .map(c => c.text)
    .join('\n')

  if (payload.isError) {
    if (!text) throw new Error(`MCP ${serverId}/${toolName} failed`)
    try {
      const parsed = JSON.parse(text) as unknown
      const errMsg = detectStructuredError(parsed)
      if (errMsg) throw new Error(errMsg)
      if (isRecord(parsed) && 'error' in parsed) {
        throw new Error(String(parsed.error))
      }
      throw new Error(text)
    } catch (e) {
      if (e instanceof Error && e.message !== text) throw e
      throw new Error(text)
    }
  }

  if (!text) return { ok: true, source: serverId }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return text
  }
  const errMsg = detectStructuredError(parsed)
  if (errMsg) throw new Error(errMsg)
  return parsed
}

/** MCP 工具 → OpenAI function-calling 格式 */
export function toOpenAiTool(
  serverId: string,
  name: string,
  description: string,
  inputSchema: JsonSchema,
  prefix: boolean,
): OpenAiTool {
  return {
    type: 'function',
    function: {
      name: prefix ? `${serverId}__${name}` : name,
      description: `[MCP:${serverId}] ${description}`,
      parameters: inputSchema,
    },
  }
}
