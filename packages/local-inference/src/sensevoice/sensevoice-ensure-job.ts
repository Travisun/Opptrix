/**
 * SenseVoice 模型异步准备任务（对照 semantic-model-install-job）。
 * POST 立即返回；后台 ensureAssets；GET 可轮询 phase / percent / message。
 * bootstrap 与显式 ensure 共用同一 job，避免双开下载。
 */
import {
  getSenseVoiceReadyInfo,
  isSenseVoiceReady,
  senseVoiceRuntime,
  type SenseVoiceReadyInfo,
} from './sensevoice-runtime.js'
import type { SenseVoiceAssetSource } from '../paths.js'
import { speechEnsureModelReadyMessage } from '../media/speech-readiness.js'

export type SenseVoiceEnsurePhase =
  | 'idle'
  | 'preparing'
  | 'downloading'
  | 'ready'
  | 'error'

export interface SenseVoiceEnsureJobSnapshot {
  phase: SenseVoiceEnsurePhase
  message: string
  accepted: boolean
  started: boolean
  percent: number
  modelName: string
  ready: boolean
  modelsDir: string
  source: SenseVoiceAssetSource
  error: string | null
}

export interface SenseVoiceEnsurePipelineDeps {
  getReadyInfo: (modelName: string, repoRoot?: string) => SenseVoiceReadyInfo
  isReady: (modelName: string, repoRoot?: string) => boolean
  ensureAssets: (modelName: string, repoRoot?: string) => Promise<void>
}

const IDLE_MESSAGE = '尚未准备语音识别模型。可在设置中一键准备。'

let lastJob: SenseVoiceEnsureJobSnapshot = createIdleSnapshot('q8')
let activePromise: Promise<void> | null = null
let activeModelName = 'q8'
let activeRepoRoot: string | undefined
let pipelineDeps: SenseVoiceEnsurePipelineDeps = defaultDeps()

function defaultDeps(): SenseVoiceEnsurePipelineDeps {
  return {
    getReadyInfo: getSenseVoiceReadyInfo,
    isReady: isSenseVoiceReady,
    ensureAssets: (modelName, repoRoot) => senseVoiceRuntime.ensureAssets(modelName, repoRoot),
  }
}

function createIdleSnapshot(
  modelName: string,
  repoRoot?: string,
  info?: SenseVoiceReadyInfo,
): SenseVoiceEnsureJobSnapshot {
  const readyInfo = info ?? (() => {
    try {
      return pipelineDeps.getReadyInfo(modelName, repoRoot)
    } catch {
      return { ready: false, source: 'missing' as const, modelsDir: '' }
    }
  })()

  if (readyInfo.ready) {
    return {
      phase: 'ready',
      message: speechEnsureModelReadyMessage(),
      accepted: false,
      started: false,
      percent: 100,
      modelName,
      ready: true,
      modelsDir: readyInfo.modelsDir,
      source: readyInfo.source,
      error: null,
    }
  }

  return {
    phase: 'idle',
    message: IDLE_MESSAGE,
    accepted: false,
    started: false,
    percent: 0,
    modelName,
    ready: false,
    modelsDir: readyInfo.modelsDir,
    source: readyInfo.source,
    error: null,
  }
}

function updateJob(patch: Partial<SenseVoiceEnsureJobSnapshot>): void {
  lastJob = { ...lastJob, ...patch }
}

/** 产品级错误文案：去掉 URL / 路径等技术细节 */
export function toSenseVoiceEnsureUserError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '')
  const cleaned = raw
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\/(?:Users|home|var|tmp|opt)\S*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return '语音识别模型准备失败，请稍后重试'
  if (/超时|timeout/i.test(cleaned)) return '下载超时，请确认网络后重试'
  if (/SPEECH_COMPONENT_MISSING|未找到.*可执行|语音处理组件/i.test(cleaned)) {
    return '语音识别组件尚未就绪，请稍后再试或到设置中完成准备'
  }
  if (/网络|下载|失败|无法|仍未找到/.test(cleaned)) {
    return cleaned.includes('请') ? cleaned : '暂时无法准备语音识别模型，请稍后重试'
  }
  return '语音识别模型准备失败，请稍后重试'
}

function isActivePhase(phase: SenseVoiceEnsurePhase): boolean {
  return phase === 'preparing' || phase === 'downloading'
}

async function runEnsurePipeline(modelName: string, repoRoot?: string): Promise<void> {
  const deps = pipelineDeps

  updateJob({
    phase: 'preparing',
    accepted: true,
    started: true,
    error: null,
    percent: 5,
    modelName,
    message: '正在准备语音识别环境…',
  })

  try {
    if (deps.isReady(modelName, repoRoot)) {
      const info = deps.getReadyInfo(modelName, repoRoot)
      updateJob({
        phase: 'ready',
        percent: 100,
        message: speechEnsureModelReadyMessage(),
        ready: true,
        modelsDir: info.modelsDir,
        source: info.source,
        error: null,
      })
      return
    }

    updateJob({
      phase: 'downloading',
      percent: 15,
      message: '正在获取语音识别模型…',
    })

    // 下载可能较久；阶段保持 downloading，完成后以磁盘状态校正
    const ensurePromise = deps.ensureAssets(modelName, repoRoot)
    let pulse = 15
    const pulseTimer = setInterval(() => {
      if (!isActivePhase(lastJob.phase)) return
      pulse = Math.min(85, pulse + 5)
      updateJob({
        phase: 'downloading',
        percent: pulse,
        message: pulse < 50
          ? '正在获取语音识别模型…'
          : '仍在下载，请稍候…',
      })
    }, 2500)
    if (typeof pulseTimer === 'object' && pulseTimer !== null && 'unref' in pulseTimer) {
      pulseTimer.unref()
    }

    try {
      await ensurePromise
    } finally {
      clearInterval(pulseTimer)
    }

    const after = deps.getReadyInfo(modelName, repoRoot)
    updateJob({
      phase: after.ready ? 'ready' : 'error',
      percent: after.ready ? 100 : 0,
      message: after.ready
        ? speechEnsureModelReadyMessage()
        : '语音识别尚未就绪，请稍后重试',
      error: after.ready ? null : '语音识别尚未就绪，请稍后重试',
      ready: after.ready,
      modelsDir: after.modelsDir,
      source: after.source,
    })
  } catch (err) {
    const message = toSenseVoiceEnsureUserError(err)
    const status = (() => {
      try {
        return deps.getReadyInfo(modelName, repoRoot)
      } catch {
        return null
      }
    })()
    updateJob({
      phase: 'error',
      percent: 0,
      message,
      error: message,
      ready: status?.ready ?? false,
      modelsDir: status?.modelsDir ?? lastJob.modelsDir,
      source: status?.source ?? 'missing',
    })
  } finally {
    activePromise = null
  }
}

export function resetSenseVoiceEnsureJobForTests(): void {
  lastJob = createIdleSnapshot('q8', undefined, {
    ready: false,
    source: 'missing',
    modelsDir: '',
  })
  activePromise = null
  activeModelName = 'q8'
  activeRepoRoot = undefined
  pipelineDeps = defaultDeps()
}

export function setSenseVoiceEnsurePipelineDepsForTests(
  deps: Partial<SenseVoiceEnsurePipelineDeps>,
): void {
  pipelineDeps = { ...pipelineDeps, ...deps }
}

export function getSenseVoiceEnsureJobStatus(
  modelName?: string,
  repoRoot?: string,
): SenseVoiceEnsureJobSnapshot {
  const name = (modelName ?? activeModelName ?? lastJob.modelName).trim().toLowerCase() || 'q8'
  const root = repoRoot ?? activeRepoRoot

  if (!activePromise && !isActivePhase(lastJob.phase)) {
    try {
      const info = pipelineDeps.getReadyInfo(name, root)
      if (info.ready && lastJob.phase !== 'error') {
        return {
          ...lastJob,
          phase: 'ready',
          ready: true,
          modelName: name,
          modelsDir: info.modelsDir,
          source: info.source,
          percent: 100,
          message: lastJob.phase === 'ready' ? lastJob.message : speechEnsureModelReadyMessage(),
          error: null,
        }
      }
      if (!info.ready && lastJob.phase === 'ready') {
        return createIdleSnapshot(name, root, info)
      }
    } catch {
      /* ignore */
    }
  }
  return { ...lastJob, modelName: lastJob.modelName || name }
}

/**
 * 启动或复用进行中的 ensure。已就绪时立即返回 ready。
 * bootstrap 与设置页显式调用均走此入口，保证单飞。
 */
export function startSenseVoiceEnsureJob(
  modelName = 'q8',
  repoRoot?: string,
): SenseVoiceEnsureJobSnapshot {
  const name = modelName.trim().toLowerCase() || 'q8'

  if (isActivePhase(lastJob.phase) || activePromise) {
    return getSenseVoiceEnsureJobStatus(name, repoRoot)
  }

  const info = pipelineDeps.getReadyInfo(name, repoRoot)
  if (info.ready) {
    lastJob = {
      ...createIdleSnapshot(name, repoRoot, info),
      accepted: true,
      started: false,
      phase: 'ready',
      percent: 100,
      message: speechEnsureModelReadyMessage(),
    }
    return getSenseVoiceEnsureJobStatus(name, repoRoot)
  }

  activeModelName = name
  activeRepoRoot = repoRoot
  lastJob = {
    ...createIdleSnapshot(name, repoRoot, info),
    phase: 'preparing',
    accepted: true,
    started: true,
    message: '正在准备语音识别环境…',
    percent: 1,
    error: null,
  }

  activePromise = runEnsurePipeline(name, repoRoot)
  void activePromise

  return getSenseVoiceEnsureJobStatus(name, repoRoot)
}

/** 后台 fire-and-forget；与显式 ensure 共用 job */
export function scheduleSenseVoiceEnsureJob(
  modelName = 'q8',
  repoRoot?: string,
): SenseVoiceEnsureJobSnapshot {
  return startSenseVoiceEnsureJob(modelName, repoRoot)
}
