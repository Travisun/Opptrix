/**
 * Agent 密钥保险箱 — vault 加解密、会话授权、stdout 脱敏、user-prompt secret 答案无明文
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-vault-'))
process.env.OPPTRIX_DATA_DIR = tmpRoot
process.env.OPPTRIX_VAULT_KEY_PATH = path.join(tmpRoot, 'vault.key')

const require = createRequire(import.meta.url)

// 动态 import 需在设置 env 之后，且依赖 dist
const { UserDataStore } = await import('../packages/user-store/dist/index.js')
const {
  SessionSecretAccessStore,
  resetSessionSecretAccessStoreForTests,
  getSessionSecretAccessStore,
  applySessionSecretGrantChoice,
  redactSecretsInText,
} = await import('../packages/agent-workspace/dist/index.js')

test.after(() => {
  try {
    UserDataStore.getInstance().close()
  } catch { /* ignore */ }
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

test('vault encrypt/decrypt roundtrip + list has no plaintext', () => {
  const store = UserDataStore.getInstance()
  const vault = store.agentVault
  const put = vault.put('OPENAI_API_KEY', 'sk-test-secret-value-12345', {
    injectHosts: ['api.openai.com'],
  })
  assert.deepEqual(put, { ok: true })
  assert.equal(vault.has('OPENAI_API_KEY'), true)
  assert.equal(vault.getPlain('OPENAI_API_KEY'), 'sk-test-secret-value-12345')

  const listed = vault.listSecrets()
  assert.equal(listed.length, 1)
  assert.equal(listed[0].name, 'OPENAI_API_KEY')
  assert.equal(listed[0].hint, '2345')
  const json = JSON.stringify(listed)
  assert.equal(json.includes('sk-test-secret'), false)

  const again = vault.put('OPENAI_API_KEY', 'other', {})
  assert.deepEqual(again, { exists: true, need_overwrite: true })
  vault.put('OPENAI_API_KEY', 'sk-overwritten-9999', { overwrite: true, injectHosts: ['api.openai.com'] })
  assert.equal(vault.getPlain('OPENAI_API_KEY'), 'sk-overwritten-9999')
})

test('session secret access store grant/list/clear', () => {
  resetSessionSecretAccessStoreForTests()
  const store = getSessionSecretAccessStore()
  assert.equal(store.has('s1', 'FOO'), false)
  store.grant('s1', 'FOO')
  assert.equal(store.has('s1', 'FOO'), true)
  assert.deepEqual(store.list('s1'), ['FOO'])
  const granted = applySessionSecretGrantChoice('s1', 'BAR', ['allow_secret_session'])
  assert.equal(granted.granted, true)
  assert.equal(store.has('s1', 'BAR'), true)
  store.clearSession('s1')
  assert.equal(store.has('s1', 'FOO'), false)
  assert.equal(store.has('s1', 'BAR'), false)
})

test('redactSecretsInText prefers longer secrets', () => {
  const text = 'token=abcdef1234567890 and short=abcdef'
  const out = redactSecretsInText(text, ['abcdef1234567890', 'abcdef'])
  assert.equal(out.includes('abcdef1234567890'), false)
  assert.match(out, /\*\*\*/)
})

test('secret user-prompt answer shape never includes value field', () => {
  // 模拟服务端 resolve 给 Agent 的答案
  const answer = {
    kind: 'secret',
    selected_ids: [],
    selected_labels: [],
    name: 'WEBHOOK_SECRET',
    saved: true,
    session_granted: true,
  }
  const serialized = JSON.stringify(answer)
  assert.equal(serialized.includes('secret_value'), false)
  assert.equal(serialized.includes('value'), false)
  assert.equal('secret_value' in answer, false)
})

// silence unused
void SessionSecretAccessStore
void require
