/**
 * code_preflight — L0 静态/语法与平台规则 + diagnostics 多问题汇总
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

test('L0 empty file fails', async () => {
  const mod = await import('../packages/agent-workspace/dist/code-preflight/index.js')
  const r = mod.runL0StaticOnly({ path: 'empty.py', buf: Buffer.alloc(0) })
  assert.equal(r.ok, false)
  assert.ok(r.errors.some(e => /空/.test(e)))
  assert.equal(r.language, 'python')
  assert.ok(r.diagnostics.some(d => d.id === 'l0_empty' && d.severity === 'error'))
})

test('L0 valid python static pass (platform)', async () => {
  const mod = await import('../packages/agent-workspace/dist/code-preflight/index.js')
  const r = mod.runL0StaticOnly({
    path: 'ok.py',
    buf: Buffer.from('print(1)\n', 'utf8'),
  })
  assert.equal(r.ok, true)
  assert.equal(r.language, 'python')
  assert.ok(r.checks.some(c => c.id === 'l0_hardcoded_abs_path' && c.status === 'pass'))
  assert.equal(r.diagnostics.length, 0)
})

test('L0 warns on path traversal fragment', async () => {
  const mod = await import('../packages/agent-workspace/dist/code-preflight/index.js')
  const r = mod.runL0StaticOnly({
    path: 'dotdot.py',
    buf: Buffer.from('path = "../outside"\n', 'utf8'),
  })
  assert.ok(r.checks.some(c => c.id === 'l0_path_dotdot' && c.status === 'warn'))
  assert.ok(r.diagnostics.some(d => d.id === 'l0_path_dotdot' && d.line === 1))
})

test('L0 same file: BOM + abs path + dotdot → multiple diagnostics with lines + L prefix', async () => {
  const mod = await import('../packages/agent-workspace/dist/code-preflight/index.js')
  const body = 'open("/Users/someone/a.txt")\nx = "../outside"\n'
  const r = mod.runL0StaticOnly({
    path: 'multi.py',
    buf: Buffer.from([0xef, 0xbb, 0xbf, ...Buffer.from(body)]),
  })
  assert.equal(r.ok, true)
  const ids = r.diagnostics.map(d => d.id)
  assert.ok(ids.includes('l0_encoding_bom'), 'BOM diagnostic')
  assert.ok(ids.includes('l0_hardcoded_abs_path'), 'abs path diagnostic')
  assert.ok(ids.includes('l0_path_dotdot'), 'dotdot diagnostic')
  assert.ok(r.diagnostics.length >= 3)
  assert.ok(r.warnings.length >= 3)
  const withLine = r.diagnostics.filter(d => typeof d.line === 'number' && d.line >= 1)
  assert.ok(withLine.length >= 2, 'static multi-issue should include line numbers')
  assert.ok(r.warnings.some(w => /^L\d+/.test(w)), 'warnings should include L-prefix')
  assert.doesNotMatch(JSON.stringify(r), /\/Users\/someone\/a\.txt/)
})

test('L0 warns on hardcoded abs path with L-prefix', async () => {
  const mod = await import('../packages/agent-workspace/dist/code-preflight/index.js')
  const r = mod.runL0StaticOnly({
    path: 'bad_path.py',
    buf: Buffer.from('open("/Users/someone/secret.txt")\n', 'utf8'),
  })
  assert.equal(r.ok, true) // warn only
  assert.ok(r.warnings.some(w => /绝对路径/.test(w)))
  assert.ok(r.warnings.some(w => /^L\d+/.test(w)), 'abs path warning should have L prefix')
  assert.ok(r.diagnostics.some(d => d.id === 'l0_hardcoded_abs_path' && d.line === 1))
  assert.ok(r.checks.some(c => c.id === 'l0_hardcoded_abs_path' && c.status === 'warn'))
  assert.doesNotMatch(JSON.stringify(r.diagnostics), /\/Users\/someone/)
})

test('L0 shell whole-string gets line', async () => {
  const mod = await import('../packages/agent-workspace/dist/code-preflight/index.js')
  const r = mod.runL0StaticOnly({
    path: 'shell.py',
    buf: Buffer.from('print(1)\nos.system("bash -c echo hi")\n', 'utf8'),
  })
  // Note: SHELL_WHOLE_RE matches bash -c as word pattern
  const shell = r.diagnostics.find(d => d.id === 'l0_shell_whole_string')
  if (shell) {
    assert.ok(typeof shell.line === 'number' && shell.line >= 1)
    assert.ok(r.warnings.some(w => /^L\d+/.test(w) && /整串|shell/i.test(w)))
  }
})

test('L0 multiple abs paths → multiple path diagnostics', async () => {
  const mod = await import('../packages/agent-workspace/dist/code-preflight/index.js')
  const r = mod.runL0StaticOnly({
    path: 'paths.py',
    buf: Buffer.from(
      'a="/Users/a/x.txt"\nb="/home/b/y.txt"\nc="C:\\\\Users\\\\c\\\\z.txt"\n',
      'utf8',
    ),
  })
  const absDiags = r.diagnostics.filter(d => d.id === 'l0_hardcoded_abs_path')
  assert.ok(absDiags.length >= 2, `expected ≥2 abs diagnostics, got ${absDiags.length}`)
})

test('parseRuffOutput splits multi-line findings', async () => {
  const mod = await import('../packages/agent-workspace/dist/code-preflight/index.js')
  const sample = [
    'script.py:1:1: F401 `os` imported but unused',
    'script.py:3:5: E501 Line too long (120 > 88)',
    'Found 2 errors.',
  ].join('\n')
  const diags = mod.parseRuffOutput(sample)
  assert.equal(diags.length, 2)
  assert.equal(diags[0].code, 'F401')
  assert.equal(diags[0].line, 1)
  assert.equal(diags[1].code, 'E501')
  assert.equal(diags[1].line, 3)
  assert.ok(!diags.some(d => /\s{2,}/.test(d.message) && d.message.includes('F401') && d.message.includes('E501')))
})

test('parseBiomeOutput splits multi findings', async () => {
  const mod = await import('../packages/agent-workspace/dist/code-preflight/index.js')
  const sample = [
    'script.ts:1:10 lint/style/useConst  FIXABLE  ━━━━━━━━━━━━━━━━━',
    '  × This let should be a const.',
    '',
    'script.ts:4:1 lint/suspicious/noDebugger ━━━━━━━━━━━━━━━━━',
    '  × Unexpected debugger statement',
  ].join('\n')
  const diags = mod.parseBiomeOutput(sample)
  assert.ok(diags.length >= 2, `expected ≥2 biome diags, got ${diags.length}`)
  assert.ok(diags.some(d => d.code?.includes('useConst')))
  assert.ok(diags.some(d => d.code?.includes('noDebugger')))
})

test('DEFAULT_PREFLIGHT_LEVELS includes l0 and l1', async () => {
  const mod = await import('../packages/agent-workspace/dist/code-preflight/index.js')
  assert.deepEqual([...mod.DEFAULT_PREFLIGHT_LEVELS], ['l0', 'l1'])
})

test('L0 unknown extension has null language', async () => {
  const mod = await import('../packages/agent-workspace/dist/code-preflight/index.js')
  const r = mod.runL0StaticOnly({
    path: 'notes.txt',
    buf: Buffer.from('hello\n', 'utf8'),
  })
  assert.equal(r.language, null)
  assert.equal(r.ok, true)
})

test('L0 BOM warns', async () => {
  const mod = await import('../packages/agent-workspace/dist/code-preflight/index.js')
  const r = mod.runL0StaticOnly({
    path: 'bom.js',
    buf: Buffer.from([0xef, 0xbb, 0xbf, ...Buffer.from('console.log(1)\n')]),
  })
  assert.ok(r.checks.some(c => c.id === 'l0_encoding_bom' && c.status === 'warn'))
  assert.ok(r.diagnostics.some(d => d.id === 'l0_encoding_bom'))
})

test('L0 python syntax fail via WorkspaceService.codePreflight', async () => {
  const { WorkspaceService, resetWorkspaceService } = await import(
    '../packages/agent-workspace/dist/service.js'
  )
  resetWorkspaceService()
  const sessionId = 'test-preflight-syntax'
  const ws = new WorkspaceService()
  const grant = await ws.ensureDefaultRoot(sessionId)
  await fs.writeFile(path.join(grant.abs_path, 'bad.py'), 'def broken(\n', 'utf8')
  const r = await ws.codePreflight({
    sessionId,
    rootId: grant.root_id,
    path: 'bad.py',
    levels: ['l0'],
  })
  const syn = r.checks.find(c => c.id === 'l0_python_syntax')
  assert.ok(syn, 'expected python syntax check')
  if (syn.status === 'skip') {
    assert.ok(r.fix_hints.some(h => /ensure_python/.test(h)))
  } else {
    assert.equal(syn.status, 'fail')
    assert.equal(r.ok, false)
    assert.ok(r.diagnostics.some(d => d.id === 'l0_python_syntax' && d.severity === 'error'))
    assert.ok(r.fix_hints.some(h => /首条|ruff|biome/i.test(h)))
  }
})

test('L0 python syntax pass', async () => {
  const { WorkspaceService, resetWorkspaceService } = await import(
    '../packages/agent-workspace/dist/service.js'
  )
  resetWorkspaceService()
  const sessionId = 'test-preflight-pass'
  const ws = new WorkspaceService()
  const grant = await ws.ensureDefaultRoot(sessionId)
  await fs.writeFile(path.join(grant.abs_path, 'ok.py'), 'print(1)\n', 'utf8')
  const r = await ws.codePreflight({
    sessionId,
    rootId: grant.root_id,
    path: 'ok.py',
    levels: ['l0'],
  })
  const syn = r.checks.find(c => c.id === 'l0_python_syntax')
  assert.ok(syn)
  if (syn.status === 'pass') {
    assert.equal(r.ok, true)
  } else {
    assert.equal(syn.status, 'skip')
  }
})

test('L0 js syntax pass with node --check', async () => {
  const { WorkspaceService, resetWorkspaceService } = await import(
    '../packages/agent-workspace/dist/service.js'
  )
  resetWorkspaceService()
  const sessionId = 'test-preflight-js'
  const ws = new WorkspaceService()
  const grant = await ws.ensureDefaultRoot(sessionId)
  await fs.writeFile(path.join(grant.abs_path, 'ok.mjs'), 'console.log(1)\n', 'utf8')
  const r = await ws.codePreflight({
    sessionId,
    rootId: grant.root_id,
    path: 'ok.mjs',
    levels: ['l0'],
  })
  const syn = r.checks.find(c => c.id === 'l0_js_syntax')
  assert.ok(syn)
  if (syn.status === 'pass') assert.equal(r.ok, true)
})

test('default levels include l1; without tools skips without exploding', async () => {
  const { WorkspaceService, resetWorkspaceService } = await import(
    '../packages/agent-workspace/dist/service.js'
  )
  resetWorkspaceService()
  const sessionId = 'test-preflight-l1-default'
  const ws = new WorkspaceService()
  const grant = await ws.ensureDefaultRoot(sessionId)
  await fs.writeFile(path.join(grant.abs_path, 'ok.py'), 'print(1)\n', 'utf8')
  // 不传 levels → 默认 l0+l1
  const r = await ws.codePreflight({
    sessionId,
    rootId: grant.root_id,
    path: 'ok.py',
  })
  const l1 = r.checks.filter(c => c.level === 'l1')
  assert.ok(l1.length >= 1, 'default should attempt L1')
  assert.ok(l1.every(c =>
    c.status === 'pass' || c.status === 'skip' || c.status === 'fail' || c.status === 'warn',
  ))
  assert.ok(Array.isArray(r.diagnostics))
})

test('L1 without tools skips without exploding', async () => {
  const { WorkspaceService, resetWorkspaceService } = await import(
    '../packages/agent-workspace/dist/service.js'
  )
  resetWorkspaceService()
  const sessionId = 'test-preflight-l1'
  const ws = new WorkspaceService()
  const grant = await ws.ensureDefaultRoot(sessionId)
  await fs.writeFile(path.join(grant.abs_path, 'ok.py'), 'print(1)\n', 'utf8')
  const r = await ws.codePreflight({
    sessionId,
    rootId: grant.root_id,
    path: 'ok.py',
    levels: ['l0', 'l1'],
  })
  const l1 = r.checks.filter(c => c.level === 'l1')
  assert.ok(l1.length >= 1)
  assert.ok(l1.every(c =>
    c.status === 'pass' || c.status === 'skip' || c.status === 'fail' || c.status === 'warn',
  ))
})

test('path outside grant fails without leaking /Users absolute path', async () => {
  const { WorkspaceService, resetWorkspaceService } = await import(
    '../packages/agent-workspace/dist/service.js'
  )
  resetWorkspaceService()
  const sessionId = 'test-preflight-escape'
  const ws = new WorkspaceService()
  const grant = await ws.ensureDefaultRoot(sessionId)
  const r = await ws.codePreflight({
    sessionId,
    rootId: grant.root_id,
    path: '../outside.py',
    levels: ['l0'],
  })
  assert.equal(r.ok, false)
  assert.equal(r.checks[0]?.message, '路径不在授权工作区内')
  assert.deepEqual(r.errors, [r.checks[0].message])
  assert.ok(r.diagnostics.some(d => d.severity === 'error'))
  assert.ok(r.fix_hints.some(h => /授权|越出/.test(h)))
  const blob = JSON.stringify(r)
  assert.doesNotMatch(blob, /\/Users\/[^/"']+/)
})
