#!/usr/bin/env node
/**
 * Cross-platform test runner — one file per subprocess for isolation,
 * per-file timeout, and --test-force-exit so stray watchers don't hang CI.
 *
 * Default suite stays offline-fast. Opt into real upstream probes with:
 *   OPPTRIX_LIVE_NETWORK_TESTS=1 npm run test:ci
 * or: npm run test:live-network
 *
 * Main CI (OPPTRIX_CI_SKIP_DESKTOP_TESTS=1) skips Electron/desktop-pack-only tests;
 * desktop release pipeline is covered by release-desktop.yml + audit-desktop-pack.
 */
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const testsDir = path.join(root, 'tests')
const PER_FILE_TIMEOUT_MS = Number(process.env.OPPTRIX_TEST_FILE_TIMEOUT_MS ?? 90_000)

/** Desktop/Electron-only — not run on server/docker main CI. */
const DESKTOP_ONLY_TESTS = new Set([
  'after-pack-mac-leaf-sign.test.mjs',
  'desktop-bootloader.test.mjs',
  'desktop-pack-python-ci-contract.test.mjs',
  'desktop-startup-accel.test.mjs',
  'kill-app-for-update.test.mjs',
  'launch-args.test.mjs',
  'linux-autostart.test.mjs',
  'mac-sign-checklist.test.mjs',
  'sidecar-supervisor.test.mjs',
  'sync-release-to-ftp.test.mjs',
  'sync-release-to-r2.test.mjs',
  'translation-download-ack.test.mjs',
  'window-state.test.mjs',
])

const skipDesktop = process.env.OPPTRIX_CI_SKIP_DESKTOP_TESTS === '1'

const testFiles = readdirSync(testsDir)
  .filter(name => name.endsWith('.test.mjs'))
  .filter(name => !(skipDesktop && DESKTOP_ONLY_TESTS.has(name)))
  .sort()
  .map(name => path.join('tests', name))

if (skipDesktop) {
  console.log(`[run-tests] skipping ${DESKTOP_ONLY_TESTS.size} desktop-only test files (OPPTRIX_CI_SKIP_DESKTOP_TESTS=1)`)
}

if (process.env.OPPTRIX_LIVE_NETWORK_TESTS === '1') {
  console.log('[run-tests] OPPTRIX_LIVE_NETWORK_TESTS=1 — including live upstream probes')
}

const failures = []

for (const file of testFiles) {
  const label = path.basename(file)
  const t0 = Date.now()
  const nodeArgs = ['--test', '--test-force-exit', file]
  if (
    label === 'session-stream-runtime.test.mjs'
    || label === 'chat-notifications.test.mjs'
    || label === 'canvas-compile-smoke.test.mjs'
    || label === 'news-articles-memory-cap.test.mjs'
    || label === 'context-usage-format.test.mjs'
    ||     label === 'chart-series-align.test.mjs'
    || label === 'parse-message-inline-refs.test.mjs'
  ) {
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
