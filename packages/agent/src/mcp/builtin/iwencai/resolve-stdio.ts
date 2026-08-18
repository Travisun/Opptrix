/**
 * 解析问财本机 MCP 的 stdio command/args（跨平台，禁止硬编码用户路径）。
 *
 * 优先级：
 * 1. OPPTRIX_IWENCAI_MCP_ENTRY（绝对路径覆盖）
 * 2. 与本模块同目录的 stdio-entry.js（已构建 dist / 打包 runtime）
 * 3. 源码入口 + node --import tsx（开发态 monorepo）
 */

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import type { McpStdioTransportConfig } from '@opptrix/shared'

const ENTRY_REL = path.join('mcp', 'builtin', 'iwencai', 'stdio-entry.js')
const SRC_ENTRY_REL = path.join('src', 'mcp', 'builtin', 'iwencai', 'stdio-entry.ts')

function existsFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile()
  } catch {
    return false
  }
}

function tryResolveTsxLoader(): string | null {
  try {
    const require = createRequire(import.meta.url)
    return require.resolve('tsx/esm')
  } catch {
    try {
      const require = createRequire(import.meta.url)
      return require.resolve('tsx')
    } catch {
      return null
    }
  }
}

/** 从 agent 包根或 resources 下查找入口 */
function candidateEntryPaths(moduleDir: string): string[] {
  const out: string[] = []
  // dist|src/.../iwencai → 同目录入口
  out.push(path.join(moduleDir, 'stdio-entry.js'))
  out.push(path.join(moduleDir, 'stdio-entry.ts'))
  // packages/agent/{dist|src}/mcp/builtin/iwencai → packages/agent
  const pkgRoot = path.resolve(moduleDir, '../../../..')
  out.push(path.join(pkgRoot, 'dist', ENTRY_REL))
  out.push(path.join(pkgRoot, SRC_ENTRY_REL))
  // desktop resources / runtime-stage（Electron sidecar）
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  if (typeof resourcesPath === 'string' && resourcesPath) {
    out.push(
      path.join(resourcesPath, 'runtime-stage', 'node_modules', '@opptrix', 'agent', 'dist', ENTRY_REL),
    )
    out.push(path.join(resourcesPath, 'app', 'node_modules', '@opptrix', 'agent', 'dist', ENTRY_REL))
  }
  return out
}

/**
 * 解析问财 stdio 传输配置（command + 绝对路径 args）。
 * @throws 找不到入口时抛错（不含密钥）
 */
export function resolveIwencaiMcpStdioTransport(): McpStdioTransportConfig {
  const override = (process.env.OPPTRIX_IWENCAI_MCP_ENTRY ?? '').trim()
  if (override) {
    if (!path.isAbsolute(override) || !existsFile(override)) {
      throw new Error('OPPTRIX_IWENCAI_MCP_ENTRY 须为已存在的绝对路径')
    }
    return {
      transport: 'stdio',
      command: process.execPath,
      args: [override],
    }
  }

  const moduleDir = path.dirname(fileURLToPath(import.meta.url))
  for (const candidate of candidateEntryPaths(moduleDir)) {
    if (!existsFile(candidate)) continue
    if (candidate.endsWith('.ts')) {
      const loader = tryResolveTsxLoader()
      if (!loader) {
        throw new Error('问财 MCP 源码入口需要 tsx；请先构建 @opptrix/agent 或安装 tsx')
      }
      return {
        transport: 'stdio',
        command: process.execPath,
        args: ['--import', loader, candidate],
      }
    }
    return {
      transport: 'stdio',
      command: process.execPath,
      args: [candidate],
    }
  }

  throw new Error('找不到问财 MCP 入口（请先 npm run build -w @opptrix/agent）')
}
