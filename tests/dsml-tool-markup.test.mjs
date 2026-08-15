/**
 * DeepSeek DSML 工具标记剥离 / 解析
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  contentLooksLikeDsmlToolMarkup,
  stripDsmlToolMarkup,
  tryParseDsmlToolCalls,
} from '../packages/agent/dist/llm/dsml-tool-markup.js'

const USER_SAMPLE = `根据附件我来查一下。
<｜DSML｜tool_calls>
<｜DSML｜invoke name="read_web">
<｜DSML｜parameter name="attachment_id" string="false">550e8400-e29b-41d4-a716-446655440000</｜DSML｜parameter>
</｜DSML｜invoke>
</｜DSML｜tool_calls>`

const DOUBLE_BAR_SAMPLE = `根据附件更新网页。
<｜｜DSML｜｜tool_calls>
<｜｜DSML｜｜invoke name="update_web">
<｜｜DSML｜｜parameter name="attachment_id">abc-123</｜｜DSML｜｜parameter>
<｜｜DSML｜｜parameter name="title">演示页</｜｜DSML｜｜parameter>
<｜｜DSML｜｜parameter name="html"><div>hello</div></｜｜DSML｜｜parameter>
</｜｜DSML｜｜invoke>
</｜｜DSML｜｜tool_calls>`

const TRIPLE_BAR_SAMPLE = `正在更新网页。
<｜｜｜DSML｜｜｜tool_calls>
<｜｜｜DSML｜｜｜invoke name="update_web">
<｜｜｜DSML｜｜｜parameter name="attachment_id">abc-123</｜｜｜DSML｜｜｜parameter>
<｜｜｜DSML｜｜｜parameter name="title">三竖线</｜｜｜DSML｜｜｜parameter>
</｜｜｜DSML｜｜｜invoke>
</｜｜｜DSML｜｜｜tool_calls>`

const FIVE_BAR_SAMPLE = `五竖线更新。
<｜｜｜｜｜DSML｜｜｜｜｜tool_calls>
<｜｜｜｜｜DSML｜｜｜｜｜invoke name="update_web">
<｜｜｜｜｜DSML｜｜｜｜｜parameter name="attachment_id">abc-123</｜｜｜｜｜DSML｜｜｜｜｜parameter>
<｜｜｜｜｜DSML｜｜｜｜｜parameter name="title">五竖线</｜｜｜｜｜DSML｜｜｜｜｜parameter>
</｜｜｜｜｜DSML｜｜｜｜｜invoke>
</｜｜｜｜｜DSML｜｜｜｜｜tool_calls>`

const ORPHAN_INVOKE_SAMPLE = `可见前言
<｜DSML｜invoke name="update_web">
<｜DSML｜parameter name="attachment_id">abc-123</｜DSML｜parameter>
<｜DSML｜parameter name="title">孤立</｜DSML｜parameter>
</｜DSML｜invoke>`

const UNCLOSED_HTML_SAMPLE = `正在更新。
<｜｜DSML｜｜tool_calls>
<｜｜DSML｜｜invoke name="update_web">
<｜｜DSML｜｜parameter name="attachment_id">abc-123</｜｜DSML｜｜parameter>
<｜｜DSML｜｜parameter name="title">长页</｜｜DSML｜｜parameter>
<｜｜DSML｜｜parameter name="html">
<html><body>
<p>超长未闭合内容</p>
<script>console.log(1)</script>
`

const MARKDOWN_TABLE = `| 列A | 列B |
| --- | --- |
| 价格 | 涨跌 |
今天行情不错，建议关注白酒板块。`

describe('stripDsmlToolMarkup', () => {
  it('strips user-visible DSML tool_calls block (fullwidth)', () => {
    const out = stripDsmlToolMarkup(USER_SAMPLE)
    assert.equal(out.includes('DSML'), false)
    assert.equal(out.includes('tool_calls'), false)
    assert.equal(out.includes('read_web'), false)
    assert.equal(out.includes('attachment_id'), false)
    assert.match(out, /根据附件/)
  })

  it('strips ASCII |DSML| and function_calls variants', () => {
    const raw = `前言
<|DSML|function_calls>
<|DSML|invoke name="search">
<|DSML|parameter name="q">hello</|DSML|parameter>
</|DSML|invoke>
</|DSML|function_calls>
后记`
    const out = stripDsmlToolMarkup(raw)
    assert.equal(out.includes('DSML'), false)
    assert.equal(out.includes('function_calls'), false)
    assert.equal(out.includes('search'), false)
    assert.match(out, /前言/)
    assert.match(out, /后记/)
  })

  it('strips double fullwidth bars DSML (｜｜DSML｜｜)', () => {
    const out = stripDsmlToolMarkup(DOUBLE_BAR_SAMPLE)
    assert.equal(out.includes('DSML'), false)
    assert.equal(out.includes('tool_calls'), false)
    assert.equal(out.includes('update_web'), false)
    assert.equal(out.includes('｜｜'), false)
    assert.match(out, /根据附件更新网页/)
  })

  it('strips triple fullwidth bars DSML (｜｜｜DSML｜｜｜)', () => {
    const out = stripDsmlToolMarkup(TRIPLE_BAR_SAMPLE)
    assert.equal(out.includes('DSML'), false)
    assert.equal(out.includes('tool_calls'), false)
    assert.equal(out.includes('update_web'), false)
    assert.match(out, /正在更新网页/)
  })

  it('strips mixed ASCII/fullwidth bars (<|｜DSML｜| / <｜|DSML|｜)', () => {
    const mixedB = `可见
<|｜DSML｜|tool_calls>
<|｜DSML｜|invoke name="x">
`
    const mixedC = `可见
<｜|DSML|｜tool_calls>
`
    for (const raw of [mixedB, mixedC]) {
      const out = stripDsmlToolMarkup(raw)
      assert.equal(out.trim(), '可见', raw)
      assert.equal(out.includes('DSML'), false, raw)
    }
    // 缺少 `<` 的裸竖线片段不应当 DSML 剥离
    const bare = `可见\n|列A|列B|\n价格 | 涨跌`
    assert.equal(stripDsmlToolMarkup(bare), bare)
  })

  it('strips five fullwidth bars DSML (｜｜｜｜｜DSML｜｜｜｜｜)', () => {
    const out = stripDsmlToolMarkup(FIVE_BAR_SAMPLE)
    assert.equal(out.trim(), '五竖线更新。')
    assert.equal(out.includes('DSML'), false)
    assert.equal(out.includes('update_web'), false)
    assert.equal(out.includes('tool_calls'), false)
  })

  it('strips orphan invoke without tool_calls wrapper', () => {
    const out = stripDsmlToolMarkup(ORPHAN_INVOKE_SAMPLE)
    assert.equal(out.trim(), '可见前言')
    assert.equal(out.includes('DSML'), false)
    assert.equal(out.includes('update_web'), false)
  })

  it('strips unclosed DSML block from open tag to EOS', () => {
    const raw = `可见正文
<｜DSML｜tool_calls>
<｜DSML｜invoke name="x">
<｜DSML｜parameter name="a">1`
    const out = stripDsmlToolMarkup(raw)
    assert.equal(out.trim(), '可见正文')
    assert.equal(out.includes('DSML'), false)
  })

  it('strips unmatched invoke open tag to EOS', () => {
    const raw = `可见
<｜｜DSML｜｜invoke name="update_web">
<｜｜DSML｜｜parameter name="html"><p>leak</p>`
    const out = stripDsmlToolMarkup(raw)
    assert.equal(out.trim(), '可见')
    assert.equal(out.includes('DSML'), false)
    assert.equal(out.includes('update_web'), false)
  })

  it('leaves plain text unchanged', () => {
    const plain = '今天行情不错，建议关注白酒板块。'
    assert.equal(stripDsmlToolMarkup(plain), plain)
  })

  it('does not strip markdown tables or bare pipe text', () => {
    const out = stripDsmlToolMarkup(MARKDOWN_TABLE)
    assert.equal(out, MARKDOWN_TABLE)
    assert.match(out, /列A/)
    assert.match(out, /价格/)
  })
})

describe('tryParseDsmlToolCalls', () => {
  it('parses invoke + parameter into OpenAI-shaped tool_calls', () => {
    const { text, toolCalls } = tryParseDsmlToolCalls(USER_SAMPLE)
    assert.equal(text.includes('DSML'), false)
    assert.match(text, /根据附件/)
    assert.equal(toolCalls.length, 1)
    assert.equal(toolCalls[0].type, 'function')
    assert.equal(toolCalls[0].function.name, 'read_web')
    assert.ok(toolCalls[0].id.startsWith('call_'))
    const args = JSON.parse(toolCalls[0].function.arguments)
    assert.equal(args.attachment_id, '550e8400-e29b-41d4-a716-446655440000')
  })

  it('parses double-bar update_web with id/title/short html', () => {
    const { text, toolCalls } = tryParseDsmlToolCalls(DOUBLE_BAR_SAMPLE)
    assert.equal(text.includes('DSML'), false)
    assert.equal(text.includes('update_web'), false)
    assert.match(text, /根据附件更新网页/)
    assert.equal(toolCalls.length, 1)
    assert.equal(toolCalls[0].function.name, 'update_web')
    const args = JSON.parse(toolCalls[0].function.arguments)
    assert.equal(args.attachment_id, 'abc-123')
    assert.equal(args.title, '演示页')
    assert.equal(args.html, '<div>hello</div>')
  })

  it('parses triple-bar update_web', () => {
    const { text, toolCalls } = tryParseDsmlToolCalls(TRIPLE_BAR_SAMPLE)
    assert.equal(text.includes('DSML'), false)
    assert.equal(toolCalls.length, 1)
    assert.equal(toolCalls[0].function.name, 'update_web')
    const args = JSON.parse(toolCalls[0].function.arguments)
    assert.equal(args.title, '三竖线')
  })

  it('parses five-bar update_web into tool_calls and strips clean', () => {
    const { text, toolCalls } = tryParseDsmlToolCalls(FIVE_BAR_SAMPLE)
    assert.equal(text.trim(), '五竖线更新。')
    assert.equal(text.includes('DSML'), false)
    assert.equal(text.includes('update_web'), false)
    assert.equal(toolCalls.length, 1)
    assert.equal(toolCalls[0].function.name, 'update_web')
    const args = JSON.parse(toolCalls[0].function.arguments)
    assert.equal(args.attachment_id, 'abc-123')
    assert.equal(args.title, '五竖线')
  })

  it('parses orphan invoke without tool_calls into update_web', () => {
    const { text, toolCalls } = tryParseDsmlToolCalls(ORPHAN_INVOKE_SAMPLE)
    assert.equal(text.trim(), '可见前言')
    assert.equal(text.includes('DSML'), false)
    assert.equal(toolCalls.length, 1)
    assert.equal(toolCalls[0].function.name, 'update_web')
    const args = JSON.parse(toolCalls[0].function.arguments)
    assert.equal(args.attachment_id, 'abc-123')
    assert.equal(args.title, '孤立')
  })

  it('parses mixed ASCII/fullwidth bars into tool_calls', () => {
    const raw = `前言
<|｜DSML｜|tool_calls>
<|｜DSML｜|invoke name="update_web">
<|｜DSML｜|parameter name="title">混用</|｜DSML｜|parameter>
</|｜DSML｜|invoke>
</|｜DSML｜|tool_calls>`
    const { text, toolCalls } = tryParseDsmlToolCalls(raw)
    assert.equal(text.includes('DSML'), false)
    assert.match(text, /前言/)
    assert.equal(toolCalls.length, 1)
    assert.equal(toolCalls[0].function.name, 'update_web')
    const args = JSON.parse(toolCalls[0].function.arguments)
    assert.equal(args.title, '混用')
  })

  it('parses unclosed html parameter to EOS and strips visible DSML', () => {
    const { text, toolCalls } = tryParseDsmlToolCalls(UNCLOSED_HTML_SAMPLE)
    assert.equal(text.includes('DSML'), false)
    assert.equal(text.includes('update_web'), false)
    assert.equal(text.includes('tool_calls'), false)
    assert.match(text, /正在更新/)
    assert.equal(toolCalls.length, 1)
    assert.equal(toolCalls[0].function.name, 'update_web')
    const args = JSON.parse(toolCalls[0].function.arguments)
    assert.equal(args.attachment_id, 'abc-123')
    assert.equal(args.title, '长页')
    assert.match(String(args.html), /超长未闭合内容/)
    assert.match(String(args.html), /console\.log\(1\)/)
  })

  it('returns empty toolCalls and unchanged text when no DSML', () => {
    const plain = '无工具调用的普通答复。'
    const { text, toolCalls } = tryParseDsmlToolCalls(plain)
    assert.equal(text, plain)
    assert.deepEqual(toolCalls, [])
  })

  it('does not parse markdown table pipes as tool_calls', () => {
    const { text, toolCalls } = tryParseDsmlToolCalls(MARKDOWN_TABLE)
    assert.equal(text, MARKDOWN_TABLE)
    assert.deepEqual(toolCalls, [])
  })
})

describe('contentLooksLikeDsmlToolMarkup', () => {
  it('detects single and double fullwidth bars', () => {
    assert.equal(contentLooksLikeDsmlToolMarkup(USER_SAMPLE), true)
    assert.equal(contentLooksLikeDsmlToolMarkup(DOUBLE_BAR_SAMPLE), true)
    assert.equal(contentLooksLikeDsmlToolMarkup('普通文本'), false)
  })

  it('detects triple bars, five bars, orphan invoke', () => {
    assert.equal(contentLooksLikeDsmlToolMarkup(TRIPLE_BAR_SAMPLE), true)
    assert.equal(contentLooksLikeDsmlToolMarkup(FIVE_BAR_SAMPLE), true)
    assert.equal(contentLooksLikeDsmlToolMarkup(ORPHAN_INVOKE_SAMPLE), true)
  })

  it('does not treat markdown tables as DSML', () => {
    assert.equal(contentLooksLikeDsmlToolMarkup(MARKDOWN_TABLE), false)
  })
})
