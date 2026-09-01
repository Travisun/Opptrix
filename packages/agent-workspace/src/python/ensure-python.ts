import {
  getPythonSettings,
  savePythonSettings,
} from '../python-settings-store.js'
import {
  getPythonInstallJobStatus,
  PYTHON_INSTALL_JOB_ID,
  startPythonInstallJob,
  waitForPythonInstallJob,
  type PythonInstallJobSnapshot,
} from './install-job.js'
import { getPythonPlatformStatus } from './python-platform-status.js'
import type { PythonActiveSource, PythonRuntimeStatus } from './resolve-python.js'
import type { PythonSettings, ValidatePythonSettingsResult } from '@opptrix/shared'
import { isDockerEnv } from '../env/docker-env.js'

/** Agent 可见的安装进度态；勿在 tool 内死等 20min */
export type EnsurePythonStatus = 'ready' | 'preparing' | 'installing' | 'failed'

export interface EnsurePythonResult {
  ok: boolean
  ready: boolean
  status: EnsurePythonStatus
  active_source: PythonActiveSource
  active_version: string | null
  message: string
  recommend_install?: boolean
  install?: PythonInstallJobSnapshot
  job_id?: string
  poll_hint?: string
  eta_seconds?: number
  suggested_wake_seconds?: number
  async_hint?: string
}

export interface EnsurePythonDeps {
  getStatus: () => Promise<PythonRuntimeStatus>
  startJob: () => PythonInstallJobSnapshot
  waitJob: (options?: { signal?: AbortSignal; timeoutMs?: number }) => Promise<PythonInstallJobSnapshot>
  getJobStatus: () => PythonInstallJobSnapshot
  getSettings: () => PythonSettings
  saveSettings: (input: Partial<PythonSettings>) => ValidatePythonSettingsResult
}

const ASYNC_HINT =
  '安装在后台进行。系统通常已自动挂起，完成后同会话通知续跑；无任务事件时可用 schedule_turn_wake（禁止传 job_id）；勿 poll/sleep 查进度。'

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

function agentStatusFromJob(job: PythonInstallJobSnapshot): Exclude<EnsurePythonStatus, 'ready'> {
  if (job.state === 'failed') return 'failed'
  if (job.state === 'running') return 'installing'
  return 'preparing'
}

function estimatePythonEtaSeconds(job: PythonInstallJobSnapshot): number {
  const now = Date.now()
  const started = job.started_at_ms
  const elapsedSec =
    started != null && started > 0 ? Math.max(1, (now - started) / 1000) : null

  if (
    elapsedSec != null
    && job.bytes_total != null
    && job.bytes_total > 0
    && job.bytes_downloaded > 0
    && job.bytes_downloaded < job.bytes_total
  ) {
    const rate = job.bytes_downloaded / elapsedSec
    if (rate > 0) {
      return Math.ceil(((job.bytes_total - job.bytes_downloaded) / rate) * 1.15)
    }
  }

  const pct = job.percent
  if (elapsedSec != null && pct >= 5 && pct < 99) {
    return Math.ceil(elapsedSec * (100 - pct) / pct * 1.15)
  }

  // 托管安装启发式：下载+解压+pip 常需数分钟
  return 180
}

function clampSuggestedWake(eta: number): number {
  return Math.min(1800, Math.max(5, Math.ceil(eta)))
}

function inProgressResult(job: PythonInstallJobSnapshot): EnsurePythonResult {
  const status = agentStatusFromJob(job)
  const jobId = job.job_id ?? PYTHON_INSTALL_JOB_ID
  if (status === 'failed') {
    return {
      ok: false,
      ready: false,
      status,
      active_source: 'none',
      active_version: null,
      recommend_install: true,
      message: job.message || '托管 Python 安装未完成',
      install: job,
      job_id: jobId,
    }
  }
  const eta = estimatePythonEtaSeconds(job)
  const suggested = clampSuggestedWake(eta)
  return {
    ok: true,
    ready: false,
    status,
    active_source: 'none',
    active_version: null,
    recommend_install: true,
    message: job.message || '正在准备托管 Python…',
    install: job,
    job_id: jobId,
    eta_seconds: eta,
    suggested_wake_seconds: suggested,
    async_hint: ASYNC_HINT,
    poll_hint:
      `托管 Python 安装进行中（约 ${suggested}s）。系统通常已自动挂起，完成后通知续跑；必要时 ensure_python({ job_id: "${jobId}" })。勿 poll/sleep 查进度。`,
  }
}

async function finalizeCompletedJob(job: PythonInstallJobSnapshot): Promise<EnsurePythonResult> {
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
      status: 'failed',
      active_source: after.active_source,
      active_version: after.active_version,
      recommend_install: true,
      message: after.ready
        ? '托管 Python 已安装，但尚未成为当前优先解释器'
        : (after.message || '托管 Python 安装后仍未就绪'),
      install: job,
      job_id: job.job_id ?? PYTHON_INSTALL_JOB_ID,
    }
  }

  return {
    ok: true,
    ready: true,
    status: 'ready',
    active_source: after.active_source,
    active_version: after.active_version,
    message: after.message,
    install: job,
    job_id: job.job_id ?? PYTHON_INSTALL_JOB_ID,
  }
}

/**
 * 确认 Python 就绪。
 * - 默认（Agent）：未就绪时启动托管安装并**立即**返回 preparing/installing + job_id + poll_hint，不阻塞。
 * - `wait: true`：阻塞等待安装结束（测试 / 显式同步路径）。
 * - `jobId`：轮询已启动的安装任务。
 */
export async function ensurePythonReady(options?: {
  signal?: AbortSignal
  timeoutMs?: number
  /** 为 true 时阻塞等待安装完成；Agent tool 默认 false */
  wait?: boolean
  /** 轮询用：上次返回的 job_id */
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
    }
  }

  if (isDockerEnv()) {
    return {
      ok: false,
      ready: false,
      status: 'failed',
      active_source: status.active_source,
      active_version: status.active_version,
      recommend_install: false,
      message: status.message
        || 'Docker 镜像未检测到系统 Python。请在 Dockerfile 中安装 python3 后重建镜像，勿使用托管安装。',
    }
  }

  const jobId = options?.jobId?.trim()
  if (jobId) {
    if (jobId !== PYTHON_INSTALL_JOB_ID) {
      return {
        ok: false,
        ready: false,
        status: 'failed',
        active_source: 'none',
        active_version: null,
        recommend_install: true,
        message: `找不到安装任务 ${jobId}，请重新调用 ensure_python 启动`,
      }
    }
    const job = deps.getJobStatus()
    if (job.state === 'completed') {
      return finalizeCompletedJob(job)
    }
    if (job.state === 'idle' && !job.accepted) {
      // 任务已过期或从未启动：重新拉起
      const started = deps.startJob()
      if (options?.wait) {
        return waitUntilReady(started, options)
      }
      return inProgressResult(started)
    }
    if (options?.wait) {
      return waitUntilReady(job, options)
    }
    return inProgressResult(job)
  }

  const started = deps.startJob()

  if (options?.wait) {
    return waitUntilReady(started, options)
  }

  // 极快完成（测试 mock / 已装完）时直接 finalize，避免多余一轮 poll
  const snap = deps.getJobStatus()
  if (snap.state === 'completed') {
    return finalizeCompletedJob(snap)
  }
  if (snap.state === 'failed') {
    return inProgressResult(snap)
  }
  return inProgressResult(started.state === 'idle' ? snap : started)
}

async function waitUntilReady(
  _started: PythonInstallJobSnapshot,
  options?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<EnsurePythonResult> {
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
      status: 'failed',
      active_source: 'none',
      active_version: null,
      recommend_install: true,
      message,
      install: deps.getJobStatus(),
      job_id: deps.getJobStatus().job_id ?? PYTHON_INSTALL_JOB_ID,
    }
  }

  if (job.state !== 'completed') {
    return inProgressResult(job)
  }
  return finalizeCompletedJob(job)
}
