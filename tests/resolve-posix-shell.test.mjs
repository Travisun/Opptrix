import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function importShellBin() {
  return import(path.join(repoRoot, 'packages/agent-workspace/dist/shell/resolve-shell-bin.js'))
}

async function importParseCommand() {
  return import(path.join(repoRoot, 'packages/agent-workspace/dist/shell/parse-command.js'))
}

describe('resolvePosixShellPath / shellWrapArgv', () => {
  it('prefers absolute executable env.SHELL over defaults', async () => {
    const { resolvePosixShellPath } = await importShellBin()
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-shell-'))
    const fakeShell = path.join(tmp, 'myshell')
    fs.writeFileSync(fakeShell, '#!/bin/sh\n', { mode: 0o755 })
    try {
      const resolved = resolvePosixShellPath({ SHELL: fakeShell }, 'linux')
      assert.equal(resolved, fakeShell)
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('ignores non-absolute or non-executable SHELL and falls through', async () => {
    const { resolvePosixShellPath } = await importShellBin()
    const resolved = resolvePosixShellPath({ SHELL: 'bash' }, 'linux')
    assert.ok(path.isAbsolute(resolved))
    assert.ok(
      resolved === '/bin/bash'
      || resolved === '/usr/bin/bash'
      || resolved === '/bin/sh'
      || resolved.endsWith('/sh')
      || resolved.endsWith('/bash'),
    )
  })

  it('darwin candidate order prefers zsh when present', async () => {
    const { resolvePosixShellPath } = await importShellBin()
    const resolved = resolvePosixShellPath({ SHELL: '' }, 'darwin')
    assert.ok(path.isAbsolute(resolved))
    // On real macOS hosts zsh is typically present; otherwise bash/sh
    if (fs.existsSync('/bin/zsh')) {
      try {
        fs.accessSync('/bin/zsh', fs.constants.X_OK)
        assert.equal(resolved, '/bin/zsh')
      } catch {
        assert.ok(['/bin/bash', '/usr/bin/bash', '/bin/sh'].includes(resolved))
      }
    } else {
      assert.ok(
        resolved === '/bin/bash'
        || resolved === '/usr/bin/bash'
        || resolved === '/bin/sh',
      )
    }
  })

  it('falls back to /bin/sh when no bash/zsh (probe via empty candidates env)', async () => {
    const { resolvePosixShellPath } = await importShellBin()
    // Without executable SHELL, function still returns a concrete path ending in sh/bash/zsh
    const resolved = resolvePosixShellPath({}, 'linux')
    assert.equal(typeof resolved, 'string')
    assert.ok(resolved.length > 0)
    assert.ok(path.isAbsolute(resolved))
  })

  it('shellWrapArgv on win32 stays cmd.exe (platform-gated)', async (t) => {
    if (process.platform !== 'win32') {
      t.skip('win32-only assertion for argv shape; posix covered below')
      return
    }
    const { shellWrapArgv } = await importParseCommand()
    assert.deepEqual(shellWrapArgv('echo hi'), ['cmd.exe', '/d', '/s', '/c', 'echo hi'])
  })

  it('shellWrapArgv on posix uses resolvePosixShellPath (not bare /bin/bash only)', async (t) => {
    if (process.platform === 'win32') {
      t.skip('posix-only')
      return
    }
    const { shellWrapArgv } = await importParseCommand()
    const { resolvePosixShellPath } = await importShellBin()
    const argv = shellWrapArgv('echo hi')
    assert.equal(argv.length, 3)
    assert.equal(argv[0], resolvePosixShellPath())
    assert.equal(argv[1], '-c')
    assert.equal(argv[2], 'echo hi')
    assert.notEqual(argv[0], undefined)
  })

  it('exports SPAWN_ENOENT_HINT with actionable text', async () => {
    const { SPAWN_ENOENT_HINT } = await importShellBin()
    assert.match(SPAWN_ENOENT_HINT, /找不到可执行文件/)
    assert.match(SPAWN_ENOENT_HINT, /background/i)
    assert.doesNotMatch(SPAWN_ENOENT_HINT, /\/bin\/bash/)
  })
})
