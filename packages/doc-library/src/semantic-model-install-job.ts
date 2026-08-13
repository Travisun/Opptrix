/**
 * 语义检索模型异步安装任务（对照 PythonInstallJob）。
 * POST 立即返回；后台下载；GET status 可轮询进度。
 */
import {
  downloadEmbeddingModel,
  type DownloadProgress,
} from './model-downloader.js'
import { getEmbeddingService } from './embedding.js'
import {
  getSemanticModelStatus,
  type SemanticModelUiStatus,
} from './embedding-api.js'
import type { EmbeddingModelSource } from './paths.js'
import { E5_MODEL_FILES } from './model-downloader.js'

export type SemanticModelInstallPhase =
  | 'idle'
  | 'downloading'
  | 'enabling'
  | 'ready'
  | 'error'

export interface SemanticModelInstallJobSnapshot {
  phase: SemanticModelInstallPhase
  message: string
  accepted: boolean
  started: boolean
  percent: number
  file: string | null
  receivedBytes: number
  totalBytes: number | null
  error: string | null
  installed: boolean
  label: string
  source: EmbeddingModelSource
}

export interface SemanticModelInstallPipelineDeps {
  getStatus: () => SemanticModelUiStatus
  download: typeof downloadEmbeddingModel
  tryEnable: () => Promise<boolean>
}

const IDLE_MESSAGE = '尚未安装语义检索模型。可在设置中一键安装。'

const REQUIRED_FILE_COUNT = E5_MODEL_FILES.filter(
  f => f !== 'special_tokens_map.json',
).length

let lastJob: SemanticModelInstallJobSnapshot = createIdleSnapshot()
let activePromise: Promise<void> | null = null
let pipelineDeps: SemanticModelInstallPipelineDeps = defaultDeps()
/** 当前下载轮次已完成的必选文件数（用于整体进度） */
let filesCompletedThisRun = 0

function defaultDeps(): SemanticModelInstallPipelineDeps {
  return {
    getStatus: getSemanticModelStatus,
    download: downloadEmbeddingModel,
    tryEnable: () => getEmbeddingService().tryEnableDefaultBackend(),
  }
}

function createIdleSnapshot(status?: SemanticModelUiStatus): SemanticModelInstallJobSnapshot {
  const s = status ?? (() => {
    try {
      return getSemanticModelStatus()
    } catch {
      return {
        installed: false,
        label: '语义检索模型',
        dir: '',
        missingFiles: [],
        source: 'missing' as const,
      }
    }
  })()
  if (s.installed) {
    return {
      phase: 'ready',
      message: '语义检索已就绪',
      accepted: false,
      started: false,
      percent: 100,
      file: null,
      receivedBytes: 0,
      totalBytes: null,
      error: null,
      installed: true,
      label: s.label,
      source: s.source,
    }
  }
  return {
    phase: 'idle',
    message: IDLE_MESSAGE,
    accepted: false,
    started: false,
    percent: 0,
    file: null,
    receivedBytes: 0,
    totalBytes: null,
    error: null,
    installed: false,
    label: s.label,
    source: s.source,
  }
}

function updateJob(patch: Partial<SemanticModelInstallJobSnapshot>): void {
  lastJob = { ...lastJob, ...patch }
}

function formatMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** 产品级错误文案：去掉 URL / 路径等技术细节 */
export function toSemanticInstallUserError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '')
  const cleaned = raw
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\/(?:Users|home|var|tmp|opt)\S*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return '语义检索模型下载失败，请稍后重试'
  if (/超时|timeout/i.test(cleaned)) return '下载超时，请确认网络后重试'
  if (/校验|缺少/.test(cleaned)) return '语义检索模型校验失败，请稍后重试'
  if (/网络|下载|失败|无法/.test(cleaned)) {
    return cleaned.includes('请') ? cleaned : '暂时无法下载语义检索模型，请稍后重试'
  }
  return '语义检索模型安装失败，请稍后重试'
}

function displayFileName(file: string): string {
  const base = file.split(/[/\\]/).pop() ?? file
  // 勿把完整相对路径堆给用户；大文件可点名
  if (base.endsWith('.onnx')) return '模型文件'
  if (base.includes('tokenizer')) return '分词文件'
  if (base === 'config.json') return '配置文件'
  return '模型文件'
}

function overallPercent(fileRatio: number): number {
  const done = filesCompletedThisRun
  const total = Math.max(1, REQUIRED_FILE_COUNT)
  const base = (done / total) * 90
  const within = (Math.min(1, Math.max(0, fileRatio)) / total) * 90
  return Math.min(90, Math.round(base + within))
}

async function runInstallPipeline(): Promise<void> {
  const deps = pipelineDeps
  filesCompletedThisRun = 0

  updateJob({
    phase: 'downloading',
    accepted: true,
    started: true,
    error: null,
    percent: 2,
    message: '正在下载语义检索模型…',
    file: null,
    receivedBytes: 0,
    totalBytes: null,
  })

  try {
    const before = deps.getStatus()
    if (before.installed) {
      updateJob({
        phase: 'ready',
        percent: 100,
        message: '语义检索已就绪',
        installed: true,
        label: before.label,
        source: before.source,
        error: null,
      })
      return
    }

    let lastFile: string | null = null
    await deps.download({
      onProgress: (p: DownloadProgress) => {
        if (lastFile && p.file !== lastFile) {
          filesCompletedThisRun = Math.min(REQUIRED_FILE_COUNT, filesCompletedThisRun + 1)
        }
        lastFile = p.file
        const ratio =
          p.totalBytes != null && p.totalBytes > 0
            ? p.receivedBytes / p.totalBytes
            : 0
        const percent = overallPercent(ratio)
        const label = displayFileName(p.file)
        updateJob({
          phase: 'downloading',
          file: label,
          receivedBytes: p.receivedBytes,
          totalBytes: p.totalBytes,
          percent,
          message:
            p.totalBytes != null && p.totalBytes > 0
              ? `正在下载语义检索模型（${formatMb(p.receivedBytes)} / ${formatMb(p.totalBytes)}）…`
              : '正在下载语义检索模型…',
        })
      },
    })

    updateJob({
      phase: 'enabling',
      percent: 92,
      message: '正在启用语义检索…',
      file: null,
    })

    await deps.tryEnable()

    const after = deps.getStatus()
    updateJob({
      phase: after.installed ? 'ready' : 'error',
      percent: after.installed ? 100 : 0,
      message: after.installed
        ? '语义检索已就绪'
        : '语义检索尚未就绪，请稍后重试',
      error: after.installed ? null : '语义检索尚未就绪，请稍后重试',
      installed: after.installed,
      label: after.label,
      source: after.source,
      receivedBytes: 0,
      totalBytes: null,
    })
  } catch (err) {
    const message = toSemanticInstallUserError(err)
    const status = (() => {
      try {
        return deps.getStatus()
      } catch {
        return null
      }
    })()
    updateJob({
      phase: 'error',
      percent: 0,
      message,
      error: message,
      installed: status?.installed ?? false,
      label: status?.label ?? '语义检索模型',
      source: status?.source ?? 'missing',
    })
  } finally {
    activePromise = null
  }
}

export function resetSemanticModelInstallJobForTests(): void {
  lastJob = createIdleSnapshot({
    installed: false,
    label: '语义检索模型',
    dir: '',
    missingFiles: [],
    source: 'missing',
  })
  activePromise = null
  filesCompletedThisRun = 0
  pipelineDeps = defaultDeps()
}

export function setSemanticModelInstallPipelineDepsForTests(
  deps: Partial<SemanticModelInstallPipelineDeps>,
): void {
  pipelineDeps = { ...pipelineDeps, ...deps }
}

export function getSemanticModelInstallJobStatus(): SemanticModelInstallJobSnapshot {
  // 无进行中任务时，用磁盘状态校正 ready/idle（例如用户刚卸载）
  if (!activePromise && lastJob.phase !== 'downloading' && lastJob.phase !== 'enabling') {
    try {
      const status = pipelineDeps.getStatus()
      if (status.installed && lastJob.phase !== 'error') {
        return {
          ...lastJob,
          phase: 'ready',
          installed: true,
          label: status.label,
          source: status.source,
          percent: 100,
          message: lastJob.phase === 'ready' ? lastJob.message : '语义检索已就绪',
          error: null,
        }
      }
      if (!status.installed && lastJob.phase === 'ready') {
        return createIdleSnapshot(status)
      }
    } catch {
      /* ignore */
    }
  }
  return { ...lastJob }
}

export function startSemanticModelInstallJob(): SemanticModelInstallJobSnapshot {
  if (lastJob.phase === 'downloading' || lastJob.phase === 'enabling') {
    return getSemanticModelInstallJobStatus()
  }
  if (activePromise) {
    return getSemanticModelInstallJobStatus()
  }

  const status = pipelineDeps.getStatus()
  if (status.installed) {
    lastJob = {
      ...createIdleSnapshot(status),
      accepted: true,
      started: false,
      phase: 'ready',
      percent: 100,
      message: '语义检索已就绪',
    }
    return getSemanticModelInstallJobStatus()
  }

  lastJob = {
    ...createIdleSnapshot(status),
    phase: 'downloading',
    accepted: true,
    started: true,
    message: '正在下载语义检索模型…',
    percent: 1,
    error: null,
  }

  activePromise = runInstallPipeline()
  void activePromise

  return getSemanticModelInstallJobStatus()
}
