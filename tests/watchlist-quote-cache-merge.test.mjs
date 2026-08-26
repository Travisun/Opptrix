import assert from 'node:assert/strict'
import test from 'node:test'

/**
 * 与 client-ui/src/market/watchlistQuotes.ts 中 merge / 分批语义保持一致：
 * - 成功项覆盖；失败项不抹掉已有价
 * - 看板未返回项保留上一帧
 * - ≥CHUNK 时多批请求；有界并发；单批失败不影响其它批已 merge 的价
 */

const WATCHLIST_QUOTE_CHUNK_SIZE = 40
const WATCHLIST_QUOTE_CHUNK_CONCURRENCY = 2

function mergeWatchlistQuoteRefresh({ prevQuotes, prevFailed, patch, failedMap }) {
  const quotes = { ...prevQuotes, ...patch }
  const failedByKey = { ...prevFailed }
  for (const key of Object.keys(patch)) delete failedByKey[key]
  for (const [key, reason] of Object.entries(failedMap)) {
    if (!(key in patch)) failedByKey[key] = reason
  }
  return { quotes, failedByKey }
}

function mergeWatchlistBoardQuoteRows(items, prev, incoming) {
  const prevByKey = new Map(prev.map(row => [row.key, row]))
  return items.map(item => {
    const hit = incoming.get(item.key)
    if (hit) return hit
    const cached = prevByKey.get(item.key)
    if (cached) return cached
    return { ...item, price: null, changePct: null }
  })
}

function chunkWatchlistInstruments(items, chunkSize = WATCHLIST_QUOTE_CHUNK_SIZE) {
  const size = Math.max(1, Math.floor(chunkSize))
  if (!items.length) return []
  const out = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size))
  }
  return out
}

class WatchlistQuoteBatchAbortError extends Error {
  constructor() {
    super('watchlist_quote_batch_aborted')
    this.name = 'WatchlistQuoteBatchAbortError'
  }
}

function isWatchlistQuoteBatchAbortError(err) {
  return err instanceof WatchlistQuoteBatchAbortError
}

/** 与 classifyWatchlistBatchFailReason 对齐的轻量镜像（测 soft-fail 归类） */
function classifyWatchlistBatchFailReason(message) {
  const raw = String(message ?? '')
  if (/not found|未收录|找不到/i.test(raw)) return 'not_found'
  if (/不支持|unsupported/i.test(raw)) return 'unsupported'
  if (/没有可用|未配置|no[_\s]?provider|暂无.*源|未启用/i.test(raw)) return 'no_provider'
  if (/空|empty|无行情|暂无数据/i.test(raw)) return 'empty'
  return 'error'
}

/**
 * footer 是否应抬红字：仅整轮无成功批且确有硬失败。
 * okCount>0（含软失败已处理）则清 footer。
 */
function shouldRaiseWatchlistQuoteFooter({ okCount, failCount }) {
  return okCount === 0 && failCount > 0
}

async function runWatchlistQuoteBatches(input) {
  const chunks = chunkWatchlistInstruments(
    input.items,
    input.chunkSize ?? WATCHLIST_QUOTE_CHUNK_SIZE,
  )
  const batchCount = chunks.length
  if (!batchCount) return { batchCount: 0, okCount: 0, failCount: 0 }

  const concurrency = Math.max(
    1,
    Math.floor(input.concurrency ?? WATCHLIST_QUOTE_CHUNK_CONCURRENCY),
  )
  let nextIndex = 0
  let okCount = 0
  let failCount = 0

  async function worker() {
    while (true) {
      if (input.shouldAbort?.()) return
      const batchIndex = nextIndex
      nextIndex += 1
      if (batchIndex >= chunks.length) return
      const chunk = chunks[batchIndex]
      try {
        await input.runBatch(chunk, batchIndex)
        okCount += 1
      } catch (err) {
        if (isWatchlistQuoteBatchAbortError(err)) return
        if (input.shouldAbort?.()) return
        failCount += 1
        input.onBatchError?.(err, batchIndex)
      }
    }
  }

  const workerCount = Math.min(concurrency, batchCount)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return { batchCount, okCount, failCount }
}

test('watchlist quote refresh keeps cached price when key fails', () => {
  const merged = mergeWatchlistQuoteRefresh({
    prevQuotes: {
      AAPL: { code: 'AAPL', price: 190, name: 'Apple' },
      MSFT: { code: 'MSFT', price: 400, name: 'Microsoft' },
    },
    prevFailed: {},
    patch: {
      AAPL: { code: 'AAPL', price: 191, name: 'Apple' },
    },
    failedMap: {
      MSFT: 'error',
      TSLA: 'empty',
    },
  })
  assert.equal(merged.quotes.AAPL.price, 191)
  assert.equal(merged.quotes.MSFT.price, 400)
  assert.equal(merged.failedByKey.MSFT, 'error')
  assert.equal(merged.failedByKey.TSLA, 'empty')
  assert.equal(merged.failedByKey.AAPL, undefined)
})

test('watchlist board rows keep previous price when missing from response', () => {
  const prev = [
    { key: 'US:AAPL', code: 'AAPL', name: 'Apple', market: 'US', price: 190, changePct: 1.2 },
    { key: 'HK:00700', code: '00700', name: '腾讯', market: 'HK', price: 320, changePct: -0.5 },
  ]
  const incoming = new Map([
    ['US:AAPL', { key: 'US:AAPL', code: 'AAPL', name: 'Apple', market: 'US', price: 191, changePct: 1.5 }],
  ])
  const rows = mergeWatchlistBoardQuoteRows(
    [
      { key: 'US:AAPL', code: 'AAPL', name: 'Apple', market: 'US' },
      { key: 'HK:00700', code: '00700', name: '腾讯', market: 'HK' },
    ],
    prev,
    incoming,
  )
  assert.equal(rows[0].price, 191)
  assert.equal(rows[1].price, 320)
  assert.equal(rows[1].changePct, -0.5)
})

test('chunkWatchlistInstruments splits at CHUNK_SIZE with short tail', () => {
  const items = Array.from({ length: 85 }, (_, i) => `s${i}`)
  const chunks = chunkWatchlistInstruments(items, WATCHLIST_QUOTE_CHUNK_SIZE)
  assert.equal(chunks.length, 3)
  assert.equal(chunks[0].length, 40)
  assert.equal(chunks[1].length, 40)
  assert.equal(chunks[2].length, 5)
  assert.deepEqual(chunks[0].slice(0, 2), ['s0', 's1'])
  assert.deepEqual(chunks[2], ['s80', 's81', 's82', 's83', 's84'])
})

test('chunkWatchlistInstruments returns single chunk when under size', () => {
  const items = ['a', 'b', 'c']
  const chunks = chunkWatchlistInstruments(items, WATCHLIST_QUOTE_CHUNK_SIZE)
  assert.equal(chunks.length, 1)
  assert.deepEqual(chunks[0], items)
})

test('progressive batch merge keeps cache when one batch fails', async () => {
  const items = Array.from({ length: 50 }, (_, i) => `s${i}`)
  let quotes = Object.fromEntries(
    items.map(code => [code, { code, price: 10, name: code }]),
  )
  let failedByKey = {}

  const result = await runWatchlistQuoteBatches({
    items,
    chunkSize: 40,
    concurrency: 2,
    runBatch: async (chunk, batchIndex) => {
      if (batchIndex === 1) {
        throw new Error('network')
      }
      const patch = Object.fromEntries(
        chunk.map(code => [code, { code, price: 11, name: code }]),
      )
      const merged = mergeWatchlistQuoteRefresh({
        prevQuotes: quotes,
        prevFailed: failedByKey,
        patch,
        failedMap: {},
      })
      quotes = merged.quotes
      failedByKey = merged.failedByKey
    },
  })

  assert.equal(result.batchCount, 2)
  assert.equal(result.okCount, 1)
  assert.equal(result.failCount, 1)
  // 首批已 merge 为新价
  assert.equal(quotes.s0.price, 11)
  assert.equal(quotes.s39.price, 11)
  // 失败批保留缓存价，不清空
  assert.equal(quotes.s40.price, 10)
  assert.equal(quotes.s49.price, 10)
})

test('runWatchlistQuoteBatches respects concurrency bound and order of starts', async () => {
  const items = Array.from({ length: 5 }, (_, i) => i)
  const active = []
  let maxActive = 0
  const started = []

  await runWatchlistQuoteBatches({
    items,
    chunkSize: 1,
    concurrency: 2,
    runBatch: async (chunk) => {
      started.push(chunk[0])
      active.push(chunk[0])
      maxActive = Math.max(maxActive, active.length)
      await new Promise(r => setTimeout(r, 20))
      active.splice(active.indexOf(chunk[0]), 1)
    },
  })

  assert.equal(maxActive, 2)
  assert.deepEqual(started, [0, 1, 2, 3, 4])
})

test('board progressive merge across batches keeps unfetched rows', () => {
  const items = [
    { key: 'a', code: 'a', name: 'A', market: 'CN' },
    { key: 'b', code: 'b', name: 'B', market: 'CN' },
    { key: 'c', code: 'c', name: 'C', market: 'CN' },
  ]
  let rows = [
    { key: 'a', code: 'a', name: 'A', market: 'CN', price: 1, changePct: 0 },
    { key: 'b', code: 'b', name: 'B', market: 'CN', price: 2, changePct: 0 },
    { key: 'c', code: 'c', name: 'C', market: 'CN', price: 3, changePct: 0 },
  ]

  // 批 1：只更新 a
  rows = mergeWatchlistBoardQuoteRows(
    items,
    rows,
    new Map([['a', { key: 'a', code: 'a', name: 'A', market: 'CN', price: 11, changePct: 1 }]]),
  )
  assert.equal(rows[0].price, 11)
  assert.equal(rows[1].price, 2)
  assert.equal(rows[2].price, 3)

  // 批 2：更新 c；b 仍为缓存
  rows = mergeWatchlistBoardQuoteRows(
    items,
    rows,
    new Map([['c', { key: 'c', code: 'c', name: 'C', market: 'CN', price: 33, changePct: -1 }]]),
  )
  assert.equal(rows[0].price, 11)
  assert.equal(rows[1].price, 2)
  assert.equal(rows[2].price, 33)
})

test('partial batch failure is not whole-table footer failure', async () => {
  const items = Array.from({ length: 50 }, (_, i) => `s${i}`)
  const result = await runWatchlistQuoteBatches({
    items,
    chunkSize: 40,
    concurrency: 2,
    runBatch: async (_chunk, batchIndex) => {
      if (batchIndex === 1) throw new Error('行情暂时繁忙')
    },
  })
  assert.equal(result.okCount, 1)
  assert.equal(result.failCount, 1)
  assert.equal(shouldRaiseWatchlistQuoteFooter(result), false)
})

test('soft-fail merge keeps previous quote and marks failedByKey', () => {
  const reason = classifyWatchlistBatchFailReason('行情获取失败: 熔断冷却中')
  assert.equal(reason, 'error')
  const merged = mergeWatchlistQuoteRefresh({
    prevQuotes: {
      600519: { code: '600519', price: 1800, name: '贵州茅台' },
    },
    prevFailed: {},
    patch: {},
    failedMap: {
      600519: reason,
    },
  })
  assert.equal(merged.quotes['600519'].price, 1800)
  assert.equal(merged.failedByKey['600519'], 'error')
  // 软失败已处理 → 计入 ok，不应抬整表 footer
  assert.equal(shouldRaiseWatchlistQuoteFooter({ okCount: 1, failCount: 0 }), false)
})

test('abort does not count as ok or fail', async () => {
  const items = Array.from({ length: 3 }, (_, i) => i)
  const result = await runWatchlistQuoteBatches({
    items,
    chunkSize: 1,
    concurrency: 1,
    runBatch: async (_chunk, batchIndex) => {
      if (batchIndex >= 1) throw new WatchlistQuoteBatchAbortError()
    },
  })
  assert.equal(result.okCount, 1)
  assert.equal(result.failCount, 0)
  assert.equal(shouldRaiseWatchlistQuoteFooter(result), false)
})

test('all hard failures raise footer; okCount zero', async () => {
  const result = await runWatchlistQuoteBatches({
    items: ['a', 'b'],
    chunkSize: 1,
    concurrency: 1,
    runBatch: async () => {
      throw new Error('network')
    },
  })
  assert.equal(result.okCount, 0)
  assert.equal(result.failCount, 2)
  assert.equal(shouldRaiseWatchlistQuoteFooter(result), true)
})
