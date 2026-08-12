/**
 * Windows sandbox alignment — settings normalize, elevated cred retry, unelevated network gate
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  normalizeSandboxSettings,
  normalizeWindowsIsolationMode,
  validateSandboxSettingsInput,
  DEFAULT_SANDBOX_SETTINGS,
} from '../packages/shared/dist/sandbox-settings.js'
import {
  isRefreshableWindowsCredError,
  WIN_ERROR_LOGON_FAILURE,
  WIN_ERROR_NO_SUCH_LOGON_SESSION,
  assertUnelevatedRejectsFullNetworkIsolation,
  UNELEVATED_FULL_NETWORK_REJECT_MESSAGE,
  UNELEVATED_COMPONENT_UNAVAILABLE_MESSAGE,
  isUnelevatedSpawnSupported,
  spawnUnelevatedRestricted,
  WorkspaceError,
} from '../packages/agent-workspace/dist/index.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('normalizeWindowsIsolationMode defaults unknown to unelevated', () => {
  assert.equal(normalizeWindowsIsolationMode(undefined), 'unelevated')
  assert.equal(normalizeWindowsIsolationMode(null), 'unelevated')
  assert.equal(normalizeWindowsIsolationMode('bogus'), 'unelevated')
  assert.equal(normalizeWindowsIsolationMode('unelevated'), 'unelevated')
  assert.equal(normalizeWindowsIsolationMode('elevated'), 'elevated')
})

test('normalizeSandboxSettings defaults windows_isolation_mode to unelevated', () => {
  const n = normalizeSandboxSettings({
    allowed_domains: ['example.com'],
    allow_lan_access: true,
  })
  assert.equal(n.windows_isolation_mode, 'unelevated')
  assert.deepEqual(n.allowed_domains, ['example.com'])
  assert.equal(DEFAULT_SANDBOX_SETTINGS.windows_isolation_mode, 'unelevated')
})

test('normalizeSandboxSettings keeps unelevated', () => {
  const n = normalizeSandboxSettings({
    allowed_domains: [],
    allow_lan_access: false,
    windows_isolation_mode: 'unelevated',
  })
  assert.equal(n.windows_isolation_mode, 'unelevated')
})

test('normalizeSandboxSettings keeps elevated when explicitly saved', () => {
  const n = normalizeSandboxSettings({
    allowed_domains: [],
    allow_lan_access: false,
    windows_isolation_mode: 'elevated',
  })
  assert.equal(n.windows_isolation_mode, 'elevated')
})

test('validateSandboxSettingsInput accepts isolation modes', () => {
  const ok = validateSandboxSettingsInput({
    allowed_domains: [],
    allow_lan_access: false,
    windows_isolation_mode: 'unelevated',
  })
  assert.equal(ok.ok, true)
  if (ok.ok) assert.equal(ok.settings.windows_isolation_mode, 'unelevated')

  const bad = validateSandboxSettingsInput({
    allowed_domains: [],
    allow_lan_access: false,
    windows_isolation_mode: 'nope',
  })
  assert.equal(bad.ok, false)
})

test('isRefreshableWindowsCredError recognizes 1326 and 1312', () => {
  assert.equal(
    isRefreshableWindowsCredError(`CreateProcessWithLogonW failed: ${WIN_ERROR_LOGON_FAILURE}`),
    true,
  )
  assert.equal(
    isRefreshableWindowsCredError(`spawn attempt 2 failed (Windows error ${WIN_ERROR_NO_SUCH_LOGON_SESSION})`),
    true,
  )
  assert.equal(isRefreshableWindowsCredError('ERROR_LOGON_FAILURE'), true)
  assert.equal(isRefreshableWindowsCredError('network unreachable'), false)
  assert.equal(
    isRefreshableWindowsCredError(
      `Windows error ${WIN_ERROR_NO_SUCH_LOGON_SESSION}`,
      ['C:\\Program Files\\WindowsApps\\Foo\\app.exe'],
    ),
    false,
  )
})

test('unelevated hard-rejects full network isolation path', () => {
  assert.doesNotThrow(() => assertUnelevatedRejectsFullNetworkIsolation(false))
  assert.throws(
    () => assertUnelevatedRejectsFullNetworkIsolation(true),
    (err) => {
      assert.ok(err instanceof WorkspaceError || err instanceof Error)
      assert.equal(err.message, UNELEVATED_FULL_NETWORK_REJECT_MESSAGE)
      assert.ok(!/SRT|WFP|Logon|API/i.test(err.message))
      return true
    },
  )
})

test('isUnelevatedSpawnSupported reflects probe (false off win32 / without koffi)', () => {
  if (process.platform !== 'win32') {
    assert.equal(isUnelevatedSpawnSupported(), false)
  }
})

test('unelevated unavailable message is user-facing and non-technical', () => {
  assert.equal(
    UNELEVATED_COMPONENT_UNAVAILABLE_MESSAGE,
    '基础隔离组件不可用，请改用完整隔离或稍后重试',
  )
  assert.ok(!/koffi|CreateProcess|RestrictedToken|API|spawn/i.test(UNELEVATED_COMPONENT_UNAVAILABLE_MESSAGE))
})

test('spawnUnelevatedRestricted hard-fails off win32', async () => {
  if (process.platform === 'win32') return
  await assert.rejects(
    () => spawnUnelevatedRestricted({
      argv: ['echo', 'hi'],
      env: process.env,
      cwd: process.cwd(),
      timeoutMs: 1000,
    }),
    (err) => {
      assert.ok(err instanceof WorkspaceError || err instanceof Error)
      assert.match(err.message, /不支持基础隔离|基础隔离组件不可用/)
      return true
    },
  )
})

test('unelevated spawn-win32 must CreateProcessAsUserW and never node-spawn fallback', async () => {
  const srcPath = path.join(
    ROOT,
    'packages/agent-workspace/src/shell/windows-unelevated/spawn-win32.ts',
  )
  const src = await fs.readFile(srcPath, 'utf8')
  assert.ok(src.includes('CreateProcessAsUserW'), 'must bind CreateProcessAsUserW')
  assert.ok(src.includes('CreateRestrictedToken'), 'must create RestrictedToken')
  assert.ok(
    !src.includes("from 'node:child_process'") && !src.includes('from "node:child_process"'),
    'must not import node:child_process (no ordinary spawn success path)',
  )
  assert.ok(!src.includes('spawnFallbackNode'), 'must not define spawnFallbackNode')
  assert.ok(
    src.includes(UNELEVATED_COMPONENT_UNAVAILABLE_MESSAGE)
      || src.includes('基础隔离组件不可用，请改用完整隔离或稍后重试'),
    'hard-fail copy must match product message',
  )
  // 禁止「创建 token 后 CloseHandle 再普通 spawn」成功路径
  assert.ok(
    !/CloseHandle\(restrictedToken\)\s*[\s\S]{0,80}spawnFallbackNode/.test(src),
    'must not CloseHandle restricted token then fallback spawn',
  )
})

test('windows_isolation_mode persists via sandbox settings store', async () => {
  const os = await import('node:os')
  const {
    saveSandboxSettings,
    getSandboxSettings,
    resetSandboxSettingsStoreForTests,
  } = await import('../packages/agent-workspace/dist/index.js')

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'opptrix-win-iso-'))
  const prev = process.env.OPPTRIX_DATA_DIR
  process.env.OPPTRIX_DATA_DIR = tmp
  resetSandboxSettingsStoreForTests()
  try {
    const saved = saveSandboxSettings({
      allowed_domains: [],
      allow_lan_access: false,
      windows_isolation_mode: 'unelevated',
    })
    assert.equal(saved.ok, true)
    resetSandboxSettingsStoreForTests()
    const loaded = getSandboxSettings()
    assert.equal(loaded.windows_isolation_mode, 'unelevated')
  } finally {
    resetSandboxSettingsStoreForTests()
    if (prev == null) delete process.env.OPPTRIX_DATA_DIR
    else process.env.OPPTRIX_DATA_DIR = prev
    try {
      await fs.rm(tmp, { recursive: true, force: true })
    } catch (err) {
      // 单例 store 仍占着 SQLite WAL；不影响断言结果
      const code = err && typeof err === 'object' && 'code' in err ? err.code : ''
      if (code !== 'EBUSY') throw err
    }
  }
})
