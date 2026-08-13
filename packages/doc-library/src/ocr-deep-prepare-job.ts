/**
 * 扫描件文字识别（深度整理 / OCR）异步准备任务。
 * 对照 semantic-model-install-job：POST 立即返回；后台下载；GET 可轮询。
 */
import {
  ensureRapidOcrModelsDownloaded,
  getOcrL2Status,
  isOcrL2Available,
  type OcrEngineStatus,
  type OcrModelDownloadProgress,
  RAPIDOCR_MODEL_FILES,
} from './engines/ocr-l2.js'
import { rapidocrUserModelDir, type RapidOcrModelSource } from './paths.js'

export type OcrDeepPreparePhase =
  | 'idle'
  | 'downloading'
  | 'ready'
  | 'error'

export interface OcrDeepPrepareJobSnapshot {
  phase: OcrDeepPreparePhase
  message: string
  accepted: boolean
  started: boolean
  percent: number
  file: string | null
  receivedBytes: number
  totalBytes: number | null
  error: string | null
  available: boolean
  installed: boolean
  label: string
  source: RapidOcrModelSource
}

export interface OcrDeepPreparePipelineDeps {
  getStatus: () => OcrEngineStatus
  download: typeof ensureRapidOcrModelsDownloaded
  probeReady: () => Promise<boolean>
}

const IDLE_MESSAGE = '尚未准备扫描件文字识别。可在设置中一键准备。'
const FILE_COUNT = RAPIDOCR_MODEL_FILES.length

let lastJob: OcrDeepPrepareJobSnapshot = createIdleSnapshot()
let activePromise: Promise<void> | null = null
let pipelineDeps: OcrDeepPreparePipelineDeps = defaultDeps()
let filesCompletedThisRun = 0

function defaultDeps(): OcrDeepPreparePipelineDeps {
  return {
    getStatus: getOcrL2Status,
    download: ensureRapidOcrModelsDownloaded,
    probeReady: isOcrL2Available,
  }
}

function createIdleSnapshot(status?: OcrEngineStatus): OcrDeepPrepareJobSnapshot {
  const s = status ?? (() => {
    try {
      return getOcrL2Status()
    } catch {
      return {
        available: false,
        installed: false,
        label: '扫描件识别',
        dir: '',
        modelDir: '',
        workerScript: null,
        hint: IDLE_MESSAGE,
        source: 'missing' as const,
      }
    }
  })()
  if (s.available || s.installed) {
    return {
      phase: 'ready',
      message: '扫描件文字识别已就绪',
      accepted: false,
      started: false,
      percent: 100,
      file: null,
      receivedBytes: 0,
      totalBytes: null,
      error: null,
      available: s.available,
      installed: s.installed,
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
    available: false,
    installed: false,
    label: s.label,
    source: s.source,
  }
}

function updateJob(patch: Partial<OcrDeepPrepareJobSnapshot>): void {
  lastJob = { ...lastJob, ...patch }
}

function formatMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** 产品级错误文案：去掉 URL / 路径等技术细节 */
export function toOcrDeepPrepareUserError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '')
  const cleaned = raw
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\/(?:Users|home|var|tmp|opt)\S*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return '扫描件识别准备失败，请稍后重试'
  if (/超时|timeout/i.test(cleaned)) return '下载超时，请确认网络后重试'
  if (/网络|下载|失败|无法/.test(cleaned)) {
    return cleaned.includes('请') ? cleaned : '暂时无法下载识别所需文件，请稍后重试'
  }
  return '扫描件识别准备失败，请稍后重试'
}

function displayFileName(file: string): string {
  const base = file.split(/[/\\]/).pop() ?? file
  if (base.endsWith('.onnx')) return '识别模型'
  if (base.endsWith('.txt')) return '字典文件'
  return '识别文件'
}

function overallPercent(fileRatio: number): number {
  const done = filesCompletedThisRun
  const total = Math.max(1, FILE_COUNT)
  const base = (done / total) * 90
  const within = (Math.min(1, Math.max(0, fileRatio)) / total) * 90
  return Math.min(90, Math.round(base + within))
}

async function runPreparePipeline(): Promise<void> {
  const deps = pipelineDeps
  filesCompletedThisRun = 0

  updateJob({
    phase: 'downloading',
    accepted: true,
    started: true,
    error: null,
    percent: 2,
    message: '正在准备扫描件文字识别…',
    file: null,
    receivedBytes: 0,
    totalBytes: null,
  })

  try {
    const before = deps.getStatus()
    if (before.available || before.installed) {
      const ready = before.available || (await deps.probeReady())
      updateJob({
        phase: ready || before.installed ? 'ready' : 'error',
        percent: ready || before.installed ? 100 : 0,
        message: ready || before.installed
          ? '扫描件文字识别已就绪'
          : '扫描件文字识别尚未就绪，请稍后重试',
        error: ready || before.installed ? null : '扫描件文字识别尚未就绪，请稍后重试',
        available: ready,
        installed: before.installed,
        label: before.label,
        source: before.source,
      })
      return
    }

    let lastFile: string | null = null
    const downloaded = await deps.download(rapidocrUserModelDir(), {
      onProgress: (p: OcrModelDownloadProgress) => {
        if (lastFile && p.file !== lastFile) {
          filesCompletedThisRun = Math.min(FILE_COUNT, filesCompletedThisRun + 1)
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
              ? `正在下载识别资源（${formatMb(p.receivedBytes)} / ${formatMb(p.totalBytes)}）…`
              : '正在下载识别资源…',
        })
      },
    })

    if (!downloaded.ok) {
      updateJob({
        phase: 'error',
        percent: 0,
        message: '暂时无法下载所需文件，请检查网络后稍后重试',
        error: '暂时无法下载所需文件，请检查网络后稍后重试',
        available: false,
        installed: false,
        source: 'missing',
      })
      return
    }

    updateJob({
      phase: 'downloading',
      percent: 92,
      message: '正在确认识别能力…',
      file: null,
    })

    const onnxOk = await deps.probeReady()
    const after = deps.getStatus()
    const ready = onnxOk && (after.available || after.installed)
    updateJob({
      phase: ready ? 'ready' : 'error',
      percent: ready ? 100 : 0,
      message: ready
        ? '扫描件文字识别已就绪'
        : '暂时无法识别扫描件，请确认应用完整或稍后重试',
      error: ready ? null : '暂时无法识别扫描件，请确认应用完整或稍后重试',
      available: onnxOk && after.available,
      installed: after.installed,
      label: after.label,
      source: after.source,
      receivedBytes: 0,
      totalBytes: null,
    })
  } catch (err) {
    const message = toOcrDeepPrepareUserError(err)
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
      available: status?.available ?? false,
      installed: status?.installed ?? false,
      label: status?.label ?? '扫描件识别',
      source: status?.source ?? 'missing',
    })
  } finally {
    activePromise = null
  }
}

export function resetOcrDeepPrepareJobForTests(): void {
  lastJob = createIdleSnapshot({
    available: false,
    installed: false,
    label: '扫描件识别',
    dir: '',
    modelDir: '',
    workerScript: null,
    hint: IDLE_MESSAGE,
    source: 'missing',
  })
  activePromise = null
  filesCompletedThisRun = 0
  pipelineDeps = defaultDeps()
}

export function setOcrDeepPreparePipelineDepsForTests(
  deps: Partial<OcrDeepPreparePipelineDeps>,
): void {
  pipelineDeps = { ...pipelineDeps, ...deps }
}

export function getOcrDeepPrepareJobStatus(): OcrDeepPrepareJobSnapshot {
  if (!activePromise && lastJob.phase !== 'downloading') {
    try {
      const status = pipelineDeps.getStatus()
      if ((status.available || status.installed) && lastJob.phase !== 'error') {
        return {
          ...lastJob,
          phase: 'ready',
          available: status.available,
          installed: status.installed,
          label: status.label,
          source: status.source,
          percent: 100,
          message: lastJob.phase === 'ready' ? lastJob.message : '扫描件文字识别已就绪',
          error: null,
        }
      }
      if (!status.available && !status.installed && lastJob.phase === 'ready') {
        return createIdleSnapshot(status)
      }
    } catch {
      /* ignore */
    }
  }
  return { ...lastJob }
}

export function startOcrDeepPrepareJob(): OcrDeepPrepareJobSnapshot {
  if (lastJob.phase === 'downloading') {
    return getOcrDeepPrepareJobStatus()
  }
  if (activePromise) {
    return getOcrDeepPrepareJobStatus()
  }

  const status = pipelineDeps.getStatus()
  if (status.available || status.installed) {
    lastJob = {
      ...createIdleSnapshot(status),
      accepted: true,
      started: false,
      phase: 'ready',
      percent: 100,
      message: '扫描件文字识别已就绪',
    }
    return getOcrDeepPrepareJobStatus()
  }

  lastJob = {
    ...createIdleSnapshot(status),
    phase: 'downloading',
    accepted: true,
    started: true,
    message: '正在准备扫描件文字识别…',
    percent: 1,
    error: null,
  }

  activePromise = runPreparePipeline()
  void activePromise

  return getOcrDeepPrepareJobStatus()
}
