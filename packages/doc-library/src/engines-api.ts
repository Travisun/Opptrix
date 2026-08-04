/**
 * 设置 / 服务端：解析引擎与语义模型状态（用户文案不含引擎专名）。
 */
import {
  getPdfplumberStatus,
  preparePdfplumberInstall,
  removePdfplumberInstall,
  type PdfplumberStatus,
} from './engines/pdfplumber-l1.js'
import {
  getUnlimitedOcrStatus,
  markUnlimitedOcrReady,
  prepareUnlimitedOcrInstall,
  removeUnlimitedOcrInstall,
  type UnlimitedOcrStatus,
} from './engines/unlimited-ocr-l2.js'
import {
  getSemanticModelStatus,
  installSemanticModel,
  uninstallSemanticModel,
  type SemanticModelUiStatus,
} from './embedding-api.js'

export type ParseEnginesUiStatus = {
  layout: {
    available: boolean
    installed: boolean
    label: string
    hint: string
  }
  deep: {
    available: boolean
    installed: boolean
    label: string
    hint: string
  }
  semantic: SemanticModelUiStatus
}

function toPublicLayout(s: PdfplumberStatus) {
  return {
    available: s.available,
    installed: s.installed,
    label: s.label,
    hint: s.hint,
  }
}

function toPublicDeep(s: UnlimitedOcrStatus) {
  return {
    available: s.available,
    installed: s.installed,
    label: s.label,
    hint: s.hint,
  }
}

export function getParseEnginesStatus(): ParseEnginesUiStatus {
  return {
    layout: toPublicLayout(getPdfplumberStatus()),
    deep: toPublicDeep(getUnlimitedOcrStatus()),
    semantic: getSemanticModelStatus(),
  }
}

export async function prepareLayoutEngine(): Promise<ParseEnginesUiStatus['layout']> {
  return toPublicLayout(await preparePdfplumberInstall())
}

export async function uninstallLayoutEngine(): Promise<void> {
  await removePdfplumberInstall()
}

export async function prepareDeepEngine(): Promise<ParseEnginesUiStatus['deep']> {
  return toPublicDeep(await prepareUnlimitedOcrInstall())
}

export async function markDeepEngineReady(): Promise<ParseEnginesUiStatus['deep']> {
  return toPublicDeep(await markUnlimitedOcrReady())
}

export async function uninstallDeepEngine(): Promise<void> {
  await removeUnlimitedOcrInstall()
}

export {
  getSemanticModelStatus,
  installSemanticModel,
  uninstallSemanticModel,
}
