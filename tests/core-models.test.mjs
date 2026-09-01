import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '..')

async function importCoreModels() {
  return import(path.join(repoRoot, 'scripts/lib/core-models.mjs'))
}

describe('core models catalog', () => {
  /** @type {string | undefined} */
  let tmpDir
  /** @type {string | undefined} */
  let prevModelsDir

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-core-models-'))
    prevModelsDir = process.env.OPPTRIX_MODELS_DIR
    process.env.OPPTRIX_MODELS_DIR = tmpDir
    delete process.env.OPPTRIX_FORCE_MODEL_FETCH
  })

  afterEach(() => {
    if (prevModelsDir === undefined) delete process.env.OPPTRIX_MODELS_DIR
    else process.env.OPPTRIX_MODELS_DIR = prevModelsDir
    if (tmpDir) {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
    }
  })

  it('isGgufBuffer accepts GGUF magic', async () => {
    const mod = await importCoreModels()
    const buf = Buffer.concat([mod.GGUF_MAGIC, Buffer.alloc(32)])
    assert.equal(mod.isGgufBuffer(buf), true)
    assert.equal(mod.isGgufBuffer(Buffer.from('NOTG')), false)
  })

  it('mapImportDest maps internal ids to canonical layout', async () => {
    const mod = await importCoreModels()
    const dirs = mod.resolveCoreModelPaths(tmpDir)
    assert.equal(
      mod.mapImportDest('core.hy-mt-q4', 'HY-MT1.5-1.8B-Q4_K_M.gguf', tmpDir),
      dirs.hyMtPath,
    )
    assert.equal(
      mod.mapImportDest('core.sensevoice-small-q8', 'fsmn-vad.gguf', tmpDir),
      path.join(dirs.sensevoiceDir, 'fsmn-vad.gguf'),
    )
    assert.equal(
      mod.mapImportDest('core.e5-multilingual-small', 'model_quantized.onnx', tmpDir),
      path.join(dirs.e5Dir, 'onnx/model_quantized.onnx'),
    )
    assert.match(
      mod.mapImportDest('core.rapidocr-ppocrv4-mobile', 'ch_PP-OCRv4_det_mobile.onnx', tmpDir),
      /rapidocr-ppocrv4-mobile[/\\]ch_PP-OCRv4_det_mobile\.onnx$/,
    )
  })

  it('allReady false on empty temp dir', async () => {
    const mod = await importCoreModels()
    assert.equal(mod.areAllCoreModelsReady(tmpDir), false)
    const status = mod.buildCoreModelsStatus(tmpDir)
    assert.equal(status.allReady, false)
    assert.equal(status.items.length, 3)
    assert.deepEqual(status.required, mod.REQUIRED_CORE_MODEL_IDS)
    assert.ok(!status.required.includes('core.hy-mt-q4'))
    assert.ok(status.items.every(i => i.ready === false))
    assert.ok(mod.OPTIONAL_CORE_MODEL_IDS.includes('core.hy-mt-q4'))
    assert.ok(mod.CORE_MODEL_IDS.includes('core.hy-mt-q4'))
  })

  it('allReady true when required markers present without hy-mt', async () => {
    const mod = await importCoreModels()
    const dirs = mod.resolveCoreModelPaths(tmpDir)
    await fs.promises.mkdir(path.join(dirs.e5Dir, 'onnx'), { recursive: true })
    await fs.promises.writeFile(path.join(dirs.e5Dir, 'config.json'), '{}')
    await fs.promises.writeFile(path.join(dirs.e5Dir, 'tokenizer.json'), '{}')
    await fs.promises.writeFile(path.join(dirs.e5Dir, 'tokenizer_config.json'), '{}')
    await fs.promises.writeFile(path.join(dirs.e5Dir, 'onnx/model_quantized.onnx'), 'onnx')
    await fs.promises.mkdir(dirs.rapidocrDir, { recursive: true })
    for (const f of mod.RAPIDOCR_FILES) {
      await fs.promises.writeFile(path.join(dirs.rapidocrDir, f.local), 'x')
    }
    await fs.promises.mkdir(dirs.sensevoiceDir, { recursive: true })
    for (const f of mod.SENSEVOICE_FILES) {
      await fs.promises.writeFile(path.join(dirs.sensevoiceDir, f.filename), mod.GGUF_MAGIC)
    }

    assert.equal(mod.isCoreModelReady('core.hy-mt-q4', tmpDir), false)
    assert.equal(mod.areAllCoreModelsReady(tmpDir), true)
    const status = mod.buildCoreModelsStatus(tmpDir)
    assert.equal(status.allReady, true)
    assert.equal(status.items.length, 3)
    assert.ok(!status.items.some(i => i.id === 'core.hy-mt-q4'))
  })

  it('normalizeSourceOrderInput filters unknown mirrors', async () => {
    const mod = await importCoreModels()
    assert.deepEqual(
      mod.normalizeSourceOrderInput(['huggingface', 'modelscope', 'bad']),
      ['huggingface', 'modelscope'],
    )
    assert.equal(mod.normalizeSourceOrderInput([]), null)
  })

  it('validateImportBuffer rejects invalid gguf', async () => {
    const mod = await importCoreModels()
    const bad = mod.validateImportBuffer('core.hy-mt-q4', Buffer.from('bad'), 'x.gguf')
    assert.equal(bad.ok, false)
    const good = mod.validateImportBuffer(
      'core.hy-mt-q4',
      Buffer.concat([mod.GGUF_MAGIC, Buffer.alloc(64)]),
      'x.gguf',
    )
    assert.equal(good.ok, true)
  })

  it('offline import writes required files and marks ready', async () => {
    const mod = await importCoreModels()
    const dirs = mod.resolveCoreModelPaths(tmpDir)
    const payload = Buffer.alloc(128, 0x42)

    assert.equal(
      mod.validateImportBuffer('core.e5-multilingual-small', payload, 'model_quantized.onnx').ok,
      true,
    )
    await fs.promises.mkdir(path.join(dirs.e5Dir, 'onnx'), { recursive: true })
    for (const f of ['config.json', 'tokenizer.json', 'tokenizer_config.json']) {
      await mod.writeImportFile(path.join(dirs.e5Dir, f), payload)
    }
    await mod.writeImportFile(
      mod.mapImportDest('core.e5-multilingual-small', 'model_quantized.onnx', tmpDir),
      payload,
    )
    assert.equal(mod.isCoreModelReady('core.e5-multilingual-small', tmpDir), true)

    assert.equal(
      mod.validateImportBuffer(
        'core.rapidocr-ppocrv4-mobile',
        payload,
        'ch_PP-OCRv4_det_mobile.onnx',
      ).ok,
      true,
    )
    for (const f of mod.RAPIDOCR_FILES) {
      await mod.writeImportFile(
        mod.mapImportDest('core.rapidocr-ppocrv4-mobile', f.local, tmpDir),
        payload,
      )
    }
    assert.equal(mod.isCoreModelReady('core.rapidocr-ppocrv4-mobile', tmpDir), true)

    const gguf = Buffer.concat([mod.GGUF_MAGIC, Buffer.alloc(128)])
    await mod.writeImportFile(
      mod.mapImportDest('core.sensevoice-small-q8', 'sensevoice-small-q8.gguf', tmpDir),
      gguf,
    )
    await mod.writeImportFile(
      mod.mapImportDest('core.sensevoice-small-q8', 'fsmn-vad.gguf', tmpDir),
      gguf,
    )
    assert.equal(mod.isCoreModelReady('core.sensevoice-small-q8', tmpDir), true)
    assert.equal(mod.areAllCoreModelsReady(tmpDir), true)
  })
})
