/**
 * e5 embedding：bundled 路径优先于用户目录；可用 OPPTRIX_E5_BUNDLED_DIR mock。
 */
import { describe, it, before, after, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** @type {typeof import('../packages/doc-library/dist/index.js')} */
let lib

const REQUIRED = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/model_quantized.onnx',
]

function seedModelDir(dir) {
  fs.mkdirSync(path.join(dir, 'onnx'), { recursive: true })
  for (const file of REQUIRED) {
    const p = path.join(dir, file)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, file.endsWith('.onnx') ? Buffer.from([1, 2, 3, 4]) : '{}')
  }
}

describe('e5 bundled path resolution', () => {
  /** @type {string} */
  let tmpRoot
  /** @type {string | undefined} */
  let prevBundled
  /** @type {string | undefined} */
  let prevDataDir

  before(async () => {
    lib = await import('../packages/doc-library/dist/index.js')
  })

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-e5-bundled-'))
    prevBundled = process.env.OPPTRIX_E5_BUNDLED_DIR
    prevDataDir = process.env.OPPTRIX_DATA_DIR
    process.env.OPPTRIX_DATA_DIR = path.join(tmpRoot, 'userdata')
  })

  afterEach(() => {
    if (prevBundled === undefined) delete process.env.OPPTRIX_E5_BUNDLED_DIR
    else process.env.OPPTRIX_E5_BUNDLED_DIR = prevBundled
    if (prevDataDir === undefined) delete process.env.OPPTRIX_DATA_DIR
    else process.env.OPPTRIX_DATA_DIR = prevDataDir
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  after(() => {
    /* no-op */
  })

  it('OPPTRIX_E5_BUNDLED_DIR makes installed=true with source=bundled', () => {
    const bundled = path.join(tmpRoot, 'bundled', 'multilingual-e5-small')
    seedModelDir(bundled)
    process.env.OPPTRIX_E5_BUNDLED_DIR = bundled

    assert.equal(lib.getBundledEmbeddingModelDir(), path.resolve(bundled))
    const dirs = lib.listEmbeddingModelSearchDirs()
    assert.equal(dirs[0], path.resolve(bundled))
    assert.ok(dirs.includes(lib.embeddingModelDir()))
    assert.match(lib.embeddingModelDir(), /[/\\]llms[/\\]multilingual-e5-small$/)
    assert.ok(
      dirs.includes(
        path.resolve(path.join(lib.legacyEmbeddingModelsRoot(), 'multilingual-e5-small')),
      ),
    )

    const status = lib.getEmbeddingModelStatus()
    assert.equal(status.installed, true)
    assert.equal(status.source, 'bundled')
    assert.equal(path.resolve(status.dir), path.resolve(bundled))
    assert.equal(lib.isEmbeddingModelInstalled(), true)

    const ui = lib.getSemanticModelStatus()
    assert.equal(ui.installed, true)
    assert.equal(ui.source, 'bundled')
  })

  it('falls back to user dir when bundled missing', () => {
    delete process.env.OPPTRIX_E5_BUNDLED_DIR
    const staged = path.join(ROOT, 'apps/desktop/resources/llms/multilingual-e5-small')
    if (fs.existsSync(path.join(staged, 'config.json'))) return

    const prevCwd = process.cwd()
    process.chdir(tmpRoot)
    try {
      assert.equal(lib.getBundledEmbeddingModelDir(), null)
      const userDir = lib.embeddingModelDir()
      seedModelDir(userDir)

      const status = lib.getEmbeddingModelStatus()
      assert.equal(status.installed, true)
      assert.equal(status.source, 'user')
      assert.equal(path.resolve(status.dir), path.resolve(userDir))
    } finally {
      process.chdir(prevCwd)
    }
  })

  it('resolves staged desktop llms without relying on cwd', () => {
    const staged = path.join(ROOT, 'apps/desktop/resources/llms/multilingual-e5-small')
    if (!fs.existsSync(path.join(staged, 'config.json'))) return

    delete process.env.OPPTRIX_E5_BUNDLED_DIR
    const prevCwd = process.cwd()
    process.chdir(tmpRoot)
    try {
      const dir = lib.getBundledEmbeddingModelDir()
      assert.ok(dir)
      assert.equal(path.resolve(dir), path.resolve(staged))
    } finally {
      process.chdir(prevCwd)
    }
  })

  it('falls back to legacy ~/.opptrix/models when llms missing', () => {
    delete process.env.OPPTRIX_E5_BUNDLED_DIR
    const staged = path.join(ROOT, 'apps/desktop/resources/llms/multilingual-e5-small')
    if (fs.existsSync(path.join(staged, 'config.json'))) return

    const prevCwd = process.cwd()
    process.chdir(tmpRoot)
    try {
      const legacyDir = path.join(lib.legacyEmbeddingModelsRoot(), 'multilingual-e5-small')
      seedModelDir(legacyDir)
      const resolved = lib.resolveEmbeddingModelDir()
      assert.equal(resolved.source, 'user')
      assert.equal(path.resolve(resolved.dir), path.resolve(legacyDir))
    } finally {
      process.chdir(prevCwd)
    }
  })

  it('removeEmbeddingModel only clears user copy; bundled remains installed', async () => {
    const bundled = path.join(tmpRoot, 'bundled', 'multilingual-e5-small')
    seedModelDir(bundled)
    process.env.OPPTRIX_E5_BUNDLED_DIR = bundled

    const userDir = lib.embeddingModelDir()
    seedModelDir(userDir)
    assert.ok(fs.existsSync(path.join(userDir, 'config.json')))

    await lib.removeEmbeddingModel()
    assert.equal(fs.existsSync(userDir), false)
    assert.ok(fs.existsSync(path.join(bundled, 'config.json')))

    const status = lib.getEmbeddingModelStatus()
    assert.equal(status.installed, true)
    assert.equal(status.source, 'bundled')
  })

  it('prefers bundled over user when both present', () => {
    const bundled = path.join(tmpRoot, 'bundled', 'multilingual-e5-small')
    seedModelDir(bundled)
    process.env.OPPTRIX_E5_BUNDLED_DIR = bundled
    seedModelDir(lib.embeddingModelDir())

    const resolved = lib.resolveEmbeddingModelDir()
    assert.equal(resolved.source, 'bundled')
    assert.equal(path.resolve(resolved.dir), path.resolve(bundled))
  })

  it('stage-e5 script exists and lists required files', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'apps/desktop/scripts/stage-e5.mjs'),
      'utf8',
    )
    assert.match(src, /model_quantized\.onnx/)
    assert.match(src, /multilingual-e5-small/)
    assert.match(src, /MODELSCOPE/)
    assert.match(src, /resources\/llms/)
  })
})
