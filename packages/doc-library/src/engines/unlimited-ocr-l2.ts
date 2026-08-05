/**
 * L2 兼容别名：历史 ID `unlimited-ocr-l2` 映射至 ocr-l2 runner。
 */
import { createOcrL2Runner, OCR_L2_ENGINE_VERSION } from './ocr-l2.js'
import type { ParseRunner } from '../types.js'
import type { OcrEngineStatus } from './ocr-l2.js'

export const UNLIMITED_OCR_ENGINE_VERSION = OCR_L2_ENGINE_VERSION
export type UnlimitedOcrStatus = OcrEngineStatus

export {
  getOcrL2Status as getUnlimitedOcrStatus,
  isOcrL2Available as isUnlimitedOcrAvailable,
  prepareOcrL2Install as prepareUnlimitedOcrInstall,
  markOcrL2Ready as markUnlimitedOcrReady,
  removeOcrL2Install as removeUnlimitedOcrInstall,
} from './ocr-l2.js'

export function createUnlimitedOcrL2Runner(opts: { timeoutMs?: number } = {}): ParseRunner {
  return createOcrL2Runner({ timeoutMs: opts.timeoutMs, engineId: 'unlimited-ocr-l2' })
}
