/**
 * local-inference paths：OPPTRIX_DATA_DIR / OPPTRIX_LLM_DIR 覆盖用户根与 llms 目录。
 */
import { describe, it, before, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** @type {typeof import('../packages/local-inference/dist/index.js')} */
let lib

describe('local-inference paths env overrides', () => {
  /** @type {string} */
  let tmpRoot
  /** @type {string | undefined} */
  let prevDataDir
  /** @type {string | undefined} */
  let prevLlmDir

  before(async () => {
    lib = await import('../packages/local-inference/dist/index.js')
  })

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-li-paths-'))
    prevDataDir = process.env.OPPTRIX_DATA_DIR
    prevLlmDir = process.env.OPPTRIX_LLM_DIR
    delete process.env.OPPTRIX_DATA_DIR
    delete process.env.OPPTRIX_LLM_DIR
  })

  afterEach(() => {
    if (prevDataDir === undefined) delete process.env.OPPTRIX_DATA_DIR
    else process.env.OPPTRIX_DATA_DIR = prevDataDir
    if (prevLlmDir === undefined) delete process.env.OPPTRIX_LLM_DIR
    else process.env.OPPTRIX_LLM_DIR = prevLlmDir
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('getOpptrixHome respects OPPTRIX_DATA_DIR', () => {
    const dataDir = path.join(tmpRoot, 'data')
    process.env.OPPTRIX_DATA_DIR = dataDir
    assert.equal(lib.getOpptrixHome(), path.resolve(dataDir))
    assert.equal(lib.getLlmsDir(), path.join(path.resolve(dataDir), 'llms'))
  })

  it('getLlmsDir respects OPPTRIX_LLM_DIR over DATA_DIR/llms', () => {
    const dataDir = path.join(tmpRoot, 'data')
    const llmDir = path.join(tmpRoot, 'models', 'llms')
    process.env.OPPTRIX_DATA_DIR = dataDir
    process.env.OPPTRIX_LLM_DIR = llmDir
    assert.equal(lib.getOpptrixHome(), path.resolve(dataDir))
    assert.equal(lib.getLlmsDir(), path.resolve(llmDir))
  })

  it('listLlmsSearchDirs dedupes OPPTRIX_LLM_DIR with getLlmsDir', () => {
    const llmDir = path.join(tmpRoot, 'models', 'llms')
    process.env.OPPTRIX_LLM_DIR = llmDir
    const dirs = lib.listLlmsSearchDirs()
    const resolved = path.resolve(llmDir)
    assert.equal(dirs.filter(d => path.resolve(d) === resolved).length, 1)
    assert.equal(dirs[0], resolved)
  })
})
