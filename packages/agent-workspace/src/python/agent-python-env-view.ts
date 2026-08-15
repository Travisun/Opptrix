import { getPythonSettings } from '../python-settings-store.js'
import type { PythonActiveSource, PythonRuntimeStatus } from './resolve-python.js'

const ARGV_POLICY =
  'opptrix_run 的 command 用 python/python3/pip 字面量；安装用 opptrix_run(command="pip install …")；与运行共用同一解释器与 .opptrix-packages'

/** Agent / MCP 可见的 Python 环境摘要 — 不并列两套可执行绝对路径 */
export interface AgentPythonEnvView {
  ready: boolean
  active_source: PythonActiveSource
  active_version: string | null
  prefer_opptrix_python: boolean
  /** 当前优先解释器的人可读提示 */
  priority: string
  argv_policy: string
  /** 诊断布尔，无路径 */
  opptrix_installed?: boolean
  system_detected?: boolean
  recommend_install?: boolean
  message?: string
}

function priorityLabel(source: PythonActiveSource): string {
  if (source === 'opptrix') return '当前优先：Opptrix 托管'
  if (source === 'system') return '当前优先：系统 Python'
  return '当前优先：无可用 Python'
}

/**
 * 将完整 runtime 状态过滤为 Agent 视图。
 * UI/API 仍用 resolvePythonRuntime() 原样（含 system_path / opptrix_path）。
 */
export function toAgentPythonEnvView(
  status: PythonRuntimeStatus,
  preferOpptrix = getPythonSettings().prefer_opptrix_python,
): AgentPythonEnvView {
  return {
    ready: status.ready,
    active_source: status.active_source,
    active_version: status.active_version,
    prefer_opptrix_python: preferOpptrix,
    priority: priorityLabel(status.active_source),
    argv_policy: ARGV_POLICY,
    opptrix_installed: Boolean(status.opptrix_path),
    system_detected: Boolean(status.system_path),
    recommend_install: status.recommend_install,
    message: status.message,
  }
}
