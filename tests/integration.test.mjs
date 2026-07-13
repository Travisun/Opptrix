import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, test } from 'node:test'
import { pickTestPort, stopProcess, waitForUrl } from './helpers.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
let dataDir = ''

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'opptrix-ci-'))
  process.env.OPPTRIX_DATA_DIR = dataDir
})

after(async () => {
  if (dataDir) {
    await rm(dataDir, { recursive: true, force: true })
  }
})

test('UserDataStore writes and reads documents in SQLite', async () => {
  const { getUserDataStore } = await import('../packages/user-store/dist/index.js')
  const store = getUserDataStore()

  store.setDocument('ci_test', 'doc', { value: 42, label: 'opptrix' })
  const saved = store.getDocument('ci_test', 'doc')
  assert.deepEqual(saved, { value: 42, label: 'opptrix' })

  store.deleteDocument('ci_test', 'doc')
  assert.equal(store.getDocument('ci_test', 'doc'), null)
  store.close()
})

test('API /api/health responds after server boot', async () => {
  const port = pickTestPort()
  const child = spawn(process.execPath, ['apps/server/dist/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      OPPTRIX_DATA_DIR: dataDir,
      STOCK_RESEARCH_HOST: '127.0.0.1',
      STOCK_RESEARCH_PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  try {
    await waitForUrl(`http://127.0.0.1:${port}/api/health`)
    const resp = await fetch(`http://127.0.0.1:${port}/api/health`)
    assert.equal(resp.status, 200)

    const body = await resp.json()
    assert.equal(body.status, 'ok')
    assert.ok(body.tools >= 40, `expected >=40 tools, got ${body.tools}`)
    assert.ok(body.factors >= 25, `expected >=25 factors, got ${body.factors}`)
    assert.equal(typeof body.llm_configured, 'boolean')
  } finally {
    await stopProcess(child)
  }
})

test('API watchlist round-trip persists via user store', async () => {
  const port = pickTestPort()
  const child = spawn(process.execPath, ['apps/server/dist/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      OPPTRIX_DATA_DIR: dataDir,
      STOCK_RESEARCH_HOST: '127.0.0.1',
      STOCK_RESEARCH_PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  try {
    await waitForUrl(`http://127.0.0.1:${port}/api/health`)

    const items = [{
      code: '600519',
      name: '贵州茅台',
      industry: '白酒',
      addedAt: new Date().toISOString(),
      addedPrice: null,
    }]

    const putResp = await fetch(`http://127.0.0.1:${port}/api/watchlist`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    })
    assert.equal(putResp.status, 200)

    const getResp = await fetch(`http://127.0.0.1:${port}/api/watchlist`)
    assert.equal(getResp.status, 200)
    const body = await getResp.json()
    assert.ok(body.success)
    assert.equal(body.data?.items?.length, 1)
    assert.equal(body.data.items[0].code, 'CN:SH.600519')
  } finally {
    await stopProcess(child)
  }
})

test('API PUT /api/data/providers/order saves global provider order', async () => {
  const port = pickTestPort()
  const child = spawn(process.execPath, ['apps/server/dist/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      OPPTRIX_DATA_DIR: dataDir,
      STOCK_RESEARCH_HOST: '127.0.0.1',
      STOCK_RESEARCH_PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  try {
    await waitForUrl(`http://127.0.0.1:${port}/api/health`)

    const listResp = await fetch(`http://127.0.0.1:${port}/api/data/providers`)
    assert.equal(listResp.status, 200)
    const listBody = await listResp.json()
    assert.ok(listBody.success)
    const ids = (listBody.data?.providers ?? []).map(p => p.providerId)
    assert.ok(ids.length >= 2)

    const reversed = [...ids].reverse()
    const putResp = await fetch(`http://127.0.0.1:${port}/api/data/providers/order`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider_ids: reversed }),
    })
    const putText = await putResp.text()
    assert.equal(putResp.status, 200, putText)
    const putBody = JSON.parse(putText)
    assert.ok(putBody.success, putBody.message)
    assert.deepEqual(
      (putBody.data?.providers ?? []).map(p => p.providerId),
      reversed,
    )
  } finally {
    await stopProcess(child)
  }
})
