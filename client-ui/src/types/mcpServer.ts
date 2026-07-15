/** 外部 MCP Server 公开视图（API 永不回传明文密钥） */

export type McpServerTransport = 'stdio' | 'http'
export type McpServerHealthState = 'unknown' | 'healthy' | 'degraded' | 'open' | 'paused'

export interface PublicMcpServer {
  id: string
  title: string
  enabled: boolean
  paused: boolean
  sortOrder: number
  transport: McpServerTransport
  endpointPreview: string
  secretsConfigured: Record<string, boolean>
  capabilityBindings: Record<string, string>
  installSource: 'manual' | 'registry'
  health: McpServerHealthState
  toolCount: number
  lastError?: string
  lastHealthyAt?: string
  updatedAt: string
}

export interface McpServerCreatePayload {
  id?: string
  title: string
  enabled?: boolean
  paused?: boolean
  transportConfig:
    | { transport: 'stdio'; command: string; args?: string[]; cwd?: string; env?: Record<string, string> }
    | { transport: 'http'; url: string; headers?: Record<string, string> }
  secrets?: Record<string, string>
  capabilityBindings?: Record<string, string>
}

export interface McpServerPatchPayload {
  title?: string
  enabled?: boolean
  paused?: boolean
  sortOrder?: number
  transportConfig?: McpServerCreatePayload['transportConfig']
  secrets?: Record<string, string>
  capabilityBindings?: Record<string, string>
}
