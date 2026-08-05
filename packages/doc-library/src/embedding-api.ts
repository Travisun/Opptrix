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
  // 安装后尽量回填已整理文档的向量（动态 import 避免与 index 循环依赖）
  try {
    const { getDocLibraryService } = await import('./index.js')
    const svc = getDocLibraryService()
    svc.setEmbeddingService(embedding)
    await svc.embedPendingDocuments()
  } catch {
    /* 回填失败不阻断安装成功 */
  }
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
