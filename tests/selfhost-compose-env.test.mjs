import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  isSensitiveEnvKey,
  maskEnvValue,
  parseEnvLine,
  parseEnvSetTokens,
  patchComposeEnvLines,
  quoteEnvValue,
  readComposeEnvMap,
  unquoteEnvValue,
  writeComposeEnvPatch,
} from '../packages/selfhost/src/compose-env.mjs'

test('parseEnvLine and quoting', () => {
  assert.deepEqual(parseEnvLine('FOO=bar'), { key: 'FOO', rawValue: 'bar' })
  assert.deepEqual(parseEnvLine('export BAZ=1'), { key: 'BAZ', rawValue: '1' })
  assert.equal(parseEnvLine('# comment'), null)

  assert.equal(unquoteEnvValue('"a b"'), 'a b')
  assert.equal(unquoteEnvValue("'x'"), 'x')
  assert.equal(quoteEnvValue('plain'), 'plain')
  assert.equal(quoteEnvValue('has space'), '"has space"')
})

test('patchComposeEnvLines preserves comments and upserts keys', () => {
  const input = [
    '# header',
    'KEEP=1',
    'CHANGE=old',
    '',
    '# tail',
  ]
  const out = patchComposeEnvLines(input, {
    set: { CHANGE: 'new', ADD: 'yes' },
    unset: ['MISSING'],
  })
  assert.deepEqual(out, [
    '# header',
    'KEEP=1',
    'CHANGE=new',
    '',
    '# tail',
    'ADD=yes',
  ])
  const map = readComposeEnvMap(out.join('\n'))
  assert.equal(map.get('CHANGE'), 'new')
  assert.equal(map.get('ADD'), 'yes')
})

test('writeComposeEnvPatch round-trips on disk', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-env-'))
  const file = path.join(dir, 'compose.env')
  fs.writeFileSync(file, 'A=1\n# note\nB=two\n', 'utf8')
  writeComposeEnvPatch(file, { set: { B: 'updated', C: 'three' }, unset: [] })
  const text = fs.readFileSync(file, 'utf8')
  assert.match(text, /^A=1/m)
  assert.match(text, /# note/)
  assert.match(text, /^B=updated/m)
  assert.match(text, /^C=three/m)
})

test('parseEnvSetTokens validates KEY=VALUE', () => {
  const ok = parseEnvSetTokens(['FOO=bar', 'NUM=42'])
  assert.deepEqual(ok.entries, { FOO: 'bar', NUM: '42' })
  assert.deepEqual(ok.errors, [])

  const bad = parseEnvSetTokens(['nope', '1bad=x'])
  assert.deepEqual(bad.entries, {})
  assert.equal(bad.errors.length, 2)
})

test('maskEnvValue hides secrets', () => {
  assert.equal(isSensitiveEnvKey('LLM_API_KEY'), true)
  assert.equal(isSensitiveEnvKey('OPPTRIX_UPDATE_CHECK_INTERVAL_HOURS'), false)
  assert.match(maskEnvValue('LLM_API_KEY', 'sk-abcdefghij'), /^sk…/)
})
