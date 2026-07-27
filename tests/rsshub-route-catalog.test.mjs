/**
 * RSSHub route-catalog：路径展开、schema v3、拉平叶子、分类解析
 * 依赖：先 npm run build -w @opptrix/agent
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  expandRoutePath,
  resolveRoutePath,
  stripUnfilledOptionalParams,
  listDomainFeeds,
  listDomains,
  searchRoutes,
  resetRsshubRouteCatalogForTests,
  listCategories,
} from '../packages/agent/dist/rsshub/route-catalog.js'

describe('rsshub route-catalog', () => {
  it('stripUnfilledOptionalParams removes trailing optional segments', () => {
    assert.equal(
      stripUnfilledOptionalParams('/wallstreetcn/live/global/:score?'),
      '/wallstreetcn/live/global',
    )
    assert.equal(stripUnfilledOptionalParams('/cls/telegraph/:category?'), '/cls/telegraph')
  })

  it('expandRoutePath: /cls/telegraph/:category? + watch', () => {
    assert.equal(expandRoutePath('/cls/telegraph/:category?', 'watch'), '/cls/telegraph/watch')
  })

  it('expandRoutePath: wallstreetcn live + global strips unused score', () => {
    assert.equal(
      expandRoutePath('/wallstreetcn/live/:category?/:score?', 'global'),
      '/wallstreetcn/live/global',
    )
  })

  it('resolveRoutePath prefers example when no channel', () => {
    assert.equal(
      resolveRoutePath({ path: '/cls/telegraph/:category?', example: '/cls/telegraph' }),
      '/cls/telegraph',
    )
  })

  it('schema meta is v3 with total_channels', () => {
    resetRsshubRouteCatalogForTests()
    const { meta, hint } = listCategories()
    assert.equal(meta.version, '3.0.0')
    assert.ok(typeof meta.total_channels === 'number' && meta.total_channels > 0)
    assert.ok(typeof hint === 'string' && hint.includes('option.id'))
  })

  it('listDomainFeeds(cls.cn) includes 电报 · 看盘 → /cls/telegraph/watch', () => {
    resetRsshubRouteCatalogForTests()
    const res = listDomainFeeds({ domain: 'cls.cn', limit: 100 })
    assert.ok(!res.error, res.error)
    assert.ok(res.total_feeds > 0)
    const watch = res.feeds.find((f) => f.label === '电报 · 看盘')
    assert.ok(watch, `expected 电报 · 看盘, got: ${res.feeds.map((f) => f.label).join(', ')}`)
    assert.equal(watch.path, '/cls/telegraph/watch')
    assert.equal(watch.route_name, '电报')
    assert.equal(watch.channel, '看盘')
  })

  it('searchRoutes finds channel leaf 看盘', () => {
    resetRsshubRouteCatalogForTests()
    const res = searchRoutes({ q: '看盘', limit: 20 })
    assert.ok(res.total_matched > 0)
    const hit = res.routes.find((r) => r.path === '/cls/telegraph/watch')
    assert.ok(hit, 'expected /cls/telegraph/watch hit')
    assert.ok(String(hit.title).includes('看盘'))
  })

  it('listDomains resolves Chinese description 财经/经济/金融', () => {
    resetRsshubRouteCatalogForTests()
    const res = listDomains({ category: '财经/经济/金融' })
    assert.ok(!res.error, res.error)
    assert.equal(res.category, 'finance')
    assert.ok(res.total > 0)
  })

  it('listDomains still accepts English id finance', () => {
    resetRsshubRouteCatalogForTests()
    const res = listDomains({ category: 'finance' })
    assert.ok(!res.error, res.error)
    assert.equal(res.category, 'finance')
    assert.ok(res.total > 0)
  })

  it('listDomains accepts case-insensitive Finance and alias 财经', () => {
    resetRsshubRouteCatalogForTests()
    const a = listDomains({ category: 'Finance' })
    assert.ok(!a.error, a.error)
    assert.equal(a.category, 'finance')
    assert.ok(a.total > 0)
    const b = listDomains({ category: '财经' })
    assert.ok(!b.error, b.error)
    assert.equal(b.category, 'finance')
    assert.ok(b.total > 0)
  })

  it('listDomains unknown category returns error + available categories', () => {
    resetRsshubRouteCatalogForTests()
    const res = listDomains({ category: '不存在' })
    assert.ok(res.error)
    assert.ok(String(res.error).includes('未找到分类'))
    assert.ok(Array.isArray(res.categories) && res.categories.length > 0)
    assert.ok(res.categories.some((c) => c.id === 'finance' && c.description))
    assert.equal(res.total, 0)
  })
})
