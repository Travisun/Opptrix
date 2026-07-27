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

async function importResolveShellArgv() {
  return import(path.join(repoRoot, 'packages/agent-workspace/dist/shell/resolve-shell-argv.js'))
}

async function importRunner() {
  return import(path.join(repoRoot, 'packages/agent-workspace/dist/shell/runner.js'))
}

async function importAgentPythonEnvView() {
  return import(path.join(repoRoot, 'packages/agent-workspace/dist/python/agent-python-env-view.js'))
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

describe('looksLikePythonBin / looksLikePipBin', () => {
  it('matches python3.x and pip3.x', async () => {
    const { looksLikePythonBin, looksLikePipBin } = await importResolveShellArgv()
    assert.equal(looksLikePythonBin('python'), true)
    assert.equal(looksLikePythonBin('python3'), true)
    assert.equal(looksLikePythonBin('python3.12'), true)
    assert.equal(looksLikePythonBin('python3.9'), true)
    assert.equal(looksLikePythonBin('python2'), false)
    assert.equal(looksLikePipBin('pip'), true)
    assert.equal(looksLikePipBin('pip3'), true)
    assert.equal(looksLikePipBin('pip3.12'), true)
    assert.equal(looksLikePipBin('pipx'), false)
  })
})

describe('resolvePythonRuntime / resolveShellArgv', () => {
  it('leaves non-python argv unchanged', async () => {
    const { resolveShellArgv } = await importResolvePython()
    const argv = ['ping', '-c', '1', '127.0.0.1']
    const out = await resolveShellArgv(argv)
    assert.deepEqual(out.argv, argv)
    assert.equal(out.python_rewritten, false)
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
    assert.ok(path.isAbsolute(rewritten.argv[0]))
    assert.equal(path.basename(rewritten.argv[0]), path.basename(systemPython))
    assert.equal(rewritten.argv[1], '-c')
    assert.equal(rewritten.python_rewritten, true)
  })

  it('rewrites python3.12 basename to active interpreter', async (t) => {
    const systemPython = await detectSystemPython()
    if (!systemPython) {
      t.skip('no system python on PATH')
      return
    }

    const { resolvePythonRuntime, resolveShellArgv } = await importResolvePython()
    const { resetPythonSettingsStoreForTests, savePythonSettings } = await importPythonSettingsStore()
    resetPythonSettingsStoreForTests()
    savePythonSettings({ prefer_opptrix_python: false, pip_index_urls: [] })

    const status = await resolvePythonRuntime()
    assert.ok(status.active_path)

    const out = await resolveShellArgv(['python3.12', '-c', 'print(1)'])
    assert.equal(out.argv[0], status.active_path)
    assert.equal(out.python_rewritten, true)
    assert.equal(out.argv[1], '-c')
  })

  it('rewrites absolute /usr/bin/python3 to active interpreter', async (t) => {
    const systemPython = await detectSystemPython()
    if (!systemPython) {
      t.skip('no system python on PATH')
      return
    }

    const { resolvePythonRuntime, resolveShellArgv } = await importResolvePython()
    const { resetPythonSettingsStoreForTests, savePythonSettings } = await importPythonSettingsStore()
    resetPythonSettingsStoreForTests()
    savePythonSettings({ prefer_opptrix_python: false, pip_index_urls: [] })

    const status = await resolvePythonRuntime()
    assert.ok(status.active_path)

    const absInput = process.platform === 'win32'
      ? path.join('C:\\', 'Windows', 'py.exe')
      : '/usr/bin/python3'
    // On win32 py.exe basename is py — not rewritten; skip if not python-like
    if (process.platform === 'win32') {
      t.skip('absolute path rewrite covered on posix')
      return
    }

    const out = await resolveShellArgv([absInput, '-c', 'print(1)'])
    assert.equal(out.argv[0], status.active_path)
    assert.equal(out.python_rewritten, out.argv[0] !== absInput || absInput !== status.active_path)
    assert.ok(out.python_rewritten || out.argv[0] === absInput)
    // Prefer: always rewritten to active when prefer system and paths differ
    if (absInput !== status.active_path) {
      assert.equal(out.python_rewritten, true)
      assert.equal(out.argv[0], status.active_path)
    }
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
    assert.ok(path.isAbsolute(rewritten.argv[0]))
    assert.equal(rewritten.argv[1], '-m')
    assert.equal(rewritten.argv[2], 'pip')
    assert.equal(rewritten.argv[3], 'install')
    assert.equal(rewritten.python_rewritten, true)
  })
})

describe('applyPythonRuntimeToChildEnv', () => {
  it('prepends PATH and sets PYTHONPATH + PYTHONNOUSERSITE', async () => {
    const { applyPythonRuntimeToChildEnv } = await importRunner()
    const activePath = process.platform === 'win32'
      ? 'C:\\opptrix\\python\\python.exe'
      : '/opt/opptrix/python/bin/python3'
    const pipTarget = process.platform === 'win32'
      ? 'C:\\ws\\.opptrix-packages'
      : '/tmp/ws/.opptrix-packages'
    const env = {
      PATH: process.platform === 'win32' ? 'C:\\Windows\\System32' : '/usr/bin',
      PYTHONPATH: '/existing/site',
    }
    applyPythonRuntimeToChildEnv(env, { activePath, pipTarget })
    const binDir = path.dirname(activePath)
    assert.ok(env.PATH.startsWith(binDir + path.delimiter) || env.PATH === binDir)
    assert.equal(env.PYTHONPATH, `${pipTarget}${path.delimiter}/existing/site`)
    assert.equal(env.PYTHONNOUSERSITE, '1')
  })
})

describe('toAgentPythonEnvView', () => {
  it('omits executable paths and exposes priority', async () => {
    const { toAgentPythonEnvView } = await importAgentPythonEnvView()
    const view = toAgentPythonEnvView({
      system_path: '/usr/bin/python3',
      system_version: 'Python 3.12.0',
      opptrix_path: '/opt/opptrix/python',
      opptrix_version: 'Python 3.12.1',
      active_source: 'opptrix',
      active_path: '/opt/opptrix/python',
      active_version: 'Python 3.12.1',
      ready: true,
      recommend_install: false,
      message: 'ok',
    }, true)
    assert.equal(view.ready, true)
    assert.equal(view.active_source, 'opptrix')
    assert.equal(view.priority, '当前优先：Opptrix 托管')
    assert.equal(view.prefer_opptrix_python, true)
    assert.equal(view.opptrix_installed, true)
    assert.equal(view.system_detected, true)
    assert.ok(view.argv_policy.includes('python'))
    assert.equal('system_path' in view, false)
    assert.equal('opptrix_path' in view, false)
    assert.equal('active_path' in view, false)
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
