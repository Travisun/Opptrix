import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const repoRoot = path.resolve(import.meta.dirname, '..')

async function importResolvePython() {
  return import(path.join(repoRoot, 'packages/agent-workspace/dist/python/resolve-python.js'))
}

async function importPythonSettingsStore() {
  return import(path.join(repoRoot, 'packages/agent-workspace/dist/python-settings-store.js'))
}

async function detectSystemPython() {
  for (const name of ['python3', 'python']) {
    try {
      const cmd = process.platform === 'win32' ? 'where' : 'which'
      const { stdout } = await execFileAsync(cmd, [name])
      const first = stdout.trim().split(/\r?\n/)[0]?.trim()
      if (first) return first
    } catch {
      /* try next */
    }
  }
  return null
}

describe('resolvePythonRuntime / resolveShellArgv', () => {
  it('leaves non-python argv unchanged', async () => {
    const { resolveShellArgv } = await importResolvePython()
    const argv = ['node', '-v']
    const out = await resolveShellArgv(argv)
    assert.deepEqual(out, argv)
  })

  it('prefers system python when available and prefer_opptrix_python is false', async (t) => {
    const systemPython = await detectSystemPython()
    if (!systemPython) {
      t.skip('no system python on PATH')
      return
    }

    const { resolvePythonRuntime, resolveShellArgv } = await importResolvePython()
    const { resetPythonSettingsStoreForTests, savePythonSettings } = await importPythonSettingsStore()

    resetPythonSettingsStoreForTests()
    savePythonSettings({
      prefer_opptrix_python: false,
      pip_index_urls: ['https://pypi.tuna.tsinghua.edu.cn/simple'],
    })

    const status = await resolvePythonRuntime()
    assert.equal(status.active_source, 'system')
    assert.equal(status.ready, true)
    assert.equal(status.recommend_install, false)
    assert.ok(status.active_path)

    const rewritten = await resolveShellArgv(['python3', '-c', 'print(1)'])
    assert.ok(path.isAbsolute(rewritten[0]))
    assert.equal(path.basename(rewritten[0]), path.basename(systemPython))
    assert.equal(rewritten[1], '-c')
  })

  it('rewrites pip to python -m pip when python is ready', async (t) => {
    const systemPython = await detectSystemPython()
    if (!systemPython) {
      t.skip('no system python on PATH')
      return
    }

    const { resolveShellArgv } = await importResolvePython()
    const { resetPythonSettingsStoreForTests } = await importPythonSettingsStore()
    resetPythonSettingsStoreForTests()

    const rewritten = await resolveShellArgv(['pip3', 'install', 'requests'])
    assert.ok(path.isAbsolute(rewritten[0]))
    assert.equal(rewritten[1], '-m')
    assert.equal(rewritten[2], 'pip')
    assert.equal(rewritten[3], 'install')
  })
})

describe('python settings validation', () => {
  it('accepts China mirror URLs', async () => {
    const { validatePythonSettingsInput } = await import(
      path.join(repoRoot, 'packages/shared/dist/python-settings.js')
    )
    const result = validatePythonSettingsInput({
      pip_index_urls: ['https://pypi.tuna.tsinghua.edu.cn/simple'],
      prefer_opptrix_python: false,
    })
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.ok(result.settings.pip_index_urls[0]?.includes('tuna'))
    }
  })

  it('rejects invalid mirror URLs', async () => {
    const { validatePythonSettingsInput } = await import(
      path.join(repoRoot, 'packages/shared/dist/python-settings.js')
    )
    const result = validatePythonSettingsInput({
      pip_index_urls: ['not-a-url'],
    })
    assert.equal(result.ok, false)
  })
})
