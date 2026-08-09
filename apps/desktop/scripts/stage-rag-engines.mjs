#!/usr/bin/env node
/**
 * Stage bundled RAG assets for electron-builder extraResources.
 *
 * Historically staged Python pdfplumber/rapidocr wheels. OCR 现已改为 Node ONNX
 *（模型在 resources/llms/rapidocr-ppocrv4-mobile/，由 stage-rapidocr / 打包流程处理），
 * 本脚本不再下载 pdfplumber / rapidocr Python wheels。
 *
 * 仍写出平台 MANIFEST，供审计与旧路径探测兼容；并清理历史 worker/wheels 残留。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeArch, resolveRuntimeTarget } from './lib/runtime-target.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DESKTOP_ROOT = path.resolve(__dirname, '..')

/** Align with stage-runtime: OPPTRIX_RUNTIME_* wins unless RAG-specific override is set. */
const runtimeTarget = resolveRuntimeTarget()
const PLATFORM =
  process.env.OPPTRIX_RAG_ENGINES_PLATFORM?.trim()
  || runtimeTarget.platform
const ARCH = normalizeArch(
  process.env.OPPTRIX_RAG_ENGINES_ARCH?.trim()
  || runtimeTarget.arch,
)
const PLATFORM_KEY = `${PLATFORM}-${ARCH}`

/** Legacy Python sidecar dirs / names to remove from the platform stage root. */
const LEGACY_WORKER_DIR_NAMES = new Set(['pdfplumber-worker', 'rapidocr-worker', 'wheels'])

function pruneLegacyWorkers(targetRoot) {
  if (!fs.existsSync(targetRoot)) return
  for (const name of fs.readdirSync(targetRoot)) {
    const full = path.join(targetRoot, name)
    let st
    try {
      st = fs.statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory() && LEGACY_WORKER_DIR_NAMES.has(name)) {
      fs.rmSync(full, { recursive: true, force: true })
      console.log(`stage-rag-engines: removed legacy ${name}/`)
      continue
    }
    if (st.isFile() && (/\.(whl|tar\.gz)$/i.test(name) || name === 'worker.py')) {
      fs.rmSync(full, { force: true })
      console.log(`stage-rag-engines: removed legacy ${name}`)
    }
  }
}

function main() {
  console.log(`stage-rag-engines: start (${PLATFORM_KEY}) — Node OCR; skip Python workers`)

  const targetRoot = path.join(DESKTOP_ROOT, 'resources/engines', PLATFORM_KEY)
  fs.mkdirSync(targetRoot, { recursive: true })
  pruneLegacyWorkers(targetRoot)

  const manifestPath = path.join(targetRoot, 'MANIFEST.json')
  const manifest = {
    platform: PLATFORM,
    arch: ARCH,
    platformKey: PLATFORM_KEY,
    engines: [],
    note: 'OCR uses Node ONNX + llms/rapidocr-ppocrv4-mobile; Python pdfplumber/rapidocr staging removed',
    stagedAt: new Date().toISOString(),
  }
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

  console.log('stage-rag-engines: OK')
}

main()
