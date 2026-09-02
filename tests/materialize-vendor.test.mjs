import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = path.join(ROOT, 'scripts/materialize-vendor.mjs')

function writePkg(dir, name, marker) {
  const pkgDir = path.join(dir, ...name.split('/'))
  fs.mkdirSync(pkgDir, { recursive: true })
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    `${JSON.stringify({ name, version: '1.0.0', type: 'module', main: 'index.js' }, null, 2)}\n`,
  )
  fs.writeFileSync(path.join(pkgDir, 'index.js'), `export default { from: '${marker}' }\n`)
}

test('materialize-vendor moves ABI packages out of app tree', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opx-mat-'))
  const app = path.join(root, 'app')
  const vendor = path.join(root, 'vendor', 'node_modules')
  writePkg(path.join(app, 'node_modules'), 'better-sqlite3', 'abi')
  writePkg(path.join(app, 'node_modules'), 'left-pad-fake', 'js')
  writePkg(path.join(app, 'node_modules'), 'onnxruntime-web', 'web')
  writePkg(path.join(app, 'packages', 'x', 'node_modules'), 'duckdb', 'nested')

  const r = spawnSync(process.execPath, [SCRIPT, '--app', app, '--vendor', vendor], {
    encoding: 'utf8',
  })
  assert.equal(r.status, 0, r.stderr + r.stdout)
  assert.ok(fs.existsSync(path.join(vendor, 'better-sqlite3')))
  assert.equal(fs.existsSync(path.join(app, 'node_modules', 'better-sqlite3')), false)
  assert.ok(fs.existsSync(path.join(app, 'node_modules', 'left-pad-fake')))
  assert.equal(fs.existsSync(path.join(app, 'packages', 'x', 'node_modules', 'duckdb')), false)
  assert.equal(fs.existsSync(path.join(app, 'node_modules', 'onnxruntime-web')), false)
  assert.equal(fs.existsSync(path.join(vendor, 'onnxruntime-web')), false)
})
