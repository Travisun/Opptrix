import { resolvePythonRuntime, type PythonRuntimeStatus } from './resolve-python.js'

export type { PythonActiveSource, PythonRuntimeStatus } from './resolve-python.js'

/** 供 API / Agent / 设置页使用的 Python 环境状态 */
export async function getPythonPlatformStatus(): Promise<PythonRuntimeStatus> {
  return resolvePythonRuntime()
}
