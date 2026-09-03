import { getPythonPlatformStatus } from './python-platform-status.js'
import type { PythonActiveSource, PythonRuntimeStatus } from './resolve-python.js'
import { isDockerEnv } from '../env/docker-env.js'

/** Agent 可见态：仅探测，不再启动在线安装 */
export type EnsurePythonStatus = 'ready' | 'failed'

export interface EnsurePythonResult {
  ok: boolean
  ready: boolean
  status: EnsurePythonStatus
  active_source: PythonActiveSource
  active_version: string | null
  message: string
  /** 在线一键安装已移除；恒为 false（兼容旧客户端字段） */
  recommend_install?: boolean
}

export interface EnsurePythonDeps {
  getStatus: () => Promise<PythonRuntimeStatus>
}

const defaultDeps: EnsurePythonDeps = {
  getStatus: getPythonPlatformStatus,
}

let deps: EnsurePythonDeps = { ...defaultDeps }

export function resetEnsurePythonDepsForTests(): void {
  deps = { ...defaultDeps }
}

export function setEnsurePythonDepsForTests(partial: Partial<EnsurePythonDeps>): void {
  deps = { ...deps, ...partial }
}

function notReadyMessage(status: PythonRuntimeStatus, docker: boolean): string {
  if (status.message?.trim()) return status.message
  if (docker) {
    return 'Docker 镜像未检测到系统 Python。请在 Dockerfile 中安装 python3 后重建镜像。'
  }
  return status.bundled_available
    ? '随应用提供的 Python 尚未就绪。请重启应用后再试；若仍不可用，请在本机安装 Python 3。'
    : '尚未检测到可用的 Python。请在本机安装 Python 3，或使用已内置运行环境的桌面版。'
}

/**
 * 确认 Python 就绪（只读探测）。
 * 不再启动在线托管安装；未就绪时返回 failed + 可行动说明。
 * `jobId` / `wait` 保留参数位以兼容旧调用，均被忽略。
 */
export async function ensurePythonReady(_options?: {
  signal?: AbortSignal
  timeoutMs?: number
  wait?: boolean
  jobId?: string
}): Promise<EnsurePythonResult> {
  const status = await deps.getStatus()
  if (status.ready) {
    return {
      ok: true,
      ready: true,
      status: 'ready',
      active_source: status.active_source,
      active_version: status.active_version,
      message: status.message,
      recommend_install: false,
    }
  }

  const docker = isDockerEnv()
  return {
    ok: false,
    ready: false,
    status: 'failed',
    active_source: status.active_source,
    active_version: status.active_version,
    recommend_install: false,
    message: notReadyMessage(status, docker),
  }
}
