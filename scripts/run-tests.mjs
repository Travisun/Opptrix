#!/usr/bin/env node
/**
 * Cross-platform test runner — one file per subprocess for isolation,
 * per-file timeout, and --test-force-exit so stray watchers don't hang CI.
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

const failures = []

for (const file of testFiles) {
  const label = path.basename(file)
  const t0 = Date.now()
  const result = spawnSync(
    process.execPath,
    ['--test', '--test-force-exit', file],
    {
      cwd: root,
      stdio: 'inherit',
      shell: false,
      timeout: PER_FILE_TIMEOUT_MS,
      killSignal: 'SIGKILL',
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
