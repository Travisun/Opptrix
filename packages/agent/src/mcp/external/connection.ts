/**
 * 单个外部 MCP Server 的 Client 封装（stdio / Streamable HTTP / SSE）。
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import type { McpServerRecord } from '@opptrix/shared'
import type { OpenAiTool, JsonSchema } from '../../tools.js'

export interface ExternalToolDef {
  name: string
  description: string
  inputSchema: JsonSchema
}

export class ExternalMcpConnection {
  private client: Client | null = null
  private toolsCache: ExternalToolDef[] = []
  private connected = false

  constructor(readonly record: McpServerRecord) {}

  get tools(): readonly ExternalToolDef[] {
    return this.toolsCache
  }

  /** 合并非密钥 headers + secrets（含回退 Bearer 注入），用于所有 HTTP 请求 */
  private get allHeaders(): Record<string, string> {
    const cfg = this.record.transportConfig
    const baseHeaders: Record<string, string> =
      cfg.transport !== 'stdio' ? { ...(cfg.headers ?? {}) } : {}
    for (const [k, v] of Object.entries(this.record.secrets)) {
      if (v && !baseHeaders[k]) baseHeaders[k] = v
    }
    const hasAuth =
      baseHeaders.Authorization || baseHeaders.authorization
    if (!hasAuth) {
      const bearer = this.record.secrets.authorization
        ?? this.record.secrets.bearer
        ?? this.record.secrets.api_key
        ?? ''
      if (bearer) {
        baseHeaders.Authorization = bearer.startsWith('Bearer ') ? bearer : `Bearer ${bearer}`
      }
    }
    return baseHeaders
  }

  async connect(): Promise<void> {
    if (this.connected) return
    const client = new Client({ name: 'opptrix-host', version: '0.7.0' })
    const cfg = this.record.transportConfig

    if (cfg.transport === 'stdio') {
      const env: Record<string, string> = {
        ...Object.fromEntries(
          Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string'),
        ),
        ...(cfg.env ?? {}),
        ...this.record.secrets,
      }
      const transport = new StdioClientTransport({
        command: cfg.command,
        args: cfg.args ?? [],
        cwd: cfg.cwd,
        env,
        stderr: 'pipe',
      })
      await client.connect(transport)
    } else if (cfg.transport === 'sse') {
      const transport = new SSEClientTransport(new URL(cfg.url), {
        requestInit: { headers: this.allHeaders },
        // SSE 长连接建立后无法再注入 header，必须在 requestInit 阶段完成
      })
      await client.connect(transport)
    } else {
      const transport = new StreamableHTTPClientTransport(new URL(cfg.url), {
        requestInit: { headers: this.allHeaders },
      })
      await client.connect(transport)
    }

    this.client = client
    this.connected = true
    await this.refreshTools()
  }

  async refreshTools(): Promise<ExternalToolDef[]> {
    if (!this.client) throw new Error(`MCP ${this.record.id} 未连接`)
    const { tools } = await this.client.listTools()
    this.toolsCache = tools.map(t => ({
      name: t.name,
      description: t.description ?? '',
      inputSchema: (t.inputSchema ?? { type: 'object', properties: {} }) as JsonSchema,
    }))
    return this.toolsCache
  }

  async callTool(name: string, args: Record<string, unknown>, opts?: {
    signal?: AbortSignal
    timeoutMs?: number
  }): Promise<unknown> {
    if (!this.client) throw new Error(`MCP ${this.record.id} 未连接`)
    const timeout = opts?.timeoutMs ?? 120_000
    const result = await this.client.callTool(
      { name, arguments: args },
      undefined,
      { timeout, maxTotalTimeout: timeout * 2, signal: opts?.signal },
    )
    const content = Array.isArray(result.content) ? result.content : []
    const text = content
      .filter((c): c is { type: 'text'; text: string } =>
        typeof c === 'object' && c !== null && (c as { type?: string }).type === 'text'
        && typeof (c as { text?: unknown }).text === 'string',
      )
      .map(c => c.text)
      .join('\n')
    if (result.isError) {
      if (!text) throw new Error(`MCP ${this.record.id}/${name} failed`)
      try {
        const parsed = JSON.parse(text) as unknown
        if (parsed && typeof parsed === 'object' && 'error' in parsed) {
          throw new Error(String((parsed as { error: unknown }).error))
        }
        throw new Error(text)
      } catch (e) {
        if (e instanceof Error && e.message !== text) throw e
        throw new Error(text)
      }
    }
    if (!text) return { ok: true, source: this.record.id }
    try {
      return JSON.parse(text) as unknown
    } catch {
      return text
    }
  }

  toOpenAiTools(prefix: boolean): OpenAiTool[] {
    return this.toolsCache.map(t => ({
      type: 'function' as const,
      function: {
        name: prefix ? `${this.record.id}__${t.name}` : t.name,
        description: `[MCP:${this.record.id}] ${t.description}`,
        parameters: t.inputSchema,
      },
    }))
  }

  async close(): Promise<void> {
    if (this.client && this.connected) {
      await this.client.close().catch(() => {})
    }
    this.client = null
    this.connected = false
    this.toolsCache = []
  }
}
