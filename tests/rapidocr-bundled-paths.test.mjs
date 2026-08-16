/**
 * RapidOCR：bundled 路径优先；OPPTRIX_RAPIDOCR_BUNDLED_DIR mock；stage 脚本存在。
 */
import { describe, it, before, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** @type {typeof import('../packages/doc-library/dist/index.js')} */
let lib

const REQUIRED = [
  'ch_PP-OCRv4_det_mobile.onnx',
  'ch_PP-OCRv4_rec_mobile.onnx',
  'ch_ppocr_mobile_v2.0_cls_mobile.onnx',
  'ppocr_keys_v1.txt',
]

function seedModelDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
  for (const file of REQUIRED) {
    fs.writeFileSync(
      path.join(dir, file),
      file.endsWith('.onnx') ? Buffer.from([1, 2, 3, 4]) : 'keys\n',
    )
  }
}

describe('rapidocr bundled path resolution', () => {
  /** @type {string} */
  let tmpRoot
  /** @type {string | undefined} */
  let prevBundled
  /** @type {string | undefined} */
  let prevModelDir
  /** @type {string | undefined} */
  let prevDataDir

  before(async () => {
    lib = await import('../packages/doc-library/dist/index.js')
  })

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-rapidocr-bundled-'))
    prevBundled = process.env.OPPTRIX_RAPIDOCR_BUNDLED_DIR
    prevModelDir = process.env.OPPTRIX_RAPIDOCR_MODEL_DIR
    prevDataDir = process.env.OPPTRIX_DATA_DIR
    process.env.OPPTRIX_DATA_DIR = path.join(tmpRoot, 'userdata')
    delete process.env.OPPTRIX_RAPIDOCR_MODEL_DIR
  })

  afterEach(() => {
    if (prevBundled === undefined) delete process.env.OPPTRIX_RAPIDOCR_BUNDLED_DIR
    else process.env.OPPTRIX_RAPIDOCR_BUNDLED_DIR = prevBundled
    if (prevModelDir === undefined) delete process.env.OPPTRIX_RAPIDOCR_MODEL_DIR
    else process.env.OPPTRIX_RAPIDOCR_MODEL_DIR = prevModelDir
    if (prevDataDir === undefined) delete process.env.OPPTRIX_DATA_DIR
    else process.env.OPPTRIX_DATA_DIR = prevDataDir
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('OPPTRIX_RAPIDOCR_BUNDLED_DIR resolves source=bundled when models present', () => {
    const bundled = path.join(tmpRoot, 'bundled', 'rapidocr-ppocrv4-mobile')
    seedModelDir(bundled)
    process.env.OPPTRIX_RAPIDOCR_BUNDLED_DIR = bundled

    assert.equal(lib.getBundledRapidOcrModelDir(), path.resolve(bundled))
    const dirs = lib.listRapidOcrModelSearchDirs()
    assert.equal(dirs[0], path.resolve(bundled))
    assert.ok(dirs.includes(lib.rapidocrUserModelDir()))
    assert.match(lib.rapidocrUserModelDir(), /[/\\]llms[/\\]rapidocr-ppocrv4-mobile$/)
    assert.ok(
      dirs.includes(
        path.resolve(path.join(lib.legacyEmbeddingModelsRoot(), 'rapidocr-ppocrv4-mobile')),
      ),
    )

    const resolved = lib.resolveRapidOcrModelDir()
    assert.equal(resolved.source, 'bundled')
    assert.equal(path.resolve(resolved.dir), path.resolve(bundled))
    assert.equal(resolved.missingFiles.length, 0)
  })

  it('falls back to user dir when bundled missing', () => {
    delete process.env.OPPTRIX_RAPIDOCR_BUNDLED_DIR
    const staged = path.join(ROOT, 'apps/desktop/resources/llms/rapidocr-ppocrv4-mobile')
    if (fs.existsSync(path.join(staged, 'ch_PP-OCRv4_det_mobile.onnx'))) return

    const prevCwd = process.cwd()
    process.chdir(tmpRoot)
    try {
      assert.equal(lib.getBundledRapidOcrModelDir(), null)
      const userDir = lib.rapidocrUserModelDir()
      seedModelDir(userDir)
      const resolved = lib.resolveRapidOcrModelDir()
      assert.equal(resolved.source, 'user')
      assert.equal(path.resolve(resolved.dir), path.resolve(userDir))
    } finally {
      process.chdir(prevCwd)
    }
  })

  it('resolves staged desktop llms without relying on cwd', () => {
    const staged = path.join(ROOT, 'apps/desktop/resources/llms/rapidocr-ppocrv4-mobile')
    if (!fs.existsSync(path.join(staged, 'ch_PP-OCRv4_det_mobile.onnx'))) return

    delete process.env.OPPTRIX_RAPIDOCR_BUNDLED_DIR
    const prevCwd = process.cwd()
    process.chdir(tmpRoot)
    try {
      const dir = lib.getBundledRapidOcrModelDir()
      assert.ok(dir)
      assert.equal(path.resolve(dir), path.resolve(staged))
    } finally {
      process.chdir(prevCwd)
    }
  })

  it('falls back to legacy ~/.opptrix/models when llms missing', () => {
    delete process.env.OPPTRIX_RAPIDOCR_BUNDLED_DIR
    const staged = path.join(ROOT, 'apps/desktop/resources/llms/rapidocr-ppocrv4-mobile')
    if (fs.existsSync(path.join(staged, 'ch_PP-OCRv4_det_mobile.onnx'))) return

    const prevCwd = process.cwd()
    process.chdir(tmpRoot)
    try {
      const legacyDir = path.join(lib.legacyEmbeddingModelsRoot(), 'rapidocr-ppocrv4-mobile')
      seedModelDir(legacyDir)
      const resolved = lib.resolveRapidOcrModelDir()
      assert.equal(resolved.source, 'user')
      assert.equal(path.resolve(resolved.dir), path.resolve(legacyDir))
    } finally {
      process.chdir(prevCwd)
    }
  })

  it('available when ONNX models present (Node OCR, no Python READY)', () => {
    const bundled = path.join(tmpRoot, 'bundled', 'rapidocr-ppocrv4-mobile')
    seedModelDir(bundled)
    process.env.OPPTRIX_RAPIDOCR_BUNDLED_DIR = bundled

    const status = lib.getRapidOcrStatus()
    assert.equal(status.available, true)
    assert.equal(status.source, 'bundled')

    const ui = lib.getParseEnginesStatus()
    assert.equal(ui.deep.available, true)
    assert.equal(ui.deep.source, 'bundled')
  })

  it('stage-rapidocr script exists and lists required files', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'apps/desktop/scripts/stage-rapidocr.mjs'),
      'utf8',
    )
    const downloadLib = fs.readFileSync(
      path.join(ROOT, 'apps/desktop/scripts/lib/model-download.mjs'),
      'utf8',
    )
    assert.match(src, /ch_PP-OCRv4_det_mobile\.onnx/)
    assert.match(src, /rapidocr-ppocrv4-mobile/)
    assert.match(src, /RapidAI\/RapidOCR/)
    assert.match(src, /modelscope/)
    assert.match(src, /resources\/llms/)
    assert.match(src, /downloadFromSources/)
    assert.match(src, /modelscopeBases/)
    assert.doesNotMatch(src, /huggingface\.co\/\$\{HF_REPO\}/)
    assert.match(downloadLib, /RETRYABLE_HTTP/)
    assert.match(downloadLib, /download attempt/)
    assert.match(downloadLib, /www\.modelscope\.cn/)
  })
})
