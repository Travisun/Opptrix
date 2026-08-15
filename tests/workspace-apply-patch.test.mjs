/**
 * workspace_apply_patch + exact replace (old_string)
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

test('applyExactReplace: single and replace_all', async () => {
  const { applyExactReplace } = await import(
    '../packages/agent-workspace/dist/line-edit/exact-replace.js'
  )
  const once = applyExactReplace('a\nb\nc\n', 'b', 'B')
  assert.equal(once.ok, true)
  assert.equal(once.replacements, 1)
  assert.equal(once.content, 'a\nB\nc\n')

  const multiFail = applyExactReplace('x x x', 'x', 'y')
  assert.equal(multiFail.ok, false)

  const all = applyExactReplace('x x x', 'x', 'y', { replace_all: true })
  assert.equal(all.ok, true)
  assert.equal(all.replacements, 3)
  assert.equal(all.content, 'y y y')
})

test('parseOpenCodePatch + apply Add/Update/Delete', async () => {
  const {
    parseOpenCodePatch,
    applyParsedPatch,
  } = await import('../packages/agent-workspace/dist/apply-patch.js')

  const files = new Map()
  files.set('keep.txt', 'hello\nworld\n')

  const patch = `*** Begin Patch
*** Add File: new.txt
+alpha
+beta
*** Update File: keep.txt
@@
 hello
-world
+WORLD
*** Delete File: gone.txt
*** End Patch`

  // Delete target must exist
  files.set('gone.txt', 'bye\n')

  const parsed = parseOpenCodePatch(patch)
  assert.equal(parsed.ops.length, 3)

  const result = await applyParsedPatch(parsed, {
    fileExists: async (p) => files.has(p),
    readFile: async (p) => {
      const v = files.get(p)
      if (v == null) throw new Error('missing')
      return v
    },
    writeFile: async (p, content) => {
      files.set(p, content)
    },
    deletePath: async (p) => {
      files.delete(p)
    },
  })
  assert.equal(result.ok, true)
  assert.equal(result.applied, 3)
  assert.equal(files.get('new.txt'), 'alpha\nbeta\n')
  assert.equal(files.get('keep.txt'), 'hello\nWORLD\n')
  assert.equal(files.has('gone.txt'), false)
})

test('WorkspaceService.applyPatch gates path escape', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'opptrix-ws-patch-'))
  process.env.OPPTRIX_DATA_DIR = tmp
  const { WorkspaceService } = await import(
    '../packages/agent-workspace/dist/service.js'
  )
  const ws = new WorkspaceService()
  const sessionId = 'sess-patch-1'
  await ws.ensureDefaultRoot(sessionId)

  const bad = await ws.applyPatch(
    sessionId,
    'default',
    `*** Begin Patch
*** Add File: ../../etc/evil.txt
+nope
*** End Patch`,
  )
  assert.equal(bad.ok, false)
  assert.ok(bad.error || bad.results.some(r => !r.ok))
})

test('WorkspaceService.replaceExact + replaceLines still work', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'opptrix-ws-exact-'))
  process.env.OPPTRIX_DATA_DIR = tmp
  const { WorkspaceService } = await import(
    '../packages/agent-workspace/dist/service.js'
  )
  const ws = new WorkspaceService()
  const sessionId = 'sess-exact-1'
  await ws.ensureDefaultRoot(sessionId)
  await ws.writeFile(sessionId, 'default', 'a.py', 'def f():\n  return 1\n')

  const exact = await ws.replaceExact(
    sessionId,
    'default',
    'a.py',
    'return 1',
    'return 2',
  )
  assert.equal(exact.ok, true)
  assert.equal(exact.replacements, 1)

  const lines = await ws.replaceLines(sessionId, 'default', 'a.py', [
    { start_line: 1, new_text: 'def g():' },
  ])
  assert.equal(lines.ok, true)
  const read = await ws.readFile(sessionId, 'default', 'a.py')
  assert.ok(read.content.includes('def g():'))
  assert.ok(read.content.includes('return 2'))
})
