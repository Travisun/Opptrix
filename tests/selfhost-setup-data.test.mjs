/**
 * Pure helpers for opptrix setup / data migrate (no Docker required).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  buildCopyPlan,
  generateHomeBindOverrideYaml,
  normalizeHostDataPath,
  parseBindDeviceFromOverride,
  writeHomeBindOverride,
  clearHomeBindOverride,
} from '../packages/selfhost/src/data-migrate.mjs'
import {
  defaultSetupAnswers,
  mergeSetupAnswers,
  normalizeDataPath,
  parsePort,
  needsSetup,
  answersFromFlags,
} from '../packages/selfhost/src/setup-wizard.mjs'
import { parseArgv } from '../packages/selfhost/src/parse.mjs'
import { hostConfigPath } from '../packages/selfhost/src/paths.mjs'

test('normalizeHostDataPath expands ~ and resolves', () => {
  const home = os.homedir()
  assert.equal(normalizeHostDataPath('~/opptrix-data'), path.join(home, 'opptrix-data'))
  assert.equal(normalizeDataPath('/tmp/opptrix'), path.resolve('/tmp/opptrix'))
  assert.throws(() => normalizeHostDataPath(''), /不能为空/)
})

test('parsePort clamps invalid to fallback', () => {
  assert.equal(parsePort('8711', 80), 8711)
  assert.equal(parsePort('nope', 8712), 8712)
  assert.equal(parsePort('0', 8711), 8711)
  assert.equal(parsePort('99999', 8711), 8711)
})

test('mergeSetupAnswers defaults and bind path', () => {
  const d = mergeSetupAnswers({})
  assert.equal(d.mirror, 'auto')
  assert.equal(d.dataStorage, 'volume')
  assert.equal(d.httpPort, 8711)
  assert.equal(d.httpsPort, 8712)

  const b = mergeSetupAnswers({ dataStorage: 'bind', dataPath: '~/opx' })
  assert.equal(b.dataStorage, 'bind')
  assert.equal(b.dataPath, path.join(os.homedir(), 'opx'))
})

test('answersFromFlags parses --data and ports', () => {
  const parsed = parseArgv([
    'setup',
    '--mirror',
    'cn',
    '--data',
    '/var/lib/opptrix',
    '--http-port',
    '9000',
    '--skip-models',
  ])
  const a = answersFromFlags(parsed)
  assert.equal(a.mirror, 'cn')
  assert.equal(a.dataStorage, 'bind')
  assert.equal(a.dataPath, path.resolve('/var/lib/opptrix'))
  assert.equal(a.httpPort, 9000)
  assert.equal(a.skipModels, true)

  const vol = answersFromFlags(parseArgv(['setup', '--data', 'volume']))
  assert.equal(vol.dataStorage, 'volume')
})

test('generateHomeBindOverrideYaml uses driver_opts bind', () => {
  const yml = generateHomeBindOverrideYaml('/var/lib/opptrix')
  assert.match(yml, /# Opptrix data path bind/)
  assert.match(yml, /opptrix-home:/)
  assert.match(yml, /type: none/)
  assert.match(yml, /o: bind/)
  assert.match(yml, /device: \/var\/lib\/opptrix/)
  const device = parseBindDeviceFromOverride(yml)
  assert.equal(device, path.resolve('/var/lib/opptrix'))
})

test('buildCopyPlan host→host prefers rsync or cp', () => {
  const plan = buildCopyPlan({
    fromKind: 'bind',
    toKind: 'bind',
    fromPath: '/tmp/opptrix-a',
    toPath: '/tmp/opptrix-b',
    preferRsync: true,
  })
  assert.equal(plan.ok, true)
  assert.equal(plan.copyMethod, 'rsync')
  assert.match(plan.steps[0].detail, /rsync -aH --info=progress2/)

  const cp = buildCopyPlan({
    fromKind: 'bind',
    toKind: 'bind',
    fromPath: '/tmp/opptrix-a',
    toPath: '/tmp/opptrix-b',
    preferRsync: false,
  })
  assert.equal(cp.copyMethod, 'cp')
  assert.match(cp.steps[0].detail, /^cp -a /)
})

test('buildCopyPlan volume→bind and bind→volume', () => {
  const v2b = buildCopyPlan({
    fromKind: 'volume',
    toKind: 'bind',
    toPath: '/data/opptrix',
    volumeName: 'proj_opptrix-home',
    preferRsync: false,
  })
  assert.equal(v2b.ok, true)
  assert.match(v2b.steps[0].detail, /docker run/)
  assert.match(v2b.steps[0].detail, /proj_opptrix-home/)

  const b2v = buildCopyPlan({
    fromKind: 'bind',
    toKind: 'volume',
    fromPath: '/data/opptrix',
    volumeName: 'proj_opptrix-home',
  })
  assert.equal(b2v.ok, true)
  assert.match(b2v.steps[0].detail, /\/from/)
})

test('buildCopyPlan rejects same path', () => {
  const p = path.resolve('/tmp/same-opx')
  const plan = buildCopyPlan({
    fromKind: 'bind',
    toKind: 'bind',
    fromPath: p,
    toPath: p,
    preferRsync: false,
  })
  assert.equal(plan.ok, false)
})

test('writeHomeBindOverride / clearHomeBindOverride roundtrip', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-setup-'))
  try {
    const dest = writeHomeBindOverride(dir, path.join(dir, 'data'))
    assert.ok(fs.existsSync(dest))
    assert.equal(clearHomeBindOverride(dir), true)
    assert.equal(fs.existsSync(dest), false)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('needsSetup true when no .opptrix.json', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-needs-'))
  try {
    assert.equal(needsSetup(dir), true)
    fs.writeFileSync(hostConfigPath(dir), '{}\n')
    assert.equal(needsSetup(dir), false)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('defaultSetupAnswers stable', () => {
  const a = defaultSetupAnswers()
  assert.deepEqual(a, {
    mirror: 'auto',
    dataStorage: 'volume',
    dataPath: null,
    httpPort: 8711,
    httpsPort: 8712,
    skipModels: false,
  })
})
