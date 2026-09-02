/**
 * Shared core model catalog, readiness, validation, and download for Docker onboarding + CLI.
 *
 * Layout under OPPTRIX_MODELS_DIR (default /models):
 *   llms/multilingual-e5-small/          — E5 ONNX
 *   llms/rapidocr-ppocrv4-mobile/        — RapidOCR ONNX + keys
 *   llms/HY-MT1.5-1.8B-Q4_K_M.gguf       — offline translation bootstrap
 *   sensevoice/sensevoice-small-q8.gguf + fsmn-vad.gguf
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  downloadFromSources,
  expandSourceOrder,
  modelscopeBases,
  HF_MIRROR,
  preferForeignMirrors,
} from './model-download.mjs'

export const GGUF_MAGIC = Buffer.from('GGUF', 'ascii')

/** @typedef {'core.e5-multilingual-small' | 'core.rapidocr-ppocrv4-mobile' | 'core.sensevoice-small-q8' | 'core.hy-mt-q4'} CoreModelId */

export const CORE_MODEL_MIRROR_OPTIONS = [
  { id: 'modelscope', label: '魔搭（国内）' },
  { id: 'hf-mirror', label: 'HF 镜像' },
  { id: 'huggingface', label: 'Hugging Face' },
]

/** @type {Record<string, { id: string, label: string, pathHint: string }>} */
export const CORE_MODEL_META = {
  'core.e5-multilingual-small': {
    id: 'core.e5-multilingual-small',
    label: '语义检索',
    pathHint: 'llms/multilingual-e5-small/',
  },
  'core.rapidocr-ppocrv4-mobile': {
    id: 'core.rapidocr-ppocrv4-mobile',
    label: '文档识别',
    pathHint: 'llms/rapidocr-ppocrv4-mobile/',
  },
  'core.sensevoice-small-q8': {
    id: 'core.sensevoice-small-q8',
    label: '语音转写',
    pathHint: 'sensevoice/',
  },
  'core.hy-mt-q4': {
    id: 'core.hy-mt-q4',
    label: '离线翻译',
    pathHint: 'llms/HY-MT1.5-1.8B-Q4_K_M.gguf',
  },
}

export const CORE_MODEL_IDS = Object.keys(CORE_MODEL_META)

/** Gate / onboarding / ensureAll — blocks allReady when missing. */
export const REQUIRED_CORE_MODEL_IDS = [
  'core.e5-multilingual-small',
  'core.rapidocr-ppocrv4-mobile',
  'core.sensevoice-small-q8',
]

/** Catalog-only; download via settings translation flow or includeOptional. */
export const OPTIONAL_CORE_MODEL_IDS = ['core.hy-mt-q4']

const E5_MODELSCOPE_REPO = String(
  process.env.OPPTRIX_E5_MODELSCOPE_REPO ?? 'Xenova/multilingual-e5-small',
).replace(/^\/+|\/+$/g, '')
const E5_HF_REPO = String(
  process.env.OPPTRIX_E5_HF_REPO ?? 'Xenova/multilingual-e5-small',
).replace(/^\/+|\/+$/g, '')

const E5_FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'special_tokens_map.json',
  'onnx/model_quantized.onnx',
]
const E5_OPTIONAL = new Set(['special_tokens_map.json'])
const E5_REQUIRED = E5_FILES.filter((f) => !E5_OPTIONAL.has(f))

const RAPIDOCR_MODELSCOPE_REPO = String(
  process.env.OPPTRIX_RAPIDOCR_MODELSCOPE_REPO ?? 'RapidAI/RapidOCR',
).replace(/^\/+|\/+$/g, '')
const RAPIDOCR_MODELSCOPE_TAG = String(
  process.env.OPPTRIX_RAPIDOCR_MODELSCOPE_TAG ?? 'v3.9.1',
).replace(/^\/+|\/+$/g, '')
const RAPIDOCR_DIRECT_PREFIX = String(process.env.OPPTRIX_RAPIDOCR_DIRECT_URL_PREFIX ?? '')
  .trim()
  .replace(/\/$/, '')

const RAPIDOCR_FILES = [
  {
    local: 'ch_PP-OCRv4_det_mobile.onnx',
    remote: 'onnx/PP-OCRv4/det/ch_PP-OCRv4_det_mobile.onnx',
  },
  {
    local: 'ch_PP-OCRv4_rec_mobile.onnx',
    remote: 'onnx/PP-OCRv4/rec/ch_PP-OCRv4_rec_mobile.onnx',
  },
  {
    local: 'ch_ppocr_mobile_v2.0_cls_mobile.onnx',
    remote: 'onnx/PP-OCRv4/cls/ch_ppocr_mobile_v2.0_cls_mobile.onnx',
  },
  {
    local: 'ppocr_keys_v1.txt',
    remote: 'paddle/PP-OCRv4/rec/ch_PP-OCRv4_rec_mobile/ppocr_keys_v1.txt',
  },
]

const SENSEVOICE_FILES = [
  { filename: 'sensevoice-small-q8.gguf', repo: 'FunAudioLLM/SenseVoiceSmall-GGUF' },
  { filename: 'fsmn-vad.gguf', repo: 'FunAudioLLM/fsmn-vad-GGUF' },
]

const HY_MT_HF_REPO = String(
  process.env.OPPTRIX_HY_MT_HF_REPO ?? 'tencent/HY-MT1.5-1.8B-GGUF',
).replace(/^\/+|\/+$/g, '')
const HY_MT_MODELSCOPE_REPO = String(
  process.env.OPPTRIX_HY_MT_MODELSCOPE_REPO ?? 'Tencent-Hunyuan/HY-MT1.5-1.8B-GGUF',
).replace(/^\/+|\/+$/g, '')
const HY_MT_FILENAME = 'HY-MT1.5-1.8B-Q4_K_M.gguf'

export function resolveModelsDir() {
  return path.resolve(process.env.OPPTRIX_MODELS_DIR?.trim() || '/models')
}

export function resolveCoreModelPaths(modelsDir = resolveModelsDir()) {
  const llmDir = path.join(modelsDir, 'llms')
  return {
    modelsDir,
    llmDir,
    e5Dir: path.join(llmDir, 'multilingual-e5-small'),
    rapidocrDir: path.join(llmDir, 'rapidocr-ppocrv4-mobile'),
    sensevoiceDir: path.join(modelsDir, 'sensevoice'),
    hyMtPath: path.join(llmDir, HY_MT_FILENAME),
  }
}

function exists(filePath) {
  try {
    return fs.existsSync(filePath)
  } catch {
    return false
  }
}

export function forceModelFetch() {
  const raw = process.env.OPPTRIX_FORCE_MODEL_FETCH?.trim()
  return raw === '1' || raw?.toLowerCase() === 'true' || raw?.toLowerCase() === 'yes'
}

export function isGgufBuffer(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 4) return false
  return buf.subarray(0, 4).equals(GGUF_MAGIC)
}

export function isOnnxFilename(name) {
  return /\.onnx$/i.test(String(name ?? ''))
}

export function isZipFilename(name) {
  return /\.zip$/i.test(String(name ?? ''))
}

export function isGgufFilename(name) {
  return /\.gguf$/i.test(String(name ?? ''))
}

/** @param {string} modelId @param {string} [modelsDir] */
export function isCoreModelReady(modelId, modelsDir) {
  const dirs = resolveCoreModelPaths(modelsDir)
  if (forceModelFetch()) return false
  switch (modelId) {
    case 'core.e5-multilingual-small':
      return E5_REQUIRED.every((f) => exists(path.join(dirs.e5Dir, f)))
    case 'core.rapidocr-ppocrv4-mobile':
      return RAPIDOCR_FILES.every((f) => exists(path.join(dirs.rapidocrDir, f.local)))
    case 'core.sensevoice-small-q8':
      return SENSEVOICE_FILES.every((f) => exists(path.join(dirs.sensevoiceDir, f.filename)))
    case 'core.hy-mt-q4':
      return exists(dirs.hyMtPath)
    default:
      return false
  }
}

export function areAllCoreModelsReady(modelsDir) {
  return REQUIRED_CORE_MODEL_IDS.every((id) => isCoreModelReady(id, modelsDir))
}

export function buildCoreModelsStatus(modelsDir = resolveModelsDir()) {
  const items = REQUIRED_CORE_MODEL_IDS.map((id) => {
    const meta = CORE_MODEL_META[id]
    return {
      id,
      label: meta.label,
      ready: isCoreModelReady(id, modelsDir),
      pathHint: meta.pathHint,
    }
  })
  return {
    required: [...REQUIRED_CORE_MODEL_IDS],
    items,
    allReady: items.every((i) => i.ready),
    sourceOrder: resolveEffectiveSourceOrder(),
    mirrors: [...CORE_MODEL_MIRROR_OPTIONS],
  }
}

export function resolveEffectiveSourceOrder(preferenceOrder) {
  const raw = String(process.env.OPPTRIX_MODEL_SOURCE_ORDER ?? '').trim()
  if (raw) {
    return expandSourceOrder(
      raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
      { foreign: preferForeignMirrors() },
    )
  }
  if (Array.isArray(preferenceOrder) && preferenceOrder.length) {
    return expandSourceOrder(
      preferenceOrder.map((s) => String(s).trim().toLowerCase()).filter(Boolean),
      { foreign: preferForeignMirrors() },
    )
  }
  if (preferForeignMirrors()) {
    return ['huggingface', 'hf-mirror', 'modelscope']
  }
  return ['modelscope', 'hf-mirror', 'huggingface']
}

export function normalizeSourceOrderInput(order) {
  if (!Array.isArray(order)) return null
  const allowed = new Set(CORE_MODEL_MIRROR_OPTIONS.map((m) => m.id))
  const out = []
  for (const raw of order) {
    const kind = String(raw ?? '').trim().toLowerCase()
    if (!kind || !allowed.has(kind)) continue
    if (!out.includes(kind)) out.push(kind)
  }
  return out.length ? out : null
}

function e5Sources(filename) {
  const sources = []
  for (const base of modelscopeBases()) {
    const host = base.includes('www.') ? 'www' : 'apex'
    sources.push({
      kind: 'modelscope',
      label: `modelscope-${host}`,
      url: `${base}/models/${E5_MODELSCOPE_REPO}/resolve/master/${filename}`,
    })
  }
  sources.push(
    {
      kind: 'hf-mirror',
      label: 'hf-mirror',
      url: `${HF_MIRROR}/${E5_HF_REPO}/resolve/main/${filename}?download=true`,
    },
    {
      kind: 'huggingface',
      label: 'huggingface',
      url: `https://huggingface.co/${E5_HF_REPO}/resolve/main/${filename}?download=true`,
    },
  )
  return sources
}

function rapidocrSources(remotePath) {
  const sources = []
  if (RAPIDOCR_DIRECT_PREFIX) {
    sources.push({
      kind: 'direct',
      label: 'direct-r2',
      url: `${RAPIDOCR_DIRECT_PREFIX}/${remotePath}`,
    })
  }
  const tags = RAPIDOCR_MODELSCOPE_TAG === 'master'
    ? ['master']
    : [RAPIDOCR_MODELSCOPE_TAG, 'master']
  for (const tag of tags) {
    for (const base of modelscopeBases()) {
      const host = base.includes('www.') ? 'www' : 'apex'
      const tagLabel = tag === RAPIDOCR_MODELSCOPE_TAG ? tag : `fallback-${tag}`
      sources.push({
        kind: 'modelscope',
        label: `modelscope-${host}-${tagLabel}`,
        url: `${base}/models/${RAPIDOCR_MODELSCOPE_REPO}/resolve/${tag}/${remotePath}`,
      })
    }
  }
  return sources
}

function sensevoiceSources(repo, filename) {
  const sources = []
  for (const base of modelscopeBases()) {
    const host = base.includes('www.') ? 'www' : 'apex'
    sources.push({
      kind: 'modelscope',
      label: `modelscope-${host}`,
      url: `${base}/models/${repo}/resolve/master/${filename}`,
    })
  }
  sources.push(
    {
      kind: 'hf-mirror',
      label: 'hf-mirror',
      url: `${HF_MIRROR}/${repo}/resolve/main/${filename}?download=true`,
    },
    {
      kind: 'huggingface',
      label: 'huggingface',
      url: `https://huggingface.co/${repo}/resolve/main/${filename}?download=true`,
    },
  )
  return sources
}

function hyMtSources(filename) {
  const sources = []
  for (const base of modelscopeBases()) {
    const host = base.includes('www.') ? 'www' : 'apex'
    sources.push({
      kind: 'modelscope',
      label: `modelscope-${host}`,
      url: `${base}/models/${HY_MT_MODELSCOPE_REPO}/resolve/master/${filename}`,
    })
  }
  sources.push(
    {
      kind: 'hf-mirror',
      label: 'hf-mirror',
      url: `${HF_MIRROR}/${HY_MT_HF_REPO}/resolve/main/${filename}?download=true`,
    },
    {
      kind: 'huggingface',
      label: 'huggingface',
      url: `https://huggingface.co/${HY_MT_HF_REPO}/resolve/main/${filename}?download=true`,
    },
  )
  return sources
}

async function ensureE5(logPrefix, onProgress) {
  const { e5Dir } = resolveCoreModelPaths()
  const modelId = 'core.e5-multilingual-small'
  if (isCoreModelReady(modelId)) {
    onProgress?.({ modelId, phase: 'ready' })
    return
  }
  onProgress?.({ modelId, phase: 'downloading' })
  await fs.promises.mkdir(e5Dir, { recursive: true })
  const files = E5_FILES
  let done = 0
  for (const file of files) {
    const dest = path.join(e5Dir, file)
    if (exists(dest) && !forceModelFetch()) {
      done += 1
      onProgress?.({
        modelId,
        phase: 'downloading',
        fileName: file,
        fileIndex: done,
        fileCount: files.length,
        modelRatio: done / files.length,
      })
      continue
    }
    try {
      await downloadFromSources(e5Sources(file), dest, {
        logPrefix,
        onProgress: (bp) => {
          const fileRatio = bp.total && bp.total > 0 ? bp.received / bp.total : 0
          onProgress?.({
            modelId,
            phase: 'downloading',
            fileName: file,
            fileIndex: done,
            fileCount: files.length,
            bytesReceived: bp.received,
            bytesTotal: bp.total,
            modelRatio: (done + fileRatio) / files.length,
          })
        },
      })
    } catch (err) {
      if (E5_OPTIONAL.has(file)) {
        done += 1
        continue
      }
      throw err
    }
    done += 1
    onProgress?.({
      modelId,
      phase: 'downloading',
      fileName: file,
      fileIndex: done,
      fileCount: files.length,
      modelRatio: done / files.length,
    })
  }
  if (!isCoreModelReady(modelId)) {
    const missing = E5_REQUIRED.filter((f) => !exists(path.join(e5Dir, f)))
    throw new Error(`语义检索组件不完整：缺少 ${missing.join(', ')}`)
  }
  onProgress?.({ modelId, phase: 'ready', modelRatio: 1 })
}

async function ensureRapidOcr(logPrefix, onProgress) {
  const { rapidocrDir } = resolveCoreModelPaths()
  const modelId = 'core.rapidocr-ppocrv4-mobile'
  if (isCoreModelReady(modelId)) {
    onProgress?.({ modelId, phase: 'ready' })
    return
  }
  onProgress?.({ modelId, phase: 'downloading' })
  await fs.promises.mkdir(rapidocrDir, { recursive: true })
  const files = RAPIDOCR_FILES
  let done = 0
  for (const entry of files) {
    const dest = path.join(rapidocrDir, entry.local)
    if (exists(dest) && !forceModelFetch()) {
      done += 1
      onProgress?.({
        modelId,
        phase: 'downloading',
        fileName: entry.local,
        fileIndex: done,
        fileCount: files.length,
        modelRatio: done / files.length,
      })
      continue
    }
    await downloadFromSources(rapidocrSources(entry.remote), dest, {
      logPrefix,
      onProgress: (bp) => {
        const fileRatio = bp.total && bp.total > 0 ? bp.received / bp.total : 0
        onProgress?.({
          modelId,
          phase: 'downloading',
          fileName: entry.local,
          fileIndex: done,
          fileCount: files.length,
          bytesReceived: bp.received,
          bytesTotal: bp.total,
          modelRatio: (done + fileRatio) / files.length,
        })
      },
    })
    done += 1
    onProgress?.({
      modelId,
      phase: 'downloading',
      fileName: entry.local,
      fileIndex: done,
      fileCount: files.length,
      modelRatio: done / files.length,
    })
  }
  if (!isCoreModelReady(modelId)) {
    const missing = RAPIDOCR_FILES.filter((f) => !exists(path.join(rapidocrDir, f.local)))
      .map((f) => f.local)
    throw new Error(`文档识别组件不完整：缺少 ${missing.join(', ')}`)
  }
  onProgress?.({ modelId, phase: 'ready', modelRatio: 1 })
}

async function ensureSenseVoice(logPrefix, onProgress) {
  const { sensevoiceDir } = resolveCoreModelPaths()
  const modelId = 'core.sensevoice-small-q8'
  if (isCoreModelReady(modelId)) {
    onProgress?.({ modelId, phase: 'ready' })
    return
  }
  onProgress?.({ modelId, phase: 'downloading' })
  await fs.promises.mkdir(sensevoiceDir, { recursive: true })
  const files = SENSEVOICE_FILES
  let done = 0
  for (const spec of files) {
    const dest = path.join(sensevoiceDir, spec.filename)
    if (exists(dest) && !forceModelFetch()) {
      done += 1
      onProgress?.({
        modelId,
        phase: 'downloading',
        fileName: spec.filename,
        fileIndex: done,
        fileCount: files.length,
        modelRatio: done / files.length,
      })
      continue
    }
    await downloadFromSources(sensevoiceSources(spec.repo, spec.filename), dest, {
      logPrefix,
      onProgress: (bp) => {
        const fileRatio = bp.total && bp.total > 0 ? bp.received / bp.total : 0
        onProgress?.({
          modelId,
          phase: 'downloading',
          fileName: spec.filename,
          fileIndex: done,
          fileCount: files.length,
          bytesReceived: bp.received,
          bytesTotal: bp.total,
          modelRatio: (done + fileRatio) / files.length,
        })
      },
    })
    done += 1
    onProgress?.({
      modelId,
      phase: 'downloading',
      fileName: spec.filename,
      fileIndex: done,
      fileCount: files.length,
      modelRatio: done / files.length,
    })
  }
  if (!isCoreModelReady(modelId)) {
    const missing = SENSEVOICE_FILES.filter((f) => !exists(path.join(sensevoiceDir, f.filename)))
      .map((f) => f.filename)
    throw new Error(`语音转写组件不完整：缺少 ${missing.join(', ')}`)
  }
  onProgress?.({ modelId, phase: 'ready', modelRatio: 1 })
}

async function ensureHyMt(logPrefix, onProgress) {
  const { llmDir, hyMtPath } = resolveCoreModelPaths()
  const modelId = 'core.hy-mt-q4'
  if (isCoreModelReady(modelId)) {
    onProgress?.({ modelId, phase: 'ready' })
    return
  }
  onProgress?.({ modelId, phase: 'downloading' })
  await fs.promises.mkdir(llmDir, { recursive: true })
  if (!exists(hyMtPath) || forceModelFetch()) {
    await downloadFromSources(hyMtSources(HY_MT_FILENAME), hyMtPath, {
      logPrefix,
      onProgress: (bp) => {
        const fileRatio = bp.total && bp.total > 0 ? bp.received / bp.total : 0
        onProgress?.({
          modelId,
          phase: 'downloading',
          fileName: HY_MT_FILENAME,
          fileIndex: 0,
          fileCount: 1,
          bytesReceived: bp.received,
          bytesTotal: bp.total,
          modelRatio: fileRatio,
        })
      },
    })
  }
  if (!isCoreModelReady(modelId)) {
    throw new Error('离线翻译组件不完整')
  }
  onProgress?.({ modelId, phase: 'ready', modelRatio: 1 })
}

/**
 * Ensures required core models (E5 / OCR / SenseVoice).
 * Pass `includeOptional: true` to also fetch hy-mt offline translation.
 *
 * @param {{
 *   logPrefix?: string,
 *   sourceOrder?: string[],
 *   includeOptional?: boolean,
 *   onProgress?: (p: {
 *     modelId: string,
 *     phase: string,
 *     message?: string,
 *     fileName?: string,
 *     fileIndex?: number,
 *     fileCount?: number,
 *     bytesReceived?: number,
 *     bytesTotal?: number | null,
 *     modelRatio?: number,
 *   }) => void,
 * }} [opts]
 */
export async function ensureAllCoreModels(opts = {}) {
  const logPrefix = opts.logPrefix ?? 'core-models'
  const prevOrder = process.env.OPPTRIX_MODEL_SOURCE_ORDER
  if (Array.isArray(opts.sourceOrder) && opts.sourceOrder.length) {
    process.env.OPPTRIX_MODEL_SOURCE_ORDER = opts.sourceOrder.join(',')
  }
  try {
    const { llmDir } = resolveCoreModelPaths()
    await fs.promises.mkdir(llmDir, { recursive: true })
    /** @type {Array<[string, (log: string, onProgress?: typeof opts.onProgress) => Promise<void>]>} */
    const tasks = [
      ['core.e5-multilingual-small', ensureE5],
      ['core.rapidocr-ppocrv4-mobile', ensureRapidOcr],
      ['core.sensevoice-small-q8', ensureSenseVoice],
    ]
    if (opts.includeOptional) {
      tasks.push(['core.hy-mt-q4', ensureHyMt])
    }
    const errors = []
    for (const [name, fn] of tasks) {
      try {
        await fn(logPrefix, opts.onProgress)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`${logPrefix}: ${name} FAILED — ${msg}`)
        errors.push(name)
        opts.onProgress?.({ modelId: name, phase: 'error', message: msg })
      }
    }
    if (errors.length) {
      throw new Error(`部分组件未能就绪：${errors.join(', ')}`)
    }
  } finally {
    if (prevOrder === undefined) delete process.env.OPPTRIX_MODEL_SOURCE_ORDER
    else process.env.OPPTRIX_MODEL_SOURCE_ORDER = prevOrder
  }
}

/** @param {string} modelId @param {Buffer} buf @param {string} filename */
export function validateImportBuffer(modelId, buf, filename) {
  const name = path.basename(filename || '')
  if (!buf?.length) return { ok: false, error: '文件为空' }
  if (buf.length < 64) return { ok: false, error: '文件过小，可能已损坏' }

  if (modelId === 'core.hy-mt-q4' || modelId === 'core.sensevoice-small-q8') {
    if (!isGgufFilename(name) && !isZipFilename(name)) {
      return { ok: false, error: '请上传 .gguf 模型文件或包含模型的 .zip 压缩包' }
    }
    if (isGgufFilename(name) && !isGgufBuffer(buf)) {
      return { ok: false, error: '不是有效的 GGUF 模型文件' }
    }
    return { ok: true }
  }

  if (modelId === 'core.e5-multilingual-small') {
    if (isOnnxFilename(name)) return { ok: true }
    if (isZipFilename(name)) return { ok: true }
    if (/\.(json|txt)$/i.test(name)) return { ok: true }
    return { ok: false, error: '请上传 ONNX、配置文件或包含完整目录的 .zip' }
  }

  if (modelId === 'core.rapidocr-ppocrv4-mobile') {
    if (isOnnxFilename(name) || name === 'ppocr_keys_v1.txt') return { ok: true }
    if (isZipFilename(name)) return { ok: true }
    return { ok: false, error: '请上传 ONNX、字典文件或包含完整目录的 .zip' }
  }

  return { ok: false, error: '未知的模型类型' }
}

/** Canonical destination mapping for a single imported file by basename. */
export function mapImportDest(modelId, filename, modelsDir = resolveModelsDir()) {
  const dirs = resolveCoreModelPaths(modelsDir)
  const base = path.basename(filename)
  switch (modelId) {
    case 'core.hy-mt-q4':
      return dirs.hyMtPath
    case 'core.sensevoice-small-q8':
      if (base === 'fsmn-vad.gguf') return path.join(dirs.sensevoiceDir, 'fsmn-vad.gguf')
      return path.join(dirs.sensevoiceDir, 'sensevoice-small-q8.gguf')
    case 'core.e5-multilingual-small':
      if (base === 'model_quantized.onnx') return path.join(dirs.e5Dir, 'onnx/model_quantized.onnx')
      return path.join(dirs.e5Dir, base)
    case 'core.rapidocr-ppocrv4-mobile':
      return path.join(dirs.rapidocrDir, base)
    default:
      return null
  }
}

export async function writeImportFile(destPath, buf) {
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true })
  const temp = `${destPath}.import`
  await fs.promises.writeFile(temp, buf)
  await fs.promises.rename(temp, destPath)
}

export {
  E5_REQUIRED,
  E5_FILES,
  RAPIDOCR_FILES,
  SENSEVOICE_FILES,
  HY_MT_FILENAME,
}
