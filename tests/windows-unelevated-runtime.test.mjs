/**
 * Windows unelevated runtime — alloc helper, probe idempotency, CreateProcessAsUserW spawn.
 * Platform-conditional: non-win32 / missing koffi cases skip appropriately.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  allocStruct,
  getWinApis,
  tryLoadKoffi,
  probeRestrictedTokenApi,
  spawnUnelevatedRestricted,
  isUnelevatedSpawnSupported,
  UNELEVATED_COMPONENT_UNAVAILABLE_MESSAGE,
  UNELEVATED_SPAWN_FAILED_MESSAGE,
  UNELEVATED_INTERNAL_ERROR_MESSAGE,
  WorkspaceError,
} from '../packages/agent-workspace/dist/index.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const isWin = process.platform === 'win32'

function resolvePythonBin() {
  return process.env.OPPTRIX_TEST_PYTHON || process.env.PYTHON || 'python'
}

test('T1 allocStruct uses alloc(type, 1) and works with real PROCESS_INFORMATION', () => {
  const koffi = tryLoadKoffi()
  if (!isWin || !koffi) {
    // Still verify helper accepts mock that requires length
    const calls = []
    const mock = {
      alloc(type, length) {
        calls.push([type, length])
        if (arguments.length < 2) throw new Error('Expected 2 arguments, got 1')
        return { ok: true, type, length }
      },
    }
    const out = allocStruct(mock, { tag: 'PI' })
    assert.equal(out.ok, true)
    assert.equal(out.length, 1)
    assert.deepEqual(calls[0], [{ tag: 'PI' }, 1])

    // Fallback: when two-arg throws, single-arg succeeds
    const legacy = {
      alloc(type, length) {
        if (arguments.length >= 2) throw new Error('legacy rejects length')
        return { legacy: true, type }
      },
    }
    const legacyOut = allocStruct(legacy, 'T')
    assert.equal(legacyOut.legacy, true)
    return
  }

  const api = getWinApis(koffi)
  const ptr = allocStruct(koffi, api.PROCESS_INFORMATION)
  assert.ok(ptr != null)
  // Second call must not throw Duplicate (singleton)
  const api2 = getWinApis(koffi)
  assert.equal(api2.PROCESS_INFORMATION, api.PROCESS_INFORMATION)
  const ptr2 = allocStruct(koffi, api2.PROCESS_INFORMATION)
  assert.ok(ptr2 != null)
})

test('T2 probeRestrictedTokenApi is idempotent (two consecutive true)', { skip: !isWin || !tryLoadKoffi() }, () => {
  const a = probeRestrictedTokenApi()
  const b = probeRestrictedTokenApi()
  assert.equal(a, true, 'first probe should succeed on win32+koffi')
  assert.equal(b, true, 'second probe must remain true (no Duplicate type name)')
  assert.equal(isUnelevatedSpawnSupported(), true)
})

test(
  'T3 unelevated spawn python -c print(1) exits 0',
  { skip: !isWin || !tryLoadKoffi() },
  async () => {
    assert.equal(probeRestrictedTokenApi(), true)
    const python = resolvePythonBin()
    const result = await spawnUnelevatedRestricted({
      argv: [python, '-c', 'print(1)'],
      env: { ...process.env, PYTHONUTF8: '1' },
      cwd: process.cwd(),
      timeoutMs: 15_000,
    })
    assert.equal(result.exitCode, 0, `exitCode=${result.exitCode} stderr=${result.stderr}`)
    assert.match(result.stdout.trim(), /^1$/)
  },
)

test('T4 spawn-win32 source must CreateProcessAsUserW and never child_process fallback', async () => {
  const srcPath = path.join(
    ROOT,
    'packages/agent-workspace/src/shell/windows-unelevated/spawn-win32.ts',
  )
  const winApisPath = path.join(
    ROOT,
    'packages/agent-workspace/src/shell/windows-unelevated/win-apis.ts',
  )
  const src = await fs.readFile(srcPath, 'utf8')
  const winApis = await fs.readFile(winApisPath, 'utf8')
  assert.ok(src.includes('CreateProcessAsUserW'), 'must bind CreateProcessAsUserW')
  assert.ok(src.includes('CreateRestrictedToken'), 'must create RestrictedToken')
  assert.ok(src.includes('allocStruct'), 'must use allocStruct helper')
  assert.ok(src.includes('readPipeHandleToString') || src.includes('ReadFile'), 'must ReadFile pipes')
  assert.ok(
    !/\bcreateReadStream\s*\(/.test(src),
    'must not call createReadStream for pipe I/O',
  )
  assert.ok(
    !src.includes("from 'node:child_process'") && !src.includes('from "node:child_process"'),
    'must not import node:child_process',
  )
  assert.ok(
    !winApis.includes("from 'node:child_process'") && !winApis.includes('from "node:child_process"'),
    'win-apis must not import node:child_process',
  )
  assert.ok(!src.includes('spawnFallbackNode'), 'must not define spawnFallbackNode')
  assert.ok(src.includes(UNELEVATED_COMPONENT_UNAVAILABLE_MESSAGE))
  assert.ok(src.includes(UNELEVATED_SPAWN_FAILED_MESSAGE))
  assert.ok(src.includes(UNELEVATED_INTERNAL_ERROR_MESSAGE))
  assert.ok(!/API|koffi|CreateProcess/i.test(UNELEVATED_SPAWN_FAILED_MESSAGE))
  assert.ok(!/API|koffi|CreateProcess/i.test(UNELEVATED_INTERNAL_ERROR_MESSAGE))
})

test('unelevated spawn hard-fails off win32', async () => {
  if (process.platform === 'win32') return
  await assert.rejects(
    () =>
      spawnUnelevatedRestricted({
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
