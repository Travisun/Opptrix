import fs from 'node:fs/promises'
import { resolvePythonPlatformArtifact } from './catalog.js'
import { downloadPythonArtifact } from './download.js'
import { bootstrapPip } from './bootstrap-pip.js'
import { installPythonArtifact, resolveInstallPaths } from './installer.js'

export type PythonInstallJobState = 'idle' | 'queued' | 'running' | 'failed' | 'completed'

export type PythonInstallPhase =
  | 'idle'
  | 'prepare'
  | 'download'
  | 'extract'
  | 'configure'
  | 'pip'
  | 'verify'
  | 'done'

/** 单例安装任务的稳定 id，供 Agent `ensure_python({ job_id })` 轮询 */
export const PYTHON_INSTALL_JOB_ID = 'python-install'

export interface PythonInstallJobSnapshot {
  state: PythonInstallJobState
  message: string
  accepted: boolean
  phase: PythonInstallPhase
  percent: number
  bytes_downloaded: number
  bytes_total: number | null
  steps: string[]
  error: string | null
  /** 有进行中/已结束的安装任务时为 PYTHON_INSTALL_JOB_ID；idle 为 null */
  job_id: string | null
  /** 任务开始时间（ms）；idle 为 null */
  started_at_ms: number | null
}

export interface PythonInstallPipelineDeps {
  resolveArtifact: typeof resolvePythonPlatformArtifact
  downloadArtifact: typeof downloadPythonArtifact
  installArtifact: typeof installPythonArtifact
  bootstrapPip: typeof bootstrapPip
}

const IDLE_MESSAGE = '尚未开始安装。可在设置中一键安装 Opptrix 托管 Python。'

const DEFAULT_STEPS = [
  '准备安装',
  '下载安装包',
  '解压文件',
  '配置环境',
  '安装 pip',
  '验证安装',
]

let lastJob: PythonInstallJobSnapshot = createIdleSnapshot()
let activePromise: Promise<void> | null = null
let pipelineDeps: PythonInstallPipelineDeps = {
  resolveArtifact: resolvePythonPlatformArtifact,
  downloadArtifact: downloadPythonArtifact,
  installArtifact: installPythonArtifact,
  bootstrapPip,
}

type PythonInstallJobListener = (snap: PythonInstallJobSnapshot) => void
const jobListeners = new Set<PythonInstallJobListener>()

/** JobRegistry Adapter 薄桥：订阅安装进度（进程内） */
export function subscribePythonInstallJob(
  listener: PythonInstallJobListener,
): () => void {
  jobListeners.add(listener)
  return () => {
    jobListeners.delete(listener)
  }
}

function createIdleSnapshot(): PythonInstallJobSnapshot {
  return {
    state: 'idle',
    message: IDLE_MESSAGE,
    accepted: false,
    phase: 'idle',
    percent: 0,
    bytes_downloaded: 0,
    bytes_total: null,
    steps: [...DEFAULT_STEPS],
    error: null,
    job_id: null,
    started_at_ms: null,
  }
}

function notifyJobListeners(): void {
  if (jobListeners.size === 0) return
  const snap = getPythonInstallJobStatus()
  for (const listener of [...jobListeners]) {
    try {
      listener(snap)
    } catch {
      /* ignore listener errors */
    }
  }
}

function updateJob(patch: Partial<PythonInstallJobSnapshot>): void {
  lastJob = { ...lastJob, ...patch }
  notifyJobListeners()
}

function phasePercent(phase: PythonInstallPhase, downloadRatio = 0): number {
  switch (phase) {
    case 'prepare': return 5
    case 'download': return 10 + Math.round(downloadRatio * 45)
    case 'extract': return 60
    case 'configure': return 70
    case 'pip': return 85
    case 'verify': return 95
    case 'done': return 100
    default: return 0
  }
}

function phaseMessage(phase: PythonInstallPhase): string {
  switch (phase) {
    case 'prepare': return '正在准备安装…'
    case 'download': return '正在下载 Python 安装包…'
    case 'extract': return '正在解压安装包…'
    case 'configure': return '正在配置 Python 环境…'
    case 'pip': return '正在安装 pip…'
    case 'verify': return '正在验证安装结果…'
    case 'done': return 'Opptrix 托管 Python 已安装完成'
    default: return IDLE_MESSAGE
  }
}

async function runInstallPipeline(): Promise<void> {
  const deps = pipelineDeps
  updateJob({
    state: 'running',
    accepted: true,
    error: null,
    phase: 'prepare',
    percent: phasePercent('prepare'),
    message: phaseMessage('prepare'),
  })

  const artifact = deps.resolveArtifact()
  if (!artifact) {
    updateJob({
      state: 'failed',
      phase: 'idle',
      percent: 0,
      message: '当前系统暂不支持自动安装托管 Python，请先在系统中安装 Python。',
      error: 'unsupported_platform',
    })
    return
  }

  const { archivePath } = resolveInstallPaths(artifact)

  try {
    updateJob({
      phase: 'download',
      percent: phasePercent('download', 0),
      message: phaseMessage('download'),
      bytes_downloaded: 0,
      bytes_total: null,
    })

    await deps.downloadArtifact(artifact, archivePath, {
      onProgress: ({ bytesDownloaded, bytesTotal }) => {
        const ratio = bytesTotal != null && bytesTotal > 0 ? bytesDownloaded / bytesTotal : 0
        updateJob({
          phase: 'download',
          bytes_downloaded: bytesDownloaded,
          bytes_total: bytesTotal,
          percent: phasePercent('download', ratio),
          message: bytesTotal != null && bytesTotal > 0
            ? `正在下载 Python 安装包（${formatMb(bytesDownloaded)} / ${formatMb(bytesTotal)}）…`
            : phaseMessage('download'),
        })
      },
    })

    updateJob({
      phase: 'extract',
      percent: phasePercent('extract'),
      message: phaseMessage('extract'),
    })

    const installed = await deps.installArtifact(artifact, archivePath)

    updateJob({
      phase: 'configure',
      percent: phasePercent('configure'),
      message: phaseMessage('configure'),
    })

    if (artifact.kind !== 'miniconda') {
      updateJob({
        phase: 'pip',
        percent: phasePercent('pip'),
        message: phaseMessage('pip'),
      })
      await deps.bootstrapPip(installed.pythonPath)
    }

    updateJob({
      phase: 'verify',
      percent: phasePercent('verify'),
      message: phaseMessage('verify'),
    })

    updateJob({
      state: 'completed',
      phase: 'done',
      percent: 100,
      message: 'Opptrix 托管 Python 已安装，可直接运行脚本与安装依赖。',
      error: null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : '安装失败，请稍后重试'
    updateJob({
      state: 'failed',
      phase: 'idle',
      percent: 0,
      message,
      error: message,
    })
  } finally {
    await fs.unlink(archivePath).catch(() => {})
    activePromise = null
  }
}

function formatMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function resetPythonInstallJobForTests(): void {
  lastJob = createIdleSnapshot()
  activePromise = null
  jobListeners.clear()
  pipelineDeps = {
    resolveArtifact: resolvePythonPlatformArtifact,
    downloadArtifact: downloadPythonArtifact,
    installArtifact: installPythonArtifact,
    bootstrapPip,
  }
}

export function setPythonInstallPipelineDepsForTests(deps: Partial<PythonInstallPipelineDeps>): void {
  pipelineDeps = { ...pipelineDeps, ...deps }
}

export function getPythonInstallJobStatus(): PythonInstallJobSnapshot {
  return { ...lastJob, steps: [...lastJob.steps] }
}

export function startPythonInstallJob(): PythonInstallJobSnapshot {
  if (lastJob.state === 'running' || lastJob.state === 'queued') {
    if (!lastJob.job_id) updateJob({ job_id: PYTHON_INSTALL_JOB_ID })
    return getPythonInstallJobStatus()
  }

  if (activePromise) {
    if (!lastJob.job_id) updateJob({ job_id: PYTHON_INSTALL_JOB_ID })
    return getPythonInstallJobStatus()
  }

  lastJob = {
    ...createIdleSnapshot(),
    state: 'queued',
    accepted: true,
    message: '已加入安装队列…',
    phase: 'prepare',
    percent: 1,
    job_id: PYTHON_INSTALL_JOB_ID,
    started_at_ms: Date.now(),
  }

  activePromise = runInstallPipeline()
  void activePromise

  return getPythonInstallJobStatus()
}

const DEFAULT_INSTALL_WAIT_TIMEOUT_MS = 20 * 60 * 1000

function isTerminalInstallState(state: PythonInstallJobState): boolean {
  return state === 'completed' || state === 'failed'
}

/**
 * 阻塞等待当前（或刚启动的）托管 Python 安装任务结束。
 * 已 completed/failed 时立即返回快照；idle 且无进行中任务时原样返回。
 */
export async function waitForPythonInstallJob(options?: {
  signal?: AbortSignal
  timeoutMs?: number
}): Promise<PythonInstallJobSnapshot> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_INSTALL_WAIT_TIMEOUT_MS
  const signal = options?.signal
  const startedAt = Date.now()

  const throwIfAborted = (): void => {
    if (signal?.aborted) {
      throw new Error('Python 安装等待已取消')
    }
  }

  throwIfAborted()

  let snap = getPythonInstallJobStatus()
  if (isTerminalInstallState(snap.state)) return snap
  if (snap.state === 'idle' && !activePromise) return snap

  while (true) {
    throwIfAborted()
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Python 安装超时，请稍后重试')
    }

    snap = getPythonInstallJobStatus()
    if (isTerminalInstallState(snap.state)) return snap
    if (snap.state === 'idle' && !activePromise) return snap

    if (activePromise) {
      const remaining = Math.max(1, timeoutMs - (Date.now() - startedAt))
      let timer: ReturnType<typeof setTimeout> | undefined
      let onAbort: (() => void) | undefined
      try {
        await Promise.race([
          activePromise,
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              reject(new Error('Python 安装超时，请稍后重试'))
            }, remaining)
            if (signal) {
              onAbort = () => {
                reject(new Error('Python 安装等待已取消'))
              }
              signal.addEventListener('abort', onAbort, { once: true })
            }
          }),
        ])
      } finally {
        if (timer != null) clearTimeout(timer)
        if (signal && onAbort) signal.removeEventListener('abort', onAbort)
      }
      return getPythonInstallJobStatus()
    }

    await new Promise<void>(resolve => setTimeout(resolve, 100))
  }
}
