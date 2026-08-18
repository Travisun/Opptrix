/**
 * 网页搜索本机 MCP — 离线单测（禁止打真实搜索引擎）。
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const agentRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../packages/agent/dist/mcp/builtin/websearch',
)

const {
  WEBSEARCH_MCP_TOOLS,
  callWebsearchMcpTool,
  buildSearchUrl,
  composeQuery,
  googleTbs,
  resolveRegion,
  selectEngines,
  queryLooksChinese,
  parseEngineHtml,
  runWebSearch,
  setWebsearchFetchForTests,
  assertAllowedSearchUrl,
  WebsearchFetchError,
  MemoryCookieJar,
  resolveWebsearchMcpStdioTransport,
  ENGINE_DEFS,
  WEBSEARCH_DISCLAIMER,
} = await import(path.join(agentRoot, 'index.js'))

const { resolveToolCapability } = await import(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../packages/agent/dist/mcp/external/capability-catalog.js',
  )
)

const DDG_FIXTURE = `
<!DOCTYPE html><html><body>
<div class="result results_links">
  <a rel="nofollow" class="result__a" href="https://example.com/a">Example A Title</a>
  <a class="result__snippet">Snippet about Example A</a>
</div>
<div class="result results_links">
  <a class="result__a" href="https://example.com/b">Example B</a>
  <a class="result__snippet">Second hit</a>
</div>
</body></html>
`

const BING_FIXTURE = `
<html><body>
<li class="b_algo">
  <h2><a href="https://bing.example/one">Bing One</a></h2>
  <div class="b_caption"><p>Bing snippet one</p></div>
</li>
<li class="b_algo">
  <h2><a href="https://bing.example/two">Bing Two</a></h2>
  <p>Bing snippet two</p>
</li>
</body></html>
`

const VERIFY_FIXTURE = `<html><body>Please verify you are a human captcha</body></html>`

test('WEBSEARCH_MCP_TOOLS lists web_search only', () => {
  assert.deepEqual(
    WEBSEARCH_MCP_TOOLS.map(t => t.name),
    ['web_search'],
  )
  assert.match(WEBSEARCH_MCP_TOOLS[0].description, /公开网页|广域互联网/)
  assert.match(WEBSEARCH_MCP_TOOLS[0].description, /禁止首选|不得当股市主路径/)
  assert.match(WEBSEARCH_MCP_TOOLS[0].description, /问财|query2data|announcement_search/)
  assert.match(WEBSEARCH_MCP_TOOLS[0].description, /不真实或过期/)
  assert.match(WEBSEARCH_MCP_TOOLS[0].description, /browser_navigate/)
})

test('resolveToolCapability(web_search) is null (not search_nl)', () => {
  assert.equal(resolveToolCapability('web_search'), null)
  assert.equal(resolveToolCapability('websearch__web_search'), null)
  assert.equal(resolveToolCapability('query2data'), 'search_nl')
})

test('Chinese query → cn engines; English → global', () => {
  assert.equal(queryLooksChinese('贵州茅台 最新动态'), true)
  assert.equal(resolveRegion('auto', '贵州茅台'), 'cn')
  assert.equal(resolveRegion('auto', 'python tutorial'), 'global')
  const cn = selectEngines('cn')
  assert.ok(cn.some(e => e.id === 'baidu' || e.id === 'bing_cn'))
  assert.ok(cn.every(e => e.region === 'cn'))
  const g = selectEngines('global')
  assert.ok(g.some(e => e.id === 'duckduckgo'))
  assert.ok(g.every(e => e.region === 'global'))
})

test('site/time enter query or Google tbs URL', () => {
  const q = composeQuery({ query: 'react', site: 'github.com', time: 'w', embedTimeInQuery: true })
  assert.match(q, /site:github.com/)
  assert.match(q, /past week/)
  assert.equal(googleTbs('w'), 'qdr:w')
  const googleUrl = buildSearchUrl(ENGINE_DEFS.google, 'ai news', { time: 'w' })
  assert.match(googleUrl, /tbs=qdr:w/)
  assert.match(googleUrl, /q=ai/)
  const ddg = buildSearchUrl(ENGINE_DEFS.duckduckgo, 'privacy', { site: 'example.com' })
  assert.match(ddg, /html\.duckduckgo\.com\/html\/\?q=/)
  assert.match(ddg, /site/)
})

test('DDG/Bing fixture HTML parses ≥1 hit', () => {
  const ddg = parseEngineHtml('duckduckgo', DDG_FIXTURE)
  assert.ok(ddg.length >= 1)
  assert.equal(ddg[0].url, 'https://example.com/a')
  assert.match(ddg[0].title, /Example A/)
  const bing = parseEngineHtml('bing_cn', BING_FIXTURE)
  assert.ok(bing.length >= 1)
  assert.equal(bing[0].url, 'https://bing.example/one')
})

test('empty / verify page → 0 hits; orchestrator still returns structure', async () => {
  assert.deepEqual(parseEngineHtml('duckduckgo', ''), [])
  assert.deepEqual(parseEngineHtml('google', VERIFY_FIXTURE), [])

  setWebsearchFetchForTests(async (input) => {
    const url = String(input)
    if (url.includes('baidu.com') || url.includes('google.com')) {
      return new Response(VERIFY_FIXTURE, { status: 200 })
    }
    if (url.includes('duckduckgo') || url.includes('bing.com') || url.includes('brave') || url.includes('ecosia') || url.includes('so.com') || url.includes('sogou')) {
      return new Response(DDG_FIXTURE, { status: 200, headers: { 'content-type': 'text/html' } })
    }
    return new Response('<html></html>', { status: 200 })
  })
  try {
    const emptyish = await runWebSearch({ query: 'test', region: 'global', limit: 5 })
    assert.equal(typeof emptyish.query, 'string')
    assert.ok(Array.isArray(emptyish.enginesTried))
    assert.ok(Array.isArray(emptyish.hits))
    assert.equal(emptyish.disclaimer, WEBSEARCH_DISCLAIMER)
    assert.ok(!JSON.stringify(emptyish).includes('<html'))
    // DDG fixture should yield hits for global
    assert.ok(emptyish.hits.length >= 1)
  } finally {
    setWebsearchFetchForTests(null)
  }
})

test('allowlist rejects non-engine URL', () => {
  assert.throws(
    () => assertAllowedSearchUrl('https://evil.example/steal'),
    (e) => e instanceof WebsearchFetchError,
  )
  assert.doesNotThrow(() => assertAllowedSearchUrl('https://html.duckduckgo.com/html/?q=x'))
})

test('resolveWebsearchMcpStdioTransport uses execPath + absolute entry', () => {
  const tc = resolveWebsearchMcpStdioTransport()
  assert.equal(tc.transport, 'stdio')
  assert.equal(tc.command, process.execPath)
  assert.ok(Array.isArray(tc.args) && tc.args.length >= 1)
  const entry = tc.args[tc.args.length - 1]
  assert.ok(path.isAbsolute(entry), 'entry must be absolute')
  assert.match(entry, /websearch[/\\]stdio-entry\.(js|ts)$/)
})

test('cookie jar is memory-only (no fs.write of config)', async () => {
  const jar = new MemoryCookieJar()
  jar.absorbSetCookie('html.duckduckgo.com', 'session=abc; Path=/')
  assert.equal(jar.getCookieHeader('html.duckduckgo.com'), 'session=abc')
  jar.clear()
  assert.equal(jar.getCookieHeader('html.duckduckgo.com'), undefined)

  // 源码不写 cookie 到配置文件
  const srcDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../packages/agent/src/mcp/builtin/websearch',
  )
  for (const name of fs.readdirSync(srcDir)) {
    if (!name.endsWith('.ts')) continue
    const text = fs.readFileSync(path.join(srcDir, name), 'utf8')
    assert.doesNotMatch(text, /writeFileSync|fs\.write.*cookie|config\.json/i)
  }
})

test('callWebsearchMcpTool returns structured hits via injected fetch', async () => {
  setWebsearchFetchForTests(async () => new Response(DDG_FIXTURE, { status: 200 }))
  try {
    const result = await callWebsearchMcpTool('web_search', {
      query: 'hello world',
      region: 'global',
      limit: 3,
    })
    assert.ok(result.hits.length >= 1)
    assert.ok(result.hits[0].title)
    assert.ok(result.hits[0].url.startsWith('http'))
    assert.equal(typeof result.hits[0].snippet, 'string')
    assert.equal(result.disclaimer, WEBSEARCH_DISCLAIMER)
    assert.ok(!('html' in result))
  } finally {
    setWebsearchFetchForTests(null)
  }
})

test('runWebSearch always includes disclaimer including empty hits', async () => {
  assert.match(WEBSEARCH_DISCLAIMER, /不真实或过期/)
  const emptyQuery = await runWebSearch({ query: '   ' })
  assert.equal(emptyQuery.hits.length, 0)
  assert.equal(emptyQuery.disclaimer, WEBSEARCH_DISCLAIMER)

  const tooLong = await runWebSearch({ query: 'x'.repeat(500) })
  assert.equal(tooLong.hits.length, 0)
  assert.equal(tooLong.disclaimer, WEBSEARCH_DISCLAIMER)

  setWebsearchFetchForTests(async () => new Response('<html></html>', { status: 200 }))
  try {
    const noHits = await runWebSearch({ query: 'unlikely-no-hits', region: 'global', limit: 3 })
    assert.equal(noHits.hits.length, 0)
    assert.equal(noHits.disclaimer, WEBSEARCH_DISCLAIMER)
  } finally {
    setWebsearchFetchForTests(null)
  }
})

test('Chinese region selects domestic search URLs in orchestration', async () => {
  /** @type {string[]} */
  const seen = []
  setWebsearchFetchForTests(async (input) => {
    seen.push(String(input))
    return new Response(BING_FIXTURE, { status: 200 })
  })
  try {
    await runWebSearch({ query: '人工智能 政策', region: 'auto', limit: 4 })
    assert.ok(seen.some(u => /baidu\.com|cn\.bing\.com|so\.com|sogou\.com/.test(u)))
    assert.ok(!seen.some(u => /duckduckgo\.com|google\.com/.test(u)))
  } finally {
    setWebsearchFetchForTests(null)
  }
})
