import assert from 'node:assert/strict'
import test from 'node:test'

/** 与 client-ui/src/market/watchlistQuotePrefetch.ts 镜像 */

function quotePatchKeys(item, ref, quote) {
  const code = ref.market === 'CN' ? `CN:${ref.exchange ?? 'SZ'}.${ref.symbol}` : ref.symbol
  const rowKey = code
  return {
    [code]: quote,
    [rowKey]: quote,
    [item.code]: quote,
  }
}

function buildWatchlistAddedPricePatch(item, ref, addedPrice) {
  const code = ref.market === 'CN' ? `CN:${ref.exchange ?? 'SZ'}.${ref.symbol}` : ref.symbol
  const quote = {
    code,
    name: item.name ?? code,
    price: addedPrice,
    changePct: null,
  }
  return quotePatchKeys(item, ref, quote)
}

test('buildWatchlistAddedPricePatch exposes snapshot price under row keys', () => {
  const ref = { market: 'CN', assetClass: 'ETF', symbol: '159855', exchange: 'SZ' }
  const item = { code: 'CN:SZ.159855', name: '游戏 ETF' }
  const patch = buildWatchlistAddedPricePatch(item, ref, 1.05)
  assert.equal(patch['CN:SZ.159855'].price, 1.05)
  assert.equal(patch[item.code].price, 1.05)
})
