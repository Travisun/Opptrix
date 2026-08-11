import {
  getPythonSettings,
  savePythonSettings,
} from '../python-settings-store.js'
import {
  getPythonInstallJobStatus,
  startPythonInstallJob,
  waitForPythonInstallJob,
  type PythonInstallJobSnapshot,
} from './install-job.js'
import { getPythonPlatformStatus } from './python-platform-status.js'
import type { PythonActiveSource, PythonRuntimeStatus } from './resolve-python.js'
import type { PythonSettings, ValidatePythonSettingsResult } from '@opptrix/shared'

export interface EnsurePythonResult {
  ok: boolean
  ready: boolean
  active_source: PythonActiveSource
  active_version: string | null
  message: string
  recommend_install?: boolean
  install?: PythonInstallJobSnapshot
}

export interface EnsurePythonDeps {
  getStatus: () => Promise<PythonRuntimeStatus>
  startJob: () => PythonInstallJobSnapshot
  waitJob: (options?: { signal?: AbortSignal; timeoutMs?: number }) => Promise<PythonInstallJobSnapshot>
  getJobStatus: () => PythonInstallJobSnapshot
  getSettings: () => PythonSettings
  saveSettings: (input: Partial<PythonSettings>) => ValidatePythonSettingsResult
}

const defaultDeps: EnsurePythonDeps = {
  getStatus: getPythonPlatformStatus,
  startJob: startPythonInstallJob,
  waitJob: waitForPythonInstallJob,
  getJobStatus: getPythonInstallJobStatus,
  getSettings: getPythonSettings,
  saveSettings: savePythonSettings,
}

let deps: EnsurePythonDeps = { ...defaultDeps }

export function resetEnsurePythonDepsForTests(): void {
  deps = { ...defaultDeps }
}

export function setEnsurePythonDepsForTests(partial: Partial<EnsurePythonDeps>): void {
  deps = { ...deps, ...partial }
}

/**
 * 确认 Python 就绪；未就绪时启动托管安装、阻塞等待完成，
 * 成功后写入 prefer_opptrix_python=true 并返回 ready。
 */
export async function ensurePythonReady(options?: {
  signal?: AbortSignal
  timeoutMs?: number
}): Promise<EnsurePythonResult> {
  const status = await deps.getStatus()
  if (status.ready) {
    return {
      ok: true,
      ready: true,
      active_source: status.active_source,
      active_version: status.active_version,
      message: status.message,
    }
  }

  deps.startJob()

  let job: PythonInstallJobSnapshot
  try {
    job = await deps.waitJob({
      signal: options?.signal,
      timeoutMs: options?.timeoutMs,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Python 安装等待失败'
    return {
      ok: false,
      ready: false,
      active_source: 'none',
      active_version: null,
      recommend_install: true,
      message,
      install: deps.getJobStatus(),
    }
  }

  if (job.state !== 'completed') {
    return {
      ok: false,
      ready: false,
      active_source: 'none',
      active_version: null,
      recommend_install: true,
      message: job.message || '托管 Python 安装未完成',
      install: job,
    }
  }

  const current = deps.getSettings()
  deps.saveSettings({
    prefer_opptrix_python: true,
    pip_index_urls: current.pip_index_urls,
  })

  const after = await deps.getStatus()
  if (!after.ready || after.active_source !== 'opptrix') {
    return {
      ok: false,
      ready: false,
      active_source: after.active_source,
      active_version: after.active_version,
      recommend_install: true,
      message: after.ready
        ? '托管 Python 已安装，但尚未成为当前优先解释器'
        : (after.message || '托管 Python 安装后仍未就绪'),
      install: job,
    }
  }

  return {
    ok: true,
    ready: true,
    active_source: after.active_source,
    active_version: after.active_version,
    message: after.message,
    install: job,
  }
}
