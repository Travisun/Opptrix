#!/usr/bin/env node
/**
 * Stage bundled multilingual-e5-small (ONNX) for electron-builder extraResources.
 *
 * Target: apps/desktop/resources/llms/multilingual-e5-small/
 * Files: Xenova layout (config / tokenizer / onnx/model_quantized.onnx)
 *
 * Priority: copy from ~/.opptrix/llms/… if present, else legacy ~/.opptrix/models/…,
 * else download (CI: Hugging Face first → ModelScope; local: ModelScope first → HF).
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  downloadFromSources,
  modelscopeBases,
  HF_MIRROR,
} from './lib/model-download.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DESKTOP_ROOT = path.resolve(__dirname, '..')
const MODEL_ID = 'multilingual-e5-small'
const TARGET_DIR = path.join(DESKTOP_ROOT, 'resources/llms', MODEL_ID)
const USER_LLM_DIR = path.join(os.homedir(), '.opptrix/llms', MODEL_ID)
const LEGACY_USER_MODEL_DIR = path.join(os.homedir(), '.opptrix/models', MODEL_ID)

const MODELSCOPE_REPO = String(
  process.env.OPPTRIX_E5_MODELSCOPE_REPO ?? 'Xenova/multilingual-e5-small',
).replace(/^\/+|\/+$/g, '')
const HF_REPO = String(
  // Runtime needs Xenova layout incl. onnx/model_quantized.onnx (~118MB).
  // Do not switch to nilay-sam-23/multilingual-e5-small-onnx — it only ships
  // full onnx/model.onnx (~470MB) and breaks E5_MODEL_FILES checks.
  process.env.OPPTRIX_E5_HF_REPO ?? 'Xenova/multilingual-e5-small',
).replace(/^\/+|\/+$/g, '')

/** Align with packages/doc-library E5_MODEL_FILES */
const STAGE_FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'special_tokens_map.json',
  'onnx/model_quantized.onnx',
]

const OPTIONAL_FILES = new Set(['special_tokens_map.json'])
const REQUIRED_FILES = STAGE_FILES.filter((f) => !OPTIONAL_FILES.has(f))

function sourcesFor(filename) {
  /** @type {import('./lib/model-download.mjs').DownloadSource[]} */
  const sources = []
  for (const base of modelscopeBases()) {
    const host = base.includes('www.') ? 'www' : 'apex'
    sources.push({
      kind: 'modelscope',
      label: `modelscope-${host}`,
      url: `${base}/models/${MODELSCOPE_REPO}/resolve/master/${filename}`,
    })
  }
  sources.push(
    {
      kind: 'huggingface',
      label: 'huggingface',
      url: `https://huggingface.co/${HF_REPO}/resolve/main/${filename}?download=true`,
    },
    {
      kind: 'huggingface',
      label: 'hf-mirror',
      url: `${HF_MIRROR}/${HF_REPO}/resolve/main/${filename}?download=true`,
    },
  )
  return sources
}

function findUserCopy(filename) {
  for (const root of [USER_LLM_DIR, LEGACY_USER_MODEL_DIR]) {
    const candidate = path.join(root, filename)
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

async function stageFile(filename) {
  const dest = path.join(TARGET_DIR, filename)
  if (fs.existsSync(dest)) {
    console.log(`stage-e5: skip existing ${filename}`)
    return
  }

  const userCopy = findUserCopy(filename)
  if (userCopy) {
    await fs.promises.mkdir(path.dirname(dest), { recursive: true })
    await fs.promises.copyFile(userCopy, dest)
    console.log(`stage-e5: copied ${filename} from user llms/models`)
    return
  }

  try {
    await downloadFromSources(sourcesFor(filename), dest, { logPrefix: 'stage-e5' })
  } catch (err) {
    if (OPTIONAL_FILES.has(filename)) {
      console.log(`stage-e5: optional ${filename} skipped`)
      return
    }
    throw err
  }
}

async function main() {
  console.log('stage-e5: start')
  await fs.promises.mkdir(TARGET_DIR, { recursive: true })

  for (const file of STAGE_FILES) {
    await stageFile(file)
  }

  const missing = []
  for (const file of REQUIRED_FILES) {
    if (!fs.existsSync(path.join(TARGET_DIR, file))) missing.push(file)
  }
  if (missing.length) {
    throw new Error(`stage-e5: missing after staging: ${missing.join(', ')}`)
  }

  console.log('stage-e5: OK')
}

main().catch((err) => {
  console.error('stage-e5: FAILED', err instanceof Error ? err.message : err)
  process.exit(1)
})
