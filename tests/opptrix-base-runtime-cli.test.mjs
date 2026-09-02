/**
 * opptrix base/runtime CLI helpers — version format, audit, downgrade guard.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { normalizeBaseTag, normalizeRuntimeVersion } from '../packages/selfhost/src/version-format.mjs'
import { appendUpdateAudit, readUpdateAudit, resolveAuditPath } from '../packages/selfhost/src/update-audit.mjs'
import { classifyTagRelation } from '../packages/selfhost/src/app-refs.mjs'

const ROOT = process.cwd()
const CLI = path.join(ROOT, 'packages/selfhost/bin/opptrix.js')

test('normalizeBaseTag accepts semver and full tag', () => {
  assert.equal(normalizeBaseTag('1.4.0'), 'opptrix-selfhost-v1.4.0')
  assert.equal(normalizeBaseTag('opptrix-selfhost-v1.4.0'), 'opptrix-selfhost-v1.4.0')
  assert.equal(normalizeBaseTag('v1.4.0'), 'opptrix-selfhost-v1.4.0')
  assert.equal(normalizeBaseTag('latest'), null)
})

test('normalizeRuntimeVersion', () => {
  assert.equal(normalizeRuntimeVersion('1.4.1'), '1.4.1')
  assert.equal(normalizeRuntimeVersion('latest'), null)
  assert.equal(normalizeRuntimeVersion('bad'), null)
})

test('appendUpdateAudit writes jsonl', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-audit-'))
  appendUpdateAudit({
    action: 'test.action',
    layer: 'runtime',
    ok: true,
    targetVersion: '1.0.0',
    deployRoot: dir,
  })
  const rows = readUpdateAudit({ deployRoot: dir })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].action, 'test.action')
  assert.ok(fs.existsSync(resolveAuditPath(dir)))
  fs.rmSync(dir, { recursive: true, force: true })
})

test('classifyTagRelation upgrade rollback current', () => {
  assert.equal(
    classifyTagRelation('opptrix-selfhost-v1.4.1', 'opptrix-selfhost-v1.4.0'),
    'upgrade',
  )
  assert.equal(
    classifyTagRelation('opptrix-selfhost-v1.4.0', 'opptrix-selfhost-v1.4.1'),
    'rollback',
  )
  assert.equal(
    classifyTagRelation('opptrix-selfhost-v1.4.0', 'opptrix-selfhost-v1.4.0'),
    'current',
  )
})

test('opptrix help lists base runtime update commands', () => {
  const r = spawnSync(process.execPath, [CLI, 'help'], { encoding: 'utf8' })
  assert.equal(r.status, 0)
  assert.match(r.stdout, /\bbase\b/)
  assert.match(r.stdout, /\bruntime\b/)
  assert.match(r.stdout, /opptrix base list/)
  assert.match(r.stdout, /runtime use/)
})

test('opptrix base help exits 0', () => {
  const r = spawnSync(process.execPath, [CLI, 'base', 'help'], { encoding: 'utf8' })
  assert.equal(r.status, 0)
  assert.match(r.stdout, /base use/)
  assert.match(r.stdout, /allow-downgrade/)
})

test('opptrix runtime help exits 0', () => {
  const r = spawnSync(process.execPath, [CLI, 'runtime', 'help'], { encoding: 'utf8' })
  assert.equal(r.status, 0)
  assert.match(r.stdout, /runtime apply/)
  assert.match(r.stdout, /docker exec/)
})

test('opptrix base use blocks downgrade without flag', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-base-use-'))
  fs.mkdirSync(path.join(dir, '.opptrix'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, '.opptrix.json'),
    `${JSON.stringify({ appRef: 'opptrix-selfhost-v1.4.1' })}\n`,
  )
  fs.writeFileSync(path.join(dir, 'docker-compose.yml'), 'services:\n  opptrix:\n    image: x\n')
  fs.writeFileSync(path.join(dir, 'Dockerfile'), 'FROM scratch\n')
  fs.writeFileSync(path.join(dir, 'compose.env.example'), '# x\n')

  const r = spawnSync(process.execPath, [CLI, 'base', 'use', '1.4.0'], {
    encoding: 'utf8',
    env: { ...process.env, OPPTRIX_DEPLOY_DIR: dir },
  })
  assert.notEqual(r.status, 0)
  assert.match(r.stderr + r.stdout, /allow-downgrade/)
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, '.opptrix.json'), 'utf8'))
  assert.equal(cfg.appRef, 'opptrix-selfhost-v1.4.1')
  fs.rmSync(dir, { recursive: true, force: true })
})

test('opptrix base use allows downgrade with --allow-downgrade', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-base-down-'))
  fs.writeFileSync(
    path.join(dir, '.opptrix.json'),
    `${JSON.stringify({ appRef: 'opptrix-selfhost-v1.4.1' })}\n`,
  )
  fs.writeFileSync(path.join(dir, 'docker-compose.yml'), 'services:\n  opptrix:\n    image: x\n')
  fs.writeFileSync(path.join(dir, 'Dockerfile'), 'FROM scratch\n')
  fs.writeFileSync(path.join(dir, 'compose.env.example'), '# x\n')

  const r = spawnSync(
    process.execPath,
    [CLI, 'base', 'use', '1.4.0', '--allow-downgrade'],
    { encoding: 'utf8', env: { ...process.env, OPPTRIX_DEPLOY_DIR: dir } },
  )
  assert.equal(r.status, 0, r.stderr || r.stdout)
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, '.opptrix.json'), 'utf8'))
  assert.equal(cfg.appRef, 'opptrix-selfhost-v1.4.0')
  fs.rmSync(dir, { recursive: true, force: true })
})
