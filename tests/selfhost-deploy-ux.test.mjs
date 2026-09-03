/**
 * Deploy UX: TOS gate, progress format, summary helpers (no Docker).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  formatDownloadProgressLine,
  hasAcceptedUserAgreement,
  USER_AGREEMENT_URL,
  USER_AGREEMENT_VERSION,
  ensureUserAgreementAccepted,
  parseHealthVersions,
  printDeployReadySummary,
} from '../packages/selfhost/src/deploy-ux.mjs'
import { parseArgv } from '../packages/selfhost/src/parse.mjs'
import { hostConfigPath, writeHostConfig } from '../packages/selfhost/src/paths.mjs'

test('formatDownloadProgressLine includes pct and ETA when total known', () => {
  const started = Date.now() - 10_000
  const line = formatDownloadProgressLine(50 * 1024 * 1024, 100 * 1024 * 1024, started)
  assert.match(line, /50%/)
  assert.match(line, /MB/)
  assert.match(line, /剩余约/)
})

test('formatDownloadProgressLine works without total', () => {
  const line = formatDownloadProgressLine(1024 * 1024, null, Date.now() - 1000)
  assert.match(line, /1\.0 MB/)
  assert.doesNotMatch(line, /%/)
})

test('hasAcceptedUserAgreement requires matching version', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-tos-'))
  assert.equal(hasAcceptedUserAgreement(root), false)
  writeHostConfig(root, {
    userAgreementAcceptedAt: new Date().toISOString(),
    userAgreementVersion: 'old',
  })
  assert.equal(hasAcceptedUserAgreement(root), false)
  writeHostConfig(root, { userAgreementVersion: USER_AGREEMENT_VERSION })
  assert.equal(hasAcceptedUserAgreement(root), true)
  fs.rmSync(root, { recursive: true, force: true })
})

test('ensureUserAgreementAccepted accepts --agree-tos and persists', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-tos-agree-'))
  const parsed = parseArgv(['up', '--agree-tos'])
  const code = await ensureUserAgreementAccepted(parsed, { root, actionLabel: '测试' })
  assert.equal(code, 0)
  assert.equal(hasAcceptedUserAgreement(root), true)
  const cfg = JSON.parse(fs.readFileSync(hostConfigPath(root), 'utf8'))
  assert.equal(cfg.userAgreementVersion, USER_AGREEMENT_VERSION)
  assert.ok(cfg.userAgreementAcceptedAt)
  assert.match(USER_AGREEMENT_URL, /^https:\/\/opptrix\.org\//)
  // Second call is a no-op
  assert.equal(await ensureUserAgreementAccepted(parseArgv(['up']), { root }), 0)
  fs.rmSync(root, { recursive: true, force: true })
})

test('ensureUserAgreementAccepted fails without flag on non-TTY', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-tos-nontty-'))
  const wasTTY = process.stdin.isTTY
  Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })
  try {
    const code = await ensureUserAgreementAccepted(parseArgv(['up']), { root })
    assert.equal(code, 2)
    assert.equal(hasAcceptedUserAgreement(root), false)
  } finally {
    Object.defineProperty(process.stdin, 'isTTY', { value: wasTTY, configurable: true })
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('parseHealthVersions reads runtime_version / version / base_version', () => {
  assert.deepEqual(
    parseHealthVersions('{"runtime_version":"1.4.6","base_version":"opptrix-selfhost-v1.4.5"}'),
    { runtimeVersion: '1.4.6', baseVersion: 'opptrix-selfhost-v1.4.5' },
  )
  assert.deepEqual(
    parseHealthVersions('{"version":"1.4.0"}'),
    { runtimeVersion: '1.4.0', baseVersion: null },
  )
  assert.deepEqual(parseHealthVersions('not-json'), {
    runtimeVersion: null,
    baseVersion: null,
  })
  assert.deepEqual(parseHealthVersions(''), {
    runtimeVersion: null,
    baseVersion: null,
  })
  // runtime_version wins over legacy version
  assert.deepEqual(
    parseHealthVersions('{"runtime_version":"2.0.0","version":"1.0.0"}'),
    { runtimeVersion: '2.0.0', baseVersion: null },
  )
})

test('printDeployReadySummary prints access URLs without throwing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-summary-'))
  writeHostConfig(root, { appRef: 'opptrix-selfhost-v1.4.5' })
  // Thin compose so health probe can resolve port defaults
  fs.writeFileSync(
    path.join(root, 'docker-compose.yml'),
    'services:\n  opptrix:\n    image: test\n',
    'utf8',
  )
  const lines = []
  const origLog = console.log
  console.log = (...args) => {
    lines.push(args.map(String).join(' '))
  }
  try {
    assert.doesNotThrow(() => {
      printDeployReadySummary(root, { runtimeVersion: '1.4.6', healthy: true })
    })
  } finally {
    console.log = origLog
  }
  const joined = lines.join('\n')
  assert.match(joined, /运行时版本:\s+1\.4\.6/)
  assert.match(joined, /底座版本:\s+opptrix-selfhost-v1\.4\.5/)
  fs.rmSync(root, { recursive: true, force: true })
})
