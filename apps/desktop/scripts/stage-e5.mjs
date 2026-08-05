#!/usr/bin/env node
/**
 * Stage bundled multilingual-e5-small (ONNX) for electron-builder extraResources.
 *
 * Target: apps/desktop/resources/llms/multilingual-e5-small/
 * Files: Xenova layout (config / tokenizer / onnx/model_quantized.onnx)
 *
 * Priority: copy from ~/.opptrix/llms/multilingual-e5-small if present,
 * else legacy ~/.opptrix/models/…, else download ModelScope → HF mirror → Hugging Face.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { createWriteStream } from 'node:fs'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DESKTOP_ROOT = path.resolve(__dirname, '..')
const MODEL_ID = 'multilingual-e5-small'
const TARGET_DIR = path.join(DESKTOP_ROOT, 'resources/llms', MODEL_ID)
const USER_LLM_DIR = path.join(os.homedir(), '.opptrix/llms', MODEL_ID)
const LEGACY_USER_MODEL_DIR = path.join(os.homedir(), '.opptrix/models', MODEL_ID)

const MODELSCOPE_BASE = String(
  process.env.OPPTRIX_MODELSCOPE_BASE ?? 'https://modelscope.cn',
).replace(/\/$/, '')
const HF_MIRROR = String(
  process.env.OPPTRIX_HF_MIRROR ?? 'https://hf-mirror.com',
).replace(/\/$/, '')
const MODELSCOPE_REPO = String(
  process.env.OPPTRIX_E5_MODELSCOPE_REPO ?? 'Xenova/multilingual-e5-small',
).replace(/^\/+|\/+$/g, '')
const HF_REPO = String(
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
  return [
    {
      label: 'modelscope',
      url: `${MODELSCOPE_BASE}/models/${MODELSCOPE_REPO}/resolve/master/${filename}`,
    },
    {
      label: 'hf-mirror',
      url: `${HF_MIRROR}/${HF_REPO}/resolve/main/${filename}?download=true`,
    },
    {
      label: 'huggingface',
      url: `https://huggingface.co/${HF_REPO}/resolve/main/${filename}?download=true`,
    },
  ]
}

async function downloadToFile(url, destPath) {
  const resp = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'Opptrix-Desktop/1.0' },
  })
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`)
  }
  if (!resp.body) {
    throw new Error('empty body')
  }

  await fs.promises.mkdir(path.dirname(destPath), { recursive: true })
  const tempPath = `${destPath}.download`
  try {
    const nodeStream = Readable.fromWeb(resp.body)
    await pipeline(nodeStream, createWriteStream(tempPath))
    await fs.promises.rename(tempPath, destPath)
  } catch (err) {
    try {
      await fs.promises.unlink(tempPath)
    } catch {
      /* ignore */
    }
    throw err
  }
}

async function downloadFileFromSources(filename, dest) {
  const errors = []
  for (const source of sourcesFor(filename)) {
    try {
      console.log(`stage-e5: downloading ${filename} (${source.label}) …`)
      await downloadToFile(source.url, dest)
      console.log(`stage-e5: saved ${filename}`)
      return
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      errors.push(`${source.label}: ${message}`)
    }
  }
  throw new Error(`无法下载 ${filename}（${errors.join('; ')}）`)
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
    await downloadFileFromSources(filename, dest)
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
