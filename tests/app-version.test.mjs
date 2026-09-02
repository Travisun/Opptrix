import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, test } from 'node:test'

import { resolveOpptrixAppVersion } from '../packages/shared/dist/paths.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const serverVersion = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'apps/server/package.json'), 'utf8'),
).version

const savedEnv = process.env.OPPTRIX_APP_VERSION

afterEach(() => {
  if (savedEnv === undefined) delete process.env.OPPTRIX_APP_VERSION
  else process.env.OPPTRIX_APP_VERSION = savedEnv
})

test('resolveOpptrixAppVersion prefers OPPTRIX_APP_VERSION env', () => {
  process.env.OPPTRIX_APP_VERSION = '  9.9.9-test  '
  assert.equal(resolveOpptrixAppVersion(), '9.9.9-test')
})

test('resolveOpptrixAppVersion reads apps/server/package.json when env unset', () => {
  delete process.env.OPPTRIX_APP_VERSION
  assert.equal(resolveOpptrixAppVersion(), serverVersion)
  assert.match(serverVersion, /^\d+\.\d+\.\d+/)
})

test('resolveOpptrixAppVersion ignores blank env and falls back to server package', () => {
  process.env.OPPTRIX_APP_VERSION = '   '
  assert.equal(resolveOpptrixAppVersion(), serverVersion)
})
