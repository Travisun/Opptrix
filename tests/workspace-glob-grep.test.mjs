/**
 * workspace_glob / workspace_grep — grant 内命中、AND/OR、越权、截断
 */
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  WorkspaceService,
  PathEscapeError,
  WorkspaceError,
} from '../packages/agent-workspace/dist/index.js'

async function withTmpDataDir(fn) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'opptrix-ws-gg-'))
  const prev = process.env.OPPTRIX_DATA_DIR
  process.env.OPPTRIX_DATA_DIR = tmp
  try {
    await fn(tmp)
  } finally {
    if (prev == null) delete process.env.OPPTRIX_DATA_DIR
    else process.env.OPPTRIX_DATA_DIR = prev
    await fs.rm(tmp, { recursive: true, force: true })
  }
}

describe('workspace_glob / workspace_grep', { concurrency: false }, () => {
  test('workspace_glob matches within grant and truncates', async () => {
    await withTmpDataDir(async () => {
      const ws = new WorkspaceService()
      const sid = 'sess-glob-1'
      await ws.ensureDefaultRoot(sid)
      await ws.mkdir(sid, 'default', 'src')
      await ws.writeFile(sid, 'default', 'src/a.py', 'print(1)\n')
      await ws.writeFile(sid, 'default', 'src/b.py', 'print(2)\n')
      await ws.writeFile(sid, 'default', 'src/c.ts', 'const x = 1\n')
      await ws.writeFile(sid, 'default', 'readme.md', '# hi\n')

      const allPy = await ws.globFiles(sid, 'default', '**/*.py')
      assert.equal(allPy.count, 2)
      assert.ok(allPy.files.includes('src/a.py'))
      assert.ok(allPy.files.includes('src/b.py'))
      assert.equal(allPy.truncated, undefined)

      const trunc = await ws.globFiles(sid, 'default', '**/*', { max_results: 2 })
      assert.equal(trunc.count, 2)
      assert.equal(trunc.truncated, true)
    })
  })

  test('workspace_grep AND/OR keywords and pattern', async () => {
    await withTmpDataDir(async () => {
      const ws = new WorkspaceService()
      const sid = 'sess-grep-1'
      await ws.ensureDefaultRoot(sid)
      await ws.mkdir(sid, 'default', 'lib')
      await ws.writeFile(
        sid,
        'default',
        'lib/foo.ts',
        'export function alpha() {}\nexport function beta() {}\nconst alpha_beta = 1\n',
      )
      const grants = await ws.listGrants(sid)
      const def = grants.find(g => g.is_default)
      assert.ok(def)
      await fs.writeFile(path.join(def.abs_path, 'lib', 'skip.bin'), Buffer.from([0, 1, 2, 0, 9]))

      const andHits = await ws.grepFiles(sid, 'default', {
        keywords: 'alpha beta',
        matchMode: 'and',
      })
      assert.equal(andHits.count, 1)
      assert.equal(andHits.hits[0].line, 3)
      assert.match(andHits.hits[0].path, /foo\.ts$/)

      const orHits = await ws.grepFiles(sid, 'default', {
        keywords: 'alpha beta',
        matchMode: 'or',
      })
      assert.ok(orHits.count >= 2)

      const reHits = await ws.grepFiles(sid, 'default', {
        pattern: 'function\\s+alpha',
        glob: '**/*.ts',
      })
      assert.equal(reHits.count, 1)
      assert.equal(reHits.hits[0].line, 1)

      const noBin = await ws.grepFiles(sid, 'default', {
        pattern: 'alpha',
        glob: '**/*',
      })
      assert.ok(noBin.hits.every(h => !h.path.endsWith('.bin')))
    })
  })

  test('workspace_grep/glob reject path escape and unknown root', async () => {
    await withTmpDataDir(async () => {
      const ws = new WorkspaceService()
      const sid = 'sess-deny-1'
      await ws.ensureDefaultRoot(sid)
      await ws.writeFile(sid, 'default', 'ok.txt', 'hello\n')

      await assert.rejects(
        () => ws.globFiles(sid, 'default', '*.txt', { path: '../outside' }),
        (err) => err instanceof PathEscapeError || err instanceof WorkspaceError,
      )
      await assert.rejects(
        () => ws.grepFiles(sid, 'default', { keywords: 'hello', path: '../../opptrix.db' }),
        (err) => err instanceof PathEscapeError || err instanceof WorkspaceError,
      )
      await assert.rejects(
        () => ws.globFiles(sid, 'no_such_root', '*.txt'),
        /未知 root_id/,
      )
    })
  })

  test('workspace_grep truncates at max_hits', async () => {
    await withTmpDataDir(async () => {
      const ws = new WorkspaceService()
      const sid = 'sess-trunc-1'
      await ws.ensureDefaultRoot(sid)
      const lines = Array.from({ length: 30 }, (_, i) => `hit line ${i} MARKER`).join('\n')
      await ws.writeFile(sid, 'default', 'many.txt', `${lines}\n`)

      const r = await ws.grepFiles(sid, 'default', {
        keywords: 'MARKER',
        maxHits: 5,
      })
      assert.equal(r.count, 5)
      assert.equal(r.truncated, true)
    })
  })
})
