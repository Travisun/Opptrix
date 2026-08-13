/**
 * 设置 / 服务端：解析引擎与语义模型状态（用户文案不含引擎专名）。
 * 已移除「版面增强」(pdfplumber)；深度整理 = OCR 可用性。
 */
import {
  getOcrL2Status,
  prepareOcrL2Install,
  removeOcrL2Install,
  markOcrL2Ready,
  type OcrEngineStatus,
} from './engines/ocr-l2.js'
import {
  getSemanticModelStatus,
  installSemanticModel,
  uninstallSemanticModel,
  type SemanticModelUiStatus,
} from './embedding-api.js'
import { isEmbeddingModelInstalled } from './model-downloader.js'
import type { RapidOcrModelSource } from './paths.js'

export type ParseEnginesUiStatus = {
  /** @deprecated 始终不可用；保留字段以免旧客户端炸 */
  layout: {
    available: boolean
    installed: boolean
    label: string
    hint: string
    source: 'bundled' | 'user' | 'missing'
  }
  deep: {
    available: boolean
    installed: boolean
    label: string
    hint: string
    source: RapidOcrModelSource
  }
  semantic: SemanticModelUiStatus
}

function toPublicDeep(s: OcrEngineStatus) {
  return {
    available: s.available,
    installed: s.installed,
    label: s.label,
    hint: s.hint,
    source: s.source,
  }
}

function retiredLayout() {
  return {
    available: false,
    installed: false,
    label: '版面增强',
    hint: '该能力已停用，基础整理与扫描件识别已覆盖常见研报',
    source: 'missing' as const,
  }
}

export function getParseEnginesStatus(): ParseEnginesUiStatus {
  return {
    layout: retiredLayout(),
    deep: toPublicDeep(getOcrL2Status()),
    semantic: getSemanticModelStatus(),
  }
}

/** @deprecated 版面增强已移除 */
export async function prepareLayoutEngine(): Promise<ParseEnginesUiStatus['layout']> {
  return retiredLayout()
}

/** @deprecated */
export async function uninstallLayoutEngine(): Promise<void> {
  /* no-op */
}

export async function prepareDeepEngine(): Promise<ParseEnginesUiStatus['deep']> {
  return toPublicDeep(await prepareOcrL2Install())
}

export async function markDeepEngineReady(): Promise<ParseEnginesUiStatus['deep']> {
  return toPublicDeep(await markOcrL2Ready())
}

export async function uninstallDeepEngine(): Promise<void> {
  await removeOcrL2Install()
}

export {
  getSemanticModelStatus,
  installSemanticModel,
  uninstallSemanticModel,
}

/**
 * 桌面首启：仅探测磁盘/runtime（语义模型 / OCR 是否已就绪），不阻塞下载、不载入 E5 pipeline。
 * 缺失时由设置页异步 prepare job 或入库路径按需准备。失败不抛；日志不含路径与密钥。
 */
export async function ensureBundledRagRuntime(): Promise<{
  embedding: boolean
  layout: boolean
  deep: boolean
}> {
  const result = { embedding: false, layout: false, deep: false }

  try {
    // 只检查已安装；embedQuery / hybrid / scheduleEmbed 等路径按需 tryEnable
    result.embedding = isEmbeddingModelInstalled()
  } catch {
    result.embedding = false
  }

  result.layout = false

  try {
    // 只探测；勿 await prepareOcrL2Install（慢网会拖死启动）
    result.deep = getOcrL2Status().available
  } catch {
    result.deep = false
  }

  return result
}
