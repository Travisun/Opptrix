#!/usr/bin/env node
/**
 * First-boot (or empty-volume) fetch of core models into /models.
 *
 * Layout (matches entrypoint env):
 *   /models/llms/multilingual-e5-small/     — E5 ONNX (Xenova layout)
 *   /models/llms/rapidocr-ppocrv4-mobile/   — RapidOCR PP-OCRv4 mobile ONNX + keys
 *   /models/llms/*.gguf                    — HY-MT translation bootstrap (OPPTRIX_LLM_DIR)
 *   /models/sensevoice/                    — sensevoice-small-q8.gguf + fsmn-vad.gguf
 *
 * Reuses download helpers from apps/desktop/scripts/lib/model-download.mjs
 * (same URLs / source order as stage-e5 / stage-rapidocr / stage-sensevoice / HY-MT).
 *
 * Non-fatal when invoked from entrypoint (caller catches). Exit 1 on hard failure.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  downloadFromSources,
  modelscopeBases,
  HF_MIRROR,
} from '../apps/desktop/scripts/lib/model-download.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')

const MODELS_DIR = path.resolve(
  process.env.OPPTRIX_MODELS_DIR?.trim() || '/models',
)
const LLM_DIR = path.join(MODELS_DIR, 'llms')
const E5_DIR = path.join(LLM_DIR, 'multilingual-e5-small')
const RAPIDOCR_DIR = path.join(LLM_DIR, 'rapidocr-ppocrv4-mobile')
const SENSEVOICE_DIR = path.join(MODELS_DIR, 'sensevoice')

const LOG = 'docker-fetch-models'

// ── E5 (align stage-e5.mjs) ──────────────────────────────────────────────────
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

function e5Sources(filename) {
  /** @type {import('../apps/desktop/scripts/lib/model-download.mjs').DownloadSource[]} */
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
      kind: 'huggingface',
      label: 'huggingface',
      url: `https://huggingface.co/${E5_HF_REPO}/resolve/main/${filename}?download=true`,
    },
    {
      kind: 'huggingface',
      label: 'hf-mirror',
      url: `${HF_MIRROR}/${E5_HF_REPO}/resolve/main/${filename}?download=true`,
    },
  )
  return sources
}

// ── RapidOCR (align stage-rapidocr.mjs) ──────────────────────────────────────
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

function rapidocrSources(remotePath) {
  /** @type {import('../apps/desktop/scripts/lib/model-download.mjs').DownloadSource[]} */
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

// ── SenseVoice q8 + VAD (align stage-sensevoice.mjs) ─────────────────────────
const SENSEVOICE_FILES = [
  {
    filename: 'sensevoice-small-q8.gguf',
    repo: 'FunAudioLLM/SenseVoiceSmall-GGUF',
  },
  {
    filename: 'fsmn-vad.gguf',
    repo: 'FunAudioLLM/fsmn-vad-GGUF',
  },
]

function sensevoiceSources(repo, filename) {
  /** @type {import('../apps/desktop/scripts/lib/model-download.mjs').DownloadSource[]} */
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
      kind: 'huggingface',
      label: 'huggingface',
      url: `https://huggingface.co/${repo}/resolve/main/${filename}?download=true`,
    },
    {
      kind: 'huggingface',
      label: 'hf-mirror',
      url: `${HF_MIRROR}/${repo}/resolve/main/${filename}?download=true`,
    },
  )
  return sources
}

// ── HY-MT translation GGUF (align TRANSLATION_BOOTSTRAP_MODEL_IDS / hy-mt-q4) ─
const HY_MT_REPO = 'tencent/HY-MT1.5-1.8B-GGUF'
const HY_MT_BOOTSTRAP = [
  {
    id: 'hy-mt-q4',
    filename: 'HY-MT1.5-1.8B-Q4_K_M.gguf',
  },
]

function hyMtSources(filename) {
  /** @type {import('../apps/desktop/scripts/lib/model-download.mjs').DownloadSource[]} */
  return [
    {
      kind: 'huggingface',
      label: 'hf-mirror',
      url: `${HF_MIRROR}/${HY_MT_REPO}/resolve/main/${filename}?download=true`,
    },
    {
      kind: 'huggingface',
      label: 'huggingface',
      url: `https://huggingface.co/${HY_MT_REPO}/resolve/main/${filename}?download=true`,
    },
  ]
}

function exists(filePath) {
  try {
    return fs.existsSync(filePath)
  } catch {
    return false
  }
}

function e5Ready() {
  return E5_REQUIRED.every((f) => exists(path.join(E5_DIR, f)))
}

function rapidocrReady() {
  return RAPIDOCR_FILES.every((f) => exists(path.join(RAPIDOCR_DIR, f.local)))
}

function sensevoiceReady() {
  return SENSEVOICE_FILES.every((f) => exists(path.join(SENSEVOICE_DIR, f.filename)))
}

function hyMtReady() {
  return HY_MT_BOOTSTRAP.every((f) => exists(path.join(LLM_DIR, f.filename)))
}

async function ensureE5() {
  if (e5Ready()) {
    console.log(`${LOG}: e5 already present`)
    return
  }
  console.log(`${LOG}: fetching e5 → ${E5_DIR}`)
  await fs.promises.mkdir(E5_DIR, { recursive: true })
  for (const file of E5_FILES) {
    const dest = path.join(E5_DIR, file)
    if (exists(dest)) {
      console.log(`${LOG}: skip existing ${file}`)
      continue
    }
    try {
      await downloadFromSources(e5Sources(file), dest, { logPrefix: LOG })
    } catch (err) {
      if (E5_OPTIONAL.has(file)) {
        console.log(`${LOG}: optional ${file} skipped`)
        continue
      }
      throw err
    }
  }
  if (!e5Ready()) {
    const missing = E5_REQUIRED.filter((f) => !exists(path.join(E5_DIR, f)))
    throw new Error(`e5 missing after fetch: ${missing.join(', ')}`)
  }
  console.log(`${LOG}: e5 OK`)
}

async function ensureRapidOcr() {
  if (rapidocrReady()) {
    console.log(`${LOG}: rapidocr already present`)
    return
  }
  console.log(`${LOG}: fetching rapidocr → ${RAPIDOCR_DIR}`)
  await fs.promises.mkdir(RAPIDOCR_DIR, { recursive: true })
  for (const entry of RAPIDOCR_FILES) {
    const dest = path.join(RAPIDOCR_DIR, entry.local)
    if (exists(dest)) {
      console.log(`${LOG}: skip existing ${entry.local}`)
      continue
    }
    await downloadFromSources(rapidocrSources(entry.remote), dest, { logPrefix: LOG })
  }
  if (!rapidocrReady()) {
    const missing = RAPIDOCR_FILES.filter((f) => !exists(path.join(RAPIDOCR_DIR, f.local)))
      .map((f) => f.local)
    throw new Error(`rapidocr missing after fetch: ${missing.join(', ')}`)
  }
  console.log(`${LOG}: rapidocr OK`)
}

async function ensureSenseVoice() {
  if (sensevoiceReady()) {
    console.log(`${LOG}: sensevoice already present`)
    return
  }
  console.log(`${LOG}: fetching sensevoice → ${SENSEVOICE_DIR}`)
  await fs.promises.mkdir(SENSEVOICE_DIR, { recursive: true })
  for (const spec of SENSEVOICE_FILES) {
    const dest = path.join(SENSEVOICE_DIR, spec.filename)
    if (exists(dest)) {
      console.log(`${LOG}: skip existing ${spec.filename}`)
      continue
    }
    await downloadFromSources(sensevoiceSources(spec.repo, spec.filename), dest, {
      logPrefix: LOG,
    })
  }
  if (!sensevoiceReady()) {
    const missing = SENSEVOICE_FILES.filter((f) => !exists(path.join(SENSEVOICE_DIR, f.filename)))
      .map((f) => f.filename)
    throw new Error(`sensevoice missing after fetch: ${missing.join(', ')}`)
  }
  console.log(`${LOG}: sensevoice OK`)
}

async function ensureHyMt() {
  if (hyMtReady()) {
    console.log(`${LOG}: hy-mt already present`)
    return
  }
  console.log(`${LOG}: fetching hy-mt → ${LLM_DIR}`)
  await fs.promises.mkdir(LLM_DIR, { recursive: true })
  for (const spec of HY_MT_BOOTSTRAP) {
    const dest = path.join(LLM_DIR, spec.filename)
    if (exists(dest)) {
      console.log(`${LOG}: skip existing ${spec.filename}`)
      continue
    }
    await downloadFromSources(hyMtSources(spec.filename), dest, { logPrefix: LOG })
  }
  if (!hyMtReady()) {
    const missing = HY_MT_BOOTSTRAP.filter((f) => !exists(path.join(LLM_DIR, f.filename)))
      .map((f) => f.filename)
    throw new Error(`hy-mt missing after fetch: ${missing.join(', ')}`)
  }
  console.log(`${LOG}: hy-mt OK`)
}

async function main() {
  void REPO_ROOT
  console.log(`${LOG}: models root ${MODELS_DIR}`)
  await fs.promises.mkdir(LLM_DIR, { recursive: true })

  const errors = []
  for (const [name, fn] of [
    ['e5', ensureE5],
    ['rapidocr', ensureRapidOcr],
    ['sensevoice', ensureSenseVoice],
    ['hy-mt', ensureHyMt],
  ]) {
    try {
      await fn()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`${LOG}: ${name} FAILED — ${msg}`)
      errors.push(name)
    }
  }

  if (errors.length) {
    throw new Error(`incomplete model fetch: ${errors.join(', ')}`)
  }
  console.log(`${LOG}: all core models ready`)
}

main().catch((err) => {
  console.error(`${LOG}: FAILED`, err instanceof Error ? err.message : err)
  process.exit(1)
})
