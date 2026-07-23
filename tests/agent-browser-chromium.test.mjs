import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const ENSURE_SCRIPT = path.join(REPO_ROOT, 'packages/agent-browser/scripts/ensure-chromium.mjs')

function runEnsureScript(...args) {
  return spawnSync(process.execPath, [ENSURE_SCRIPT, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      OPPTRIX_SKIP_PLAYWRIGHT_BROWSER: '1',
    },
  })
}

test('ensure-chromium --dry-run exits 0', () => {
  const result = spawnSync(process.execPath, [ENSURE_SCRIPT, '--dry-run'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.match(
    result.stdout,
    /Would install Playwright Chromium|already installed|Skipping Playwright Chromium install/,
  )
})

test('ensure-chromium --check exits 0 when skip env is set', () => {
  const result = runEnsureScript('--check')
  assert.equal(result.status, 0, result.stderr || result.stdout)
})

test('ensure-chromium --check fails when chromium missing and not skipped', () => {
  const tmpBrowsers = path.join(REPO_ROOT, '.tmp-playwright-missing-test')
  const result = spawnSync(process.execPath, [ENSURE_SCRIPT, '--check'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      PLAYWRIGHT_BROWSERS_PATH: tmpBrowsers,
    },
  })
  assert.equal(result.status, 1, 'expected missing browser dir to fail --check')
})
