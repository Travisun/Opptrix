import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'apps/server/dist/selfhost-https.js')

async function loadMod() {
  if (!fs.existsSync(DIST)) {
    const r = spawnSync('npm', ['run', 'build', '-w', '@opptrix/server'], {
      cwd: ROOT,
      encoding: 'utf8',
      shell: false,
    })
    assert.equal(r.status, 0, r.stderr || r.stdout)
  }
  return import(pathToFileURL(DIST).href)
}

test('resolveHttpsPort: Docker defaults to 8712; off disables', async () => {
  const mod = await loadMod()
  assert.equal(mod.resolveHttpsPort({ OPPTRIX_DOCKER: '1' }), 8712)
  assert.equal(mod.resolveHttpsPort({ OPPTRIX_DOCKER: '1', OPPTRIX_HTTPS_PORT: '0' }), null)
  assert.equal(mod.resolveHttpsPort({ OPPTRIX_DOCKER: '1', OPPTRIX_HTTPS_PORT: '9443' }), 9443)
  assert.equal(mod.resolveHttpsPort({}), null)
  assert.equal(mod.resolveHttpsPort({ OPPTRIX_HTTPS_PORT: '8712' }), 8712)
})

test('resolveHttpPort: Docker off unless ENABLE_HTTP; non-Docker defaults 8711', async () => {
  const mod = await loadMod()
  assert.equal(mod.resolveHttpPort({ OPPTRIX_DOCKER: '1' }), null)
  assert.equal(mod.resolveHttpPort({ OPPTRIX_DOCKER: '1', STOCK_RESEARCH_PORT: '8711' }), null)
  assert.equal(mod.resolveHttpPort({ OPPTRIX_DOCKER: '1', OPPTRIX_ENABLE_HTTP: '1' }), 8711)
  assert.equal(mod.resolveHttpPort({
    OPPTRIX_DOCKER: '1',
    OPPTRIX_ENABLE_HTTP: '1',
    STOCK_RESEARCH_PORT: '9080',
  }), 9080)
  assert.equal(mod.resolveHttpPort({}), 8711)
  assert.equal(mod.resolveHttpPort({ STOCK_RESEARCH_PORT: '9000' }), 9000)
  assert.equal(mod.resolveHttpPort({ OPPTRIX_ENABLE_HTTP: '0' }), null)
})

test('ensureSelfSignedTlsMaterials creates pem once', async () => {
  const openssl = spawnSync('openssl', ['version'], { encoding: 'utf8' })
  if ((openssl.status ?? 1) !== 0) {
    console.log('skip cert gen: no openssl')
    return
  }
  const mod = await loadMod()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opx-tls-'))
  const env = { OPPTRIX_SYSTEM_DIR: dir }
  const a = mod.ensureSelfSignedTlsMaterials(env)
  assert.equal(a.created, true)
  assert.ok(fs.existsSync(path.join(dir, 'tls', 'key.pem')))
  assert.ok(fs.existsSync(path.join(dir, 'tls', 'cert.pem')))
  const b = mod.ensureSelfSignedTlsMaterials(env)
  assert.equal(b.created, false)
  assert.deepEqual(a.cert, b.cert)
})
