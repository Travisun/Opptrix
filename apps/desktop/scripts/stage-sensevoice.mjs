#!/usr/bin/env node
/**
 * Stage bundled SenseVoice GGUF models for electron-builder extraResources.
 *
 * Target: apps/desktop/resources/sensevoice/
 * Files: sensevoice-small-q8.gguf, fsmn-vad.gguf
 *
 * Priority: copy from ~/.opptrix/sensevoice/models if present, else download from ModelScope.
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
const TARGET_DIR = path.join(DESKTOP_ROOT, 'resources/sensevoice')
const USER_MODELS_DIR = path.join(os.homedir(), '.opptrix/sensevoice/models')

const MODELSCOPE_BASE = String(
  process.env.OPPTRIX_MODELSCOPE_BASE ?? 'https://modelscope.cn',
).replace(/\/$/, '')

const STAGE_FILES = [
  {
    filename: 'sensevoice-small-q8.gguf',
    repo: 'FunAudioLLM/SenseVoiceSmall-GGUF',
  },
  {
    filename: 'fsmn-vad.gguf',
    repo: 'FunAudioLLM/fsmn-vad-GGUF',
  },
] 

function buildModelScopeUrl(repo, filename) {
  return `${MODELSCOPE_BASE}/models/${repo}/resolve/master/${filename}`
}

async function downloadToFile(url, destPath) {
  const resp = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'Opptrix-Desktop/1.0' },
  })
  if (!resp.ok) {
    throw new Error(`下载失败 HTTP ${resp.status}: ${url}`)
  }
  if (!resp.body) {
    throw new Error(`下载失败：无响应体 ${url}`)
  }

  await fs.promises.mkdir(path.dirname(destPath), { recursive: true })
  const tempPath = `${destPath}.download`
  const nodeStream = Readable.fromWeb(resp.body)
  await pipeline(nodeStream, createWriteStream(tempPath))
  await fs.promises.rename(tempPath, destPath)
}

async function stageFile({ filename, repo }) {
  const dest = path.join(TARGET_DIR, filename)
  if (fs.existsSync(dest)) {
    console.log(`stage-sensevoice: skip existing ${filename}`)
    return
  }

  const userCopy = path.join(USER_MODELS_DIR, filename)
  if (fs.existsSync(userCopy)) {
    await fs.promises.mkdir(TARGET_DIR, { recursive: true })
    await fs.promises.copyFile(userCopy, dest)
    console.log(`stage-sensevoice: copied ${filename} from ${USER_MODELS_DIR}`)
    return
  }

  const url = buildModelScopeUrl(repo, filename)
  console.log(`stage-sensevoice: downloading ${filename} …`)
  await downloadToFile(url, dest)
  console.log(`stage-sensevoice: saved ${filename}`)
}

async function main() {
  console.log('stage-sensevoice: start')
  await fs.promises.mkdir(TARGET_DIR, { recursive: true })

  for (const spec of STAGE_FILES) {
    await stageFile(spec)
  }

  for (const spec of STAGE_FILES) {
    const dest = path.join(TARGET_DIR, spec.filename)
    if (!fs.existsSync(dest)) {
      throw new Error(`stage-sensevoice: missing ${spec.filename} after staging`)
    }
  }

  console.log('stage-sensevoice: OK')
}

main().catch((err) => {
  console.error('stage-sensevoice: FAILED', err instanceof Error ? err.message : err)
  process.exit(1)
})
