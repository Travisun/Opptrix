#!/usr/bin/env node
/**
 * Stage bundled SenseVoice GGUF models for electron-builder extraResources.
 *
 * Target: apps/desktop/resources/sensevoice/
 * Files: sensevoice-small-q8.gguf, fsmn-vad.gguf
 *
 * Priority: copy from ~/.opptrix/sensevoice/models if present, else download
 * (CI: Hugging Face first → ModelScope; local: ModelScope first → HF).
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
const TARGET_DIR = path.join(DESKTOP_ROOT, 'resources/sensevoice')
const USER_MODELS_DIR = path.join(os.homedir(), '.opptrix/sensevoice/models')

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

function sourcesFor(repo, filename) {
  /** @type {import('./lib/model-download.mjs').DownloadSource[]} */
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

  await downloadFromSources(sourcesFor(repo, filename), dest, {
    logPrefix: 'stage-sensevoice',
  })
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
