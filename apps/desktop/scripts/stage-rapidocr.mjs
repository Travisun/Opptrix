#!/usr/bin/env node
/**
 * Stage bundled RapidOCR PP-OCRv4 mobile (ONNX) for electron-builder extraResources.
 *
 * Target: apps/desktop/resources/llms/rapidocr-ppocrv4-mobile/
 * Priority: copy from ~/.opptrix/llms/… if present,
 * else legacy ~/.opptrix/models/…, else download ModelScope (apex + www, tag + master)
 * → HF mirror → Hugging Face (HF kept as last resort; prefer ModelScope retries).
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
const MODEL_ID = 'rapidocr-ppocrv4-mobile'
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
  process.env.OPPTRIX_RAPIDOCR_MODELSCOPE_REPO ?? 'RapidAI/RapidOCR',
).replace(/^\/+|\/+$/g, '')
const HF_REPO = String(
  process.env.OPPTRIX_RAPIDOCR_HF_REPO ?? 'RapidAI/RapidOCR',
).replace(/^\/+|\/+$/g, '')
const MODELSCOPE_TAG = String(
  process.env.OPPTRIX_RAPIDOCR_MODELSCOPE_TAG ?? 'v3.9.1',
).replace(/^\/+|\/+$/g, '')

const DOWNLOAD_MAX_ATTEMPTS = 3
const RETRYABLE_HTTP = new Set([502, 503, 429])

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function modelscopeBases() {
  return [...new Set([MODELSCOPE_BASE, 'https://www.modelscope.cn', 'https://modelscope.cn'])]
}

function modelscopeTags() {
  if (MODELSCOPE_TAG === 'master') return ['master']
  return [MODELSCOPE_TAG, 'master']
}

function sourcesFor(remotePath) {
  const sources = []
  for (const tag of modelscopeTags()) {
    for (const base of modelscopeBases()) {
      const host = base.includes('www.') ? 'www' : 'apex'
      const tagLabel = tag === MODELSCOPE_TAG ? tag : `fallback-${tag}`
      sources.push({
        label: `modelscope-${host}-${tagLabel}`,
        url: `${base}/models/${MODELSCOPE_REPO}/resolve/${tag}/${remotePath}`,
      })
    }
  }
  // HF / hf-mirror: last resort only (paths often 404 / 401); do not rely on them.
  sources.push(
    {
      label: 'hf-mirror',
      url: `${HF_MIRROR}/${HF_REPO}/resolve/main/${remotePath}?download=true`,
    },
    {
      label: 'huggingface',
      url: `https://huggingface.co/${HF_REPO}/resolve/main/${remotePath}?download=true`,
    },
  )
  return sources
}

function isRetryableFailure(err, status) {
  if (typeof status === 'number' && RETRYABLE_HTTP.has(status)) return true
  const message = err instanceof Error ? err.message : String(err)
  if (/^HTTP (502|503|429)\b/.test(message)) return true
  if (/fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|socket|network/i.test(message)) {
    return true
  }
  const cause = err instanceof Error ? err.cause : null
  if (cause && typeof cause === 'object' && 'code' in cause) {
    const code = String(/** @type {{ code?: unknown }} */ (cause).code ?? '')
    if (/ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|UND_ERR/i.test(code)) return true
  }
  return false
}

async function downloadToFile(url, destPath) {
  let lastErr = /** @type {unknown} */ (null)
  for (let attempt = 1; attempt <= DOWNLOAD_MAX_ATTEMPTS; attempt++) {
    try {
      console.log(`stage-rapidocr: download attempt ${attempt}/${DOWNLOAD_MAX_ATTEMPTS}`)
      const resp = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'Opptrix-Desktop/1.0' },
      })
      if (!resp.ok) {
        const err = new Error(`HTTP ${resp.status}`)
        if (attempt < DOWNLOAD_MAX_ATTEMPTS && isRetryableFailure(err, resp.status)) {
          const backoffMs = 500 * 2 ** (attempt - 1)
          console.log(
            `stage-rapidocr: HTTP ${resp.status} on attempt ${attempt}/${DOWNLOAD_MAX_ATTEMPTS}, retry in ${backoffMs}ms`,
          )
          await sleep(backoffMs)
          lastErr = err
          continue
        }
        throw err
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
      return
    } catch (err) {
      lastErr = err
      const message = err instanceof Error ? err.message : String(err)
      if (attempt < DOWNLOAD_MAX_ATTEMPTS && isRetryableFailure(err)) {
        const backoffMs = 500 * 2 ** (attempt - 1)
        console.log(
          `stage-rapidocr: attempt ${attempt}/${DOWNLOAD_MAX_ATTEMPTS} failed (${message}), retry in ${backoffMs}ms`,
        )
        await sleep(backoffMs)
        continue
      }
      throw err
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}

async function downloadFileFromSources(remotePath, dest) {
  const errors = []
  for (const source of sourcesFor(remotePath)) {
    try {
      console.log(`stage-rapidocr: downloading ${path.basename(dest)} (${source.label}) …`)
      await downloadToFile(source.url, dest)
      console.log(`stage-rapidocr: saved ${path.basename(dest)}`)
      return
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      errors.push(`${source.label}: ${message}`)
    }
  }
  throw new Error(`无法下载 ${path.basename(dest)}（${errors.join('; ')}）`)
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

  await downloadFileFromSources(entry.remote, dest)
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
