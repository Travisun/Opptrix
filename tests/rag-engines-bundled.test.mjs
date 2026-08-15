/**
 * RAG engines stage：无图 Hybrid RAG（Node OCR）。
 * stage-rag-engines 只写 MANIFEST（engines=[]），不再下载 Python wheels。
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

describe('rag engines bundled paths', () => {
  /** @type {string} */
  let tmpRoot
  /** @type {string | undefined} */
  let prevEngines
  /** @type {string | undefined} */
  let prevDataDir

  before(async () => {
    lib = await import('../packages/doc-library/dist/index.js')
  })

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-rag-engines-'))
    prevEngines = process.env.OPPTRIX_RAG_ENGINES_BUNDLED_DIR
    prevDataDir = process.env.OPPTRIX_DATA_DIR
    process.env.OPPTRIX_DATA_DIR = path.join(tmpRoot, 'userdata')
  })

  afterEach(() => {
    if (prevEngines === undefined) delete process.env.OPPTRIX_RAG_ENGINES_BUNDLED_DIR
    else process.env.OPPTRIX_RAG_ENGINES_BUNDLED_DIR = prevEngines
    if (prevDataDir === undefined) delete process.env.OPPTRIX_DATA_DIR
    else process.env.OPPTRIX_DATA_DIR = prevDataDir
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('OPPTRIX_RAG_ENGINES_BUNDLED_DIR resolves getBundledEnginesRoot', () => {
    const enginesRoot = path.join(tmpRoot, 'engines')
    fs.mkdirSync(enginesRoot, { recursive: true })
    process.env.OPPTRIX_RAG_ENGINES_BUNDLED_DIR = enginesRoot

    assert.equal(lib.getBundledEnginesRoot(), path.resolve(enginesRoot))
    // No Python worker trees staged → bundled engine dirs stay null
    assert.equal(lib.getBundledEngineDir('pdfplumber-worker'), null)
    assert.equal(lib.getBundledEngineDir('rapidocr-worker'), null)
  })

  it('stage-rag-engines writes Node OCR MANIFEST without pip wheels', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'apps/desktop/scripts/stage-rag-engines.mjs'),
      'utf8',
    )
    assert.match(src, /Node OCR|Node ONNX/)
    assert.match(src, /MANIFEST\.json/)
    assert.match(src, /resources\/engines/)
    assert.match(src, /engines:\s*\[\s*\]/)
    assert.match(src, /pruneLegacyWorkers|pdfplumber-worker/)
    assert.doesNotMatch(src, /pip\s+download/)
    assert.doesNotMatch(src, /downloadWheel/)
  })

  it('prebuild and sidecar-launch inject engines', () => {
    const prebuild = fs.readFileSync(
      path.join(ROOT, 'apps/desktop/scripts/prebuild.mjs'),
      'utf8',
    )
    assert.match(prebuild, /stage-rag-engines\.mjs/)
    const sidecarLaunch = fs.readFileSync(
      path.join(ROOT, 'apps/desktop/electron/os-schedule/sidecar-launch.cjs'),
      'utf8',
    )
    assert.match(sidecarLaunch, /OPPTRIX_RAG_ENGINES_BUNDLED_DIR/)
    assert.match(sidecarLaunch, /OPPTRIX_SENSEVOICE_BUNDLED_DIR/)
    assert.match(sidecarLaunch, /OPPTRIX_PYTHON_BUNDLED_DIR/)
  })

  it('server bootstrap does not force-load E5 or embedPending at boot', () => {
    const src = fs.readFileSync(path.join(ROOT, 'apps/server/src/index.ts'), 'utf8')
    const bootIdx = src.indexOf('async function bootstrap()')
    assert.ok(bootIdx >= 0)
    const bootSlice = src.slice(bootIdx, bootIdx + 8000)
    assert.doesNotMatch(bootSlice, /tryEnableDefaultBackend\s*\(/)
    assert.doesNotMatch(bootSlice, /embedPendingDocuments\s*\(/)
    assert.match(bootSlice, /ensureBundledRagRuntime/)
  })

  it('ensureBundledRagRuntime reports disk install without tryEnable/load', async () => {
    const emptyEngines = path.join(tmpRoot, 'engines-empty')
    fs.mkdirSync(emptyEngines, { recursive: true })
    process.env.OPPTRIX_RAG_ENGINES_BUNDLED_DIR = emptyEngines

    let tryEnableCalls = 0
    const emb = new lib.EmbeddingService()
    const orig = emb.tryEnableDefaultBackend.bind(emb)
    emb.tryEnableDefaultBackend = async () => {
      tryEnableCalls += 1
      return orig()
    }
    lib.setEmbeddingServiceForTests(emb)
    try {
      const r = await lib.ensureBundledRagRuntime()
      assert.equal(tryEnableCalls, 0, 'boot must not tryEnable / load E5')
      assert.equal(r.embedding, lib.isEmbeddingModelInstalled())
      assert.equal(typeof r.layout, 'boolean')
      assert.equal(typeof r.deep, 'boolean')
      assert.equal(r.layout, false)
      assert.equal(emb.isReady(), false)
    } finally {
      lib.setEmbeddingServiceForTests(null)
      await lib.closeEmbeddingService()
    }
  })
})
