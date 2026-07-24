/**
 * Sandbox settings — 名单合并、LAN 过滤、校验、askCallback
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  validateSandboxSettingsInput,
  normalizeSandboxDomainLine,
  isPrivateOrLocalHostPattern,
} from '../packages/shared/dist/sandbox-settings.js'
import {
  getMergedRawAllowedDomains,
  getGrantableMergedAllowedDomainsSync,
  isHostInConfiguredAllowlist,
  resetConfiguredAllowedDomainsForTests,
  resetSandboxSettingsStoreForTests,
  saveSandboxSettings,
  getSandboxSettings,
  SessionNetworkEgressStore,
  isEgressHostPreAuthorized,
} from '../packages/agent-workspace/dist/index.js'

async function withTmpDataDir(fn) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'opptrix-sandbox-settings-'))
  const prev = process.env.OPPTRIX_DATA_DIR
  process.env.OPPTRIX_DATA_DIR = tmp
  resetSandboxSettingsStoreForTests()
  resetConfiguredAllowedDomainsForTests()
  try {
    await fn(tmp)
  } finally {
    resetSandboxSettingsStoreForTests()
    resetConfiguredAllowedDomainsForTests()
    if (prev == null) delete process.env.OPPTRIX_DATA_DIR
    else process.env.OPPTRIX_DATA_DIR = prev
    await fs.rm(tmp, { recursive: true, force: true })
  }
}

test('normalizeSandboxDomainLine trims, lowercases, strips brackets and trailing dot', () => {
  assert.equal(normalizeSandboxDomainLine(' Example.COM. '), 'example.com')
  assert.equal(normalizeSandboxDomainLine('[2001:DB8::1]'), '2001:db8::1')
})

test('validateSandboxSettingsInput rejects invalid domain lines', () => {
  const result = validateSandboxSettingsInput({
    allowed_domains: ['ok.example.com', '***bad***'],
    allow_lan_access: false,
  })
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.match(result.error, /格式无效/)
  }
})

test('validateSandboxSettingsInput rejects private hosts when LAN disabled', () => {
  const result = validateSandboxSettingsInput({
    allowed_domains: ['127.0.0.1', 'public.example.com'],
    allow_lan_access: false,
  })
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.match(result.error, /局域网/)
  }
})

test('validateSandboxSettingsInput allows private hosts when LAN enabled', () => {
  const result = validateSandboxSettingsInput({
    allowed_domains: ['192.168.1.10'],
    allow_lan_access: true,
  })
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.deepEqual(result.settings.allowed_domains, ['192.168.1.10'])
    assert.equal(result.settings.allow_lan_access, true)
  }
})

test('isPrivateOrLocalHostPattern detects localhost and RFC1918', () => {
  assert.equal(isPrivateOrLocalHostPattern('localhost'), true)
  assert.equal(isPrivateOrLocalHostPattern('10.0.0.1'), true)
  assert.equal(isPrivateOrLocalHostPattern('example.com'), false)
})

test('getMergedRawAllowedDomains unions env and user settings', async () => {
  await withTmpDataDir(async () => {
    const prev = process.env.OPPTRIX_SHELL_ALLOWED_DOMAINS
    process.env.OPPTRIX_SHELL_ALLOWED_DOMAINS = 'env.example.com'
    resetConfiguredAllowedDomainsForTests()
    saveSandboxSettings({
      allowed_domains: ['user.example.com'],
      allow_lan_access: false,
    })
    const merged = getMergedRawAllowedDomains()
    assert.ok(merged.includes('env.example.com'))
    assert.ok(merged.includes('user.example.com'))
    resetConfiguredAllowedDomainsForTests()
    if (prev == null) delete process.env.OPPTRIX_SHELL_ALLOWED_DOMAINS
    else process.env.OPPTRIX_SHELL_ALLOWED_DOMAINS = prev
  })
})

test('getGrantableMergedAllowedDomainsSync filters private when LAN off', async () => {
  await withTmpDataDir(async () => {
    const prev = process.env.OPPTRIX_SHELL_ALLOWED_DOMAINS
    process.env.OPPTRIX_SHELL_ALLOWED_DOMAINS = '127.0.0.1,public.example.com'
    resetConfiguredAllowedDomainsForTests()
    saveSandboxSettings({ allowed_domains: ['192.168.0.1'], allow_lan_access: false })
    const grantable = getGrantableMergedAllowedDomainsSync()
    assert.ok(!grantable.includes('127.0.0.1'))
    assert.ok(!grantable.includes('192.168.0.1'))
    assert.ok(grantable.includes('public.example.com'))
    resetConfiguredAllowedDomainsForTests()
    if (prev == null) delete process.env.OPPTRIX_SHELL_ALLOWED_DOMAINS
    else process.env.OPPTRIX_SHELL_ALLOWED_DOMAINS = prev
  })
})

test('getGrantableMergedAllowedDomainsSync keeps private when LAN on', async () => {
  await withTmpDataDir(async () => {
    saveSandboxSettings({ allowed_domains: ['192.168.0.5'], allow_lan_access: true })
    const grantable = getGrantableMergedAllowedDomainsSync()
    assert.ok(grantable.includes('192.168.0.5'))
  })
})

test('isHostInConfiguredAllowlist matches user permanent whitelist', async () => {
  await withTmpDataDir(async () => {
    saveSandboxSettings({ allowed_domains: ['trusted.example.com'], allow_lan_access: false })
    assert.equal(isHostInConfiguredAllowlist('trusted.example.com'), true)
    assert.equal(isHostInConfiguredAllowlist('other.example.com'), false)
  })
})

test('saveSandboxSettings persists to preference store', async () => {
  await withTmpDataDir(async () => {
    const saved = saveSandboxSettings({
      allowed_domains: ['api.example.com'],
      allow_lan_access: false,
    })
    assert.equal(saved.ok, true)
    resetSandboxSettingsStoreForTests()
    const loaded = getSandboxSettings()
    assert.deepEqual(loaded.allowed_domains, ['api.example.com'])
    assert.equal(loaded.allow_lan_access, false)
  })
})

test('isEgressHostPreAuthorized uses merged user whitelist', async () => {
  await withTmpDataDir(async () => {
    saveSandboxSettings({ allowed_domains: ['saved.example.com'], allow_lan_access: false })
    const store = new SessionNetworkEgressStore()
    assert.equal(isEgressHostPreAuthorized('s1', 'saved.example.com', store), true)
    assert.equal(isEgressHostPreAuthorized('s1', 'unknown.example.com', store), false)
  })
})

test('sandbox askCallback mock grants session host pre-auth', async () => {
  await withTmpDataDir(async () => {
    const store = new SessionNetworkEgressStore()
    store.grantHost('sess', 'granted.example.com')
    assert.equal(isEgressHostPreAuthorized('sess', 'granted.example.com', store), true)
  })
})
