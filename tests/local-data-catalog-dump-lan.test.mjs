/**
 * 本地数据目录 / 扶摇 dump / 会话 LAN
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createServer } from 'node:http'
import {
  listLocalDataApis,
  getLocalDataCatalog,
} from '../packages/agent/dist/local-data-catalog.js'
import {
  prepareFuyaoDump,
} from '../packages/market-data/dist/index.js'
import {
  applySessionLanAskChoice,
  isEffectiveLanAllowed,
  resetSessionLanAccessStoreForTests,
  getSessionLanAccessStore,
  saveSandboxSettings,
  resetSandboxSettingsStoreForTests,
  getGrantableMergedAllowedDomainsSync,
  resetConfiguredAllowedDomainsForTests,
} from '../packages/agent-workspace/dist/index.js'

async function withTmpDataDir(fn) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'opptrix-catalog-'))
  const prev = process.env.OPPTRIX_DATA_DIR
  process.env.OPPTRIX_DATA_DIR = tmp
  resetSandboxSettingsStoreForTests()
  resetSessionLanAccessStoreForTests()
  try {
    await fn(tmp)
  } finally {
    if (prev == null) delete process.env.OPPTRIX_DATA_DIR
    else process.env.OPPTRIX_DATA_DIR = prev
    resetSandboxSettingsStoreForTests()
    resetSessionLanAccessStoreForTests()
    await fs.rm(tmp, { recursive: true, force: true })
  }
}

test('list_local_data_apis covers required categories', () => {
  const all = listLocalDataApis()
  assert.ok(all.items.length >= 20)
  for (const cat of [
    'instrument_standard',
    'agent_tools',
    'hub_features',
    'shared_packages',
    'fuyao_dump',
    'workspace_fs',
  ]) {
    assert.ok(all.items.some(i => i.category === cat), `missing category ${cat}`)
  }
  assert.ok(all.items.some(i => i.api_id === 'hub.search_local_instruments' && i.access === 'hub_feature'))
  assert.ok(all.items.some(i => i.api_id === 'cap.realtime'))
  assert.ok(all.items.some(i => i.api_id === 'fuyao.dump'))
})

test('get_local_data_catalog returns how_to_call', () => {
  const detail = getLocalDataCatalog({ api_id: 'fuyao.dump', include_examples: true })
  assert.ok(!('error' in detail))
  assert.match(detail.how_to_call, /prepare_fuyao_dump/)
  assert.ok(detail.examples?.length)
  const hub = getLocalDataCatalog({ api_id: 'hub.search_local_instruments' })
  assert.ok(!('error' in hub))
  assert.equal(hub.access, 'hub_feature')
})

test('prepareFuyaoDump local_path with mock get (no key in result)', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'opptrix-dump-'))
  const dest = path.join(tmp, 'dumps')
  await fs.mkdir(dest, { recursive: true })
  const parquet = Buffer.alloc(8192, 1)
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-length': String(parquet.length) })
    res.end(parquet)
  })
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  const { port } = server.address()
  try {
    const result = await prepareFuyaoDump({
      dumpKind: 'incremental',
      mode: 'local_path',
      forceRefresh: true,
      destDir: dest,
      get: async () => ({
        presigned_url: `http://127.0.0.1:${port}/incr.parquet`,
      }),
    })
    assert.equal(result.ok, true, result.error)
    assert.ok(result.path?.includes('cn-daily-k-incr.parquet'))
    assert.match(result.sandbox_hint, /禁止|勿引导/)
    assert.ok(!JSON.stringify(result).toLowerCase().includes('x-api-key'))
    assert.ok(!JSON.stringify(result).toLowerCase().includes('api_key'))
    const st = await fs.stat(result.path)
    assert.ok(st.size >= 4096)
  } finally {
    server.close()
    await fs.rm(tmp, { recursive: true, force: true })
  }
})

test('prepareFuyaoDump presigned_url mode returns url only', async () => {
  const result = await prepareFuyaoDump({
    dumpKind: 'full',
    mode: 'presigned_url',
    destDir: os.tmpdir(),
    get: async () => ({ download_url: 'https://example.com/full.parquet?sig=1' }),
  })
  assert.equal(result.ok, true)
  assert.equal(result.url, 'https://example.com/full.parquet?sig=1')
  assert.ok(!result.path)
})

test('SessionLanAccessStore effective LAN overrides global off', async () => {
  await withTmpDataDir(async () => {
    const prev = process.env.OPPTRIX_SHELL_ALLOWED_DOMAINS
    process.env.OPPTRIX_SHELL_ALLOWED_DOMAINS = '192.168.1.10,public.example.com'
    resetConfiguredAllowedDomainsForTests()
    saveSandboxSettings({ allowed_domains: ['trusted.example.com'], allow_lan_access: false })
    const sid = 'lan-sess-1'
    assert.equal(isEffectiveLanAllowed(sid), false)
    const without = getGrantableMergedAllowedDomainsSync()
    assert.ok(!without.includes('192.168.1.10'))
    assert.ok(without.includes('public.example.com'))
    const applied = applySessionLanAskChoice(sid, ['allow_lan_session'])
    assert.equal(applied.granted, true)
    assert.equal(isEffectiveLanAllowed(sid), true)
    const withSession = getGrantableMergedAllowedDomainsSync(sid)
    assert.ok(withSession.includes('192.168.1.10'))
    getSessionLanAccessStore().clearSession(sid)
    assert.equal(isEffectiveLanAllowed(sid), false)
    resetConfiguredAllowedDomainsForTests()
    if (prev == null) delete process.env.OPPTRIX_SHELL_ALLOWED_DOMAINS
    else process.env.OPPTRIX_SHELL_ALLOWED_DOMAINS = prev
  })
})
