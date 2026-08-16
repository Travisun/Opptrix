#!/usr/bin/env node
/**
 * Stage bundled RapidOCR PP-OCRv4 mobile (ONNX) for electron-builder extraResources.
 *
 * Target: apps/desktop/resources/llms/rapidocr-ppocrv4-mobile/
 * Priority: copy from ~/.opptrix/llms/… if present, else legacy ~/.opptrix/models/…,
 * else download from ModelScope (only reliable public source for these paths).
 * Optional OPPTRIX_RAPIDOCR_DIRECT_URL_PREFIX for a stable foreign/R2 mirror.
 * Hugging Face RapidAI/RapidOCR paths are not used (404 / unavailable).
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  downloadFromSources,
  modelscopeBases,
} from './lib/model-download.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DESKTOP_ROOT = path.resolve(__dirname, '..')
const MODEL_ID = 'rapidocr-ppocrv4-mobile'
const TARGET_DIR = path.join(DESKTOP_ROOT, 'resources/llms', MODEL_ID)
const USER_LLM_DIR = path.join(os.homedir(), '.opptrix/llms', MODEL_ID)
const LEGACY_USER_MODEL_DIR = path.join(os.homedir(), '.opptrix/models', MODEL_ID)

const MODELSCOPE_REPO = String(
  process.env.OPPTRIX_RAPIDOCR_MODELSCOPE_REPO ?? 'RapidAI/RapidOCR',
).replace(/^\/+|\/+$/g, '')
const MODELSCOPE_TAG = String(
  process.env.OPPTRIX_RAPIDOCR_MODELSCOPE_TAG ?? 'v3.9.1',
).replace(/^\/+|\/+$/g, '')
const DIRECT_PREFIX = String(process.env.OPPTRIX_RAPIDOCR_DIRECT_URL_PREFIX ?? '')
  .trim()
  .replace(/\/$/, '')

/** Flat local names → upstream relative paths */
const STAGE_FILES = [
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

function modelscopeTags() {
  if (MODELSCOPE_TAG === 'master') return ['master']
  return [MODELSCOPE_TAG, 'master']
}

function sourcesFor(remotePath) {
  /** @type {import('./lib/model-download.mjs').DownloadSource[]} */
  const sources = []

  if (DIRECT_PREFIX) {
    sources.push({
      kind: 'direct',
      label: 'direct-r2',
      url: `${DIRECT_PREFIX}/${remotePath}`,
    })
  }

  for (const tag of modelscopeTags()) {
    for (const base of modelscopeBases()) {
      const host = base.includes('www.') ? 'www' : 'apex'
      const tagLabel = tag === MODELSCOPE_TAG ? tag : `fallback-${tag}`
      sources.push({
        kind: 'modelscope',
        label: `modelscope-${host}-${tagLabel}`,
        url: `${base}/models/${MODELSCOPE_REPO}/resolve/${tag}/${remotePath}`,
      })
    }
  }

  return sources
}

function findUserCopy(localName) {
  for (const root of [USER_LLM_DIR, LEGACY_USER_MODEL_DIR]) {
    const candidate = path.join(root, localName)
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

async function stageFile(entry) {
  const dest = path.join(TARGET_DIR, entry.local)
  if (fs.existsSync(dest)) {
    console.log(`stage-rapidocr: skip existing ${entry.local}`)
    return
  }

  const userCopy = findUserCopy(entry.local)
  if (userCopy) {
    await fs.promises.mkdir(path.dirname(dest), { recursive: true })
    await fs.promises.copyFile(userCopy, dest)
    console.log(`stage-rapidocr: copied ${entry.local} from user llms/models`)
    return
  }

  await downloadFromSources(sourcesFor(entry.remote), dest, {
    logPrefix: 'stage-rapidocr',
  })
}

async function main() {
  console.log('stage-rapidocr: start')
  await fs.promises.mkdir(TARGET_DIR, { recursive: true })

  for (const file of STAGE_FILES) {
    await stageFile(file)
  }

  const missing = []
  for (const file of STAGE_FILES) {
    if (!fs.existsSync(path.join(TARGET_DIR, file.local))) missing.push(file.local)
  }
  if (missing.length) {
    throw new Error(`stage-rapidocr: missing after staging: ${missing.join(', ')}`)
  }

  console.log('stage-rapidocr: OK')
}

main().catch((err) => {
  console.error('stage-rapidocr: FAILED', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
