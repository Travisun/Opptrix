import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function importEnoentHints() {
  return import(path.join(repoRoot, 'packages/agent-workspace/dist/enoent-hints.js'))
}

async function importSpawnHint() {
  return import(path.join(repoRoot, 'packages/agent-workspace/dist/shell/resolve-shell-bin.js'))
}

describe('resolveEnoentToolHint — file vs spawn', () => {
  it('open ENOENT → FILE_ENOENT_HINT（非 SPAWN）', async () => {
    const {
      resolveEnoentToolHint,
      FILE_ENOENT_HINT,
      appendRelativePathNudge,
    } = await importEnoentHints()
    const { SPAWN_ENOENT_HINT } = await importSpawnHint()

    const openMsg =
      "ENOENT: no such file or directory, open '/Users/mac/.opptrix/agent-workspace/shared/data/cache/offline-k-meta.json'"
    const hint = resolveEnoentToolHint(openMsg, 'ENOENT')
    assert.equal(hint, FILE_ENOENT_HINT)
    assert.notEqual(hint, SPAWN_ENOENT_HINT)
    assert.match(FILE_ENOENT_HINT, /目标文件不存在/)
    assert.match(FILE_ENOENT_HINT, /不是 shell|PATH/)
    assert.match(FILE_ENOENT_HINT, /root_id|相对路径/)
    assert.match(FILE_ENOENT_HINT, /workspace_glob/)
    assert.doesNotMatch(FILE_ENOENT_HINT, /\/bin\/bash/)

    const nudged = appendRelativePathNudge(openMsg)
    assert.match(nudged, /请改用相对路径/)
  })

  it('spawn /bin/bash ENOENT → SPAWN_ENOENT_HINT', async () => {
    const { resolveEnoentToolHint, FILE_ENOENT_HINT } = await importEnoentHints()
    const { SPAWN_ENOENT_HINT } = await importSpawnHint()

    for (const msg of [
      'spawn /bin/bash ENOENT',
      'spawnSync /bin/bash ENOENT',
      '无法启动命令「bash」：找不到可执行文件。',
    ]) {
      const hint = resolveEnoentToolHint(msg, 'ENOENT')
      assert.equal(hint, SPAWN_ENOENT_HINT, msg)
      assert.notEqual(hint, FILE_ENOENT_HINT, msg)
    }
  })

  it('exports FILE_ENOENT_HINT from package index', async () => {
    const mod = await import(
      path.join(repoRoot, 'packages/agent-workspace/dist/index.js')
    )
    assert.equal(typeof mod.FILE_ENOENT_HINT, 'string')
    assert.equal(typeof mod.resolveEnoentToolHint, 'function')
    assert.match(mod.FILE_ENOENT_HINT, /workspace_write/)
  })
})
