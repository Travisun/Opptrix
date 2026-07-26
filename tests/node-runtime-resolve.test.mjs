import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const repoRoot = path.resolve(import.meta.dirname, '..')

async function importNodeResolve() {
  return import(path.join(repoRoot, 'packages/agent-workspace/dist/node/resolve-node.js'))
}

async function importShellArgv() {
  return import(path.join(repoRoot, 'packages/agent-workspace/dist/shell/resolve-shell-argv.js'))
}

async function detectSystemNode() {
  for (const name of ['node']) {
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

describe('resolveNodeRuntime / resolveShellArgv (node)', () => {
  it('leaves non-node argv unchanged', async () => {
    const { resolveShellArgv } = await importShellArgv()
    const argv = ['ping', '-c', '1', '127.0.0.1']
    const out = await resolveShellArgv(argv)
    assert.deepEqual(out, argv)
  })

  it('resolveNodeRuntime returns structured status', async () => {
    const { resolveNodeRuntime } = await importNodeResolve()
    const status = await resolveNodeRuntime()
    assert.equal(typeof status.ready, 'boolean')
    assert.equal(typeof status.electron_run_as_node, 'boolean')
    assert.ok(['system', 'electron', 'none'].includes(status.active_source))
    assert.ok(['system', 'runtime_cli', 'none'].includes(status.npm_source))
    assert.equal(typeof status.message, 'string')
  })

  it('rewrites node to absolute active path when ready', async (t) => {
    const { resolveNodeRuntime, resolveShellArgv } = await importNodeResolve()
    const { resolveShellArgv: resolveArgv } = await importShellArgv()
    const status = await resolveNodeRuntime()
    if (!status.ready || !status.active_path) {
      t.skip('node runtime not ready in test host')
      return
    }

    const rewritten = await resolveArgv(['node', '-v'])
    assert.ok(path.isAbsolute(rewritten[0]))
    assert.equal(rewritten[0], status.active_path)
    assert.equal(rewritten[1], '-v')
  })

  it('usesElectronAsNodeArgv detects execPath spawn', async () => {
    const { usesElectronAsNodeArgv } = await importNodeResolve()
    assert.equal(usesElectronAsNodeArgv([process.execPath, '-e', '1']), Boolean(process.versions.electron || process.env.ELECTRON_RUN_AS_NODE === '1'))
  })

  it('resolveNpmCliJs fails with clear message when npm unavailable', async (t) => {
    const { resolveNodeRuntime, resolveNpmCliJs } = await importNodeResolve()
    const status = await resolveNodeRuntime()
    if (status.npm_ready) {
      t.skip('npm is ready on this host')
      return
    }
    await assert.rejects(
      () => resolveNpmCliJs('npm'),
      /npm 尚未就绪/,
    )
  })

  it('prefers system node path when not electron-as-node', async (t) => {
    if (process.versions.electron) {
      t.skip('electron host uses execPath')
      return
    }
    const systemNode = await detectSystemNode()
    if (!systemNode) {
      t.skip('no system node on PATH')
      return
    }
    const { resolveNodeRuntime } = await importNodeResolve()
    const status = await resolveNodeRuntime()
    assert.equal(status.active_source, 'system')
    assert.equal(status.ready, true)
    assert.equal(path.basename(status.active_path ?? ''), path.basename(systemNode))
  })
})
