/**
 * SenseVoice：bundled 路径可读 OPPTRIX_SENSEVOICE_BUNDLED_DIR / OPPTRIX_RESOURCES_PATH。
 */
import { describe, it, before, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** @type {typeof import('../packages/local-inference/dist/index.js')} */
let lib

describe('sensevoice bundled path resolution', () => {
  /** @type {string} */
  let tmpRoot
  /** @type {string | undefined} */
  let prevBundled
  /** @type {string | undefined} */
  let prevResources

  before(async () => {
    lib = await import('../packages/local-inference/dist/index.js')
  })

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-sv-bundled-'))
    prevBundled = process.env.OPPTRIX_SENSEVOICE_BUNDLED_DIR
    prevResources = process.env.OPPTRIX_RESOURCES_PATH
    delete process.env.OPPTRIX_SENSEVOICE_BUNDLED_DIR
    delete process.env.OPPTRIX_RESOURCES_PATH
  })

  afterEach(() => {
    if (prevBundled === undefined) delete process.env.OPPTRIX_SENSEVOICE_BUNDLED_DIR
    else process.env.OPPTRIX_SENSEVOICE_BUNDLED_DIR = prevBundled
    if (prevResources === undefined) delete process.env.OPPTRIX_RESOURCES_PATH
    else process.env.OPPTRIX_RESOURCES_PATH = prevResources
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('OPPTRIX_SENSEVOICE_BUNDLED_DIR wins', () => {
    const bundled = path.join(tmpRoot, 'sensevoice-explicit')
    fs.mkdirSync(bundled, { recursive: true })
    process.env.OPPTRIX_SENSEVOICE_BUNDLED_DIR = bundled
    process.env.OPPTRIX_RESOURCES_PATH = path.join(tmpRoot, 'resources-ignored')
    assert.equal(lib.getBundledSenseVoiceDir(), path.resolve(bundled))
  })

  it('OPPTRIX_RESOURCES_PATH resolves sensevoice sibling (ELECTRON_RUN_AS_NODE)', () => {
    const resources = path.join(tmpRoot, 'resources')
    fs.mkdirSync(path.join(resources, 'sensevoice'), { recursive: true })
    process.env.OPPTRIX_RESOURCES_PATH = resources
    assert.equal(
      lib.getBundledSenseVoiceDir(),
      path.join(path.resolve(resources), 'sensevoice'),
    )
  })
})
