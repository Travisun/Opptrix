/**
 * 兼容层：历史 rapidocr-l2 API → ocr-l2（Node ONNX）。
 */
export {
  OCR_L2_ENGINE_VERSION as RAPIDOCR_ENGINE_VERSION,
  RAPIDOCR_MODEL_FILES,
  createOcrL2Runner,
  createRapidOcrL2Runner,
  ensureRapidOcrModelsDownloaded,
  getOcrL2Status,
  getRapidOcrStatus,
  isOcrL2Available,
  isRapidOcrAvailable,
  markOcrL2Ready,
  markRapidOcrReady,
  missingRapidOcrModelFiles,
  prepareOcrL2Install,
  prepareRapidOcrInstall,
  rapidocrPythonBin,
  rapidocrWorkerScriptPath,
  removeOcrL2Install,
  removeRapidOcrInstall,
  resolveRapidOcrModelDir,
  runOcrL2,
  type OcrEngineStatus,
  type RapidOcrStatus,
} from './ocr-l2.js'
