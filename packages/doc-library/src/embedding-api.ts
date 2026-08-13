/**
 * 设置页 / 服务端钩子：安装、校验、卸载语义检索模型（不暴露技术源名给 UI）。
 */
import {
  downloadEmbeddingModel,
  getEmbeddingModelStatus,
  removeEmbeddingModel,
  verifyEmbeddingModel,
  type DownloadProgress,
  type EmbeddingModelStatus,
} from './model-downloader.js'
import { getEmbeddingService } from './embedding.js'
import type { EmbeddingModelSource } from './paths.js'

export type SemanticModelUiStatus = {
  /** 是否已就绪可用（含安装包内置） */
  installed: boolean
  /** 面向用户的模型名 */
  label: string
  /** 本地目录（仅供开发者日志，勿直接展示给用户） */
  dir: string
  missingFiles: string[]
  /** bundled = 应用自带；user = 本机副本；missing = 未就绪 */
  source: EmbeddingModelSource
}

export function getSemanticModelStatus(): SemanticModelUiStatus {
  const s = getEmbeddingModelStatus()
  return {
    installed: s.installed,
    label: '语义检索模型',
    dir: s.dir,
    missingFiles: s.missingFiles,
    source: s.source,
  }
}

/**
 * 同步安装语义模型（下载 + tryEnable）。
 * 向量回填由 tryEnable → scheduleEmbedPendingAfterEnable 延后执行，勿在此阻塞。
 * 设置页请用 startSemanticModelInstallJob（异步 + 进度）。
 */
export async function installSemanticModel(opts: {
  onProgress?: (p: DownloadProgress) => void
  timeoutMs?: number
} = {}): Promise<SemanticModelUiStatus> {
  await downloadEmbeddingModel({
    onProgress: opts.onProgress,
    timeoutMs: opts.timeoutMs,
  })
  const embedding = getEmbeddingService()
  await embedding.tryEnableDefaultBackend()
  return getSemanticModelStatus()
}

/** 仅清除用户目录副本；安装包内置不受影响，清除后若仍有内置则保持就绪。 */
export async function uninstallSemanticModel(): Promise<SemanticModelUiStatus> {
  const embedding = getEmbeddingService()
  await embedding.getBackend()?.dispose?.()
  embedding.setBackend(null)
  await removeEmbeddingModel()
  await embedding.tryEnableDefaultBackend()
  return getSemanticModelStatus()
}

export { verifyEmbeddingModel, type EmbeddingModelStatus, type DownloadProgress }
