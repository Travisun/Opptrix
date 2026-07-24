#!/usr/bin/env node
/**
 * Cross-platform test runner — one file per subprocess for isolation,
 * per-file timeout, and --test-force-exit so stray watchers don't hang CI.
 *
 * Default suite stays offline-fast. Opt into real upstream probes with:
 *   OPPTRIX_LIVE_NETWORK_TESTS=1 npm run test:ci
 * or: npm run test:live-network
 */
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const testsDir = path.join(root, 'tests')
const PER_FILE_TIMEOUT_MS = Number(process.env.OPPTRIX_TEST_FILE_TIMEOUT_MS ?? 90_000)

const testFiles = readdirSync(testsDir)
  .filter(name => name.endsWith('.test.mjs'))
  .sort()
  .map(name => path.join('tests', name))

if (process.env.OPPTRIX_LIVE_NETWORK_TESTS === '1') {
  console.log('[run-tests] OPPTRIX_LIVE_NETWORK_TESTS=1 — including live upstream probes')
}

const failures = []

for (const file of testFiles) {
  const label = path.basename(file)
  const t0 = Date.now()
  const nodeArgs = ['--test', '--test-force-exit', file]
  if (label === 'session-stream-runtime.test.mjs') {
    nodeArgs.unshift('--experimental-strip-types')
  }
  const result = spawnSync(
    process.execPath,
    nodeArgs,
    {
      cwd: root,
      stdio: 'inherit',
      shell: false,
      timeout: PER_FILE_TIMEOUT_MS,
      killSignal: 'SIGKILL',
      env: process.env,
    },
  )
  const elapsed = Date.now() - t0

  if (result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGKILL') {
    failures.push({ file: label, reason: `timeout after ${PER_FILE_TIMEOUT_MS}ms` })
    console.error(`\n[run-tests] TIMEOUT ${label} (${elapsed}ms)\n`)
    continue
  }

  if (result.status !== 0) {
    failures.push({ file: label, reason: `exit ${result.status ?? 'null'}` })
    console.error(`\n[run-tests] FAIL ${label} (${elapsed}ms)\n`)
  }
}

if (failures.length) {
  console.error('[run-tests] failures:')
  for (const f of failures) console.error(`  - ${f.file}: ${f.reason}`)
  process.exit(1)
}
