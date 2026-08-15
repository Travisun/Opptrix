/**
 * DeepSeek DSML 工具标记剥离 / 解析
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  stripDsmlToolMarkup,
  tryParseDsmlToolCalls,
} from '../packages/agent/dist/llm/dsml-tool-markup.js'

const USER_SAMPLE = `根据附件我来查一下。
<｜DSML｜tool_calls>
<｜DSML｜invoke name="read_web">
<｜DSML｜parameter name="attachment_id" string="false">550e8400-e29b-41d4-a716-446655440000</｜DSML｜parameter>
</｜DSML｜invoke>
</｜DSML｜tool_calls>`

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

  it('strips unclosed DSML block from open tag to EOS', () => {
    const raw = `可见正文
<｜DSML｜tool_calls>
<｜DSML｜invoke name="x">
<｜DSML｜parameter name="a">1`
    const out = stripDsmlToolMarkup(raw)
    assert.equal(out.trim(), '可见正文')
    assert.equal(out.includes('DSML'), false)
  })

  it('leaves plain text unchanged', () => {
    const plain = '今天行情不错，建议关注白酒板块。'
    assert.equal(stripDsmlToolMarkup(plain), plain)
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

  it('returns empty toolCalls and unchanged text when no DSML', () => {
    const plain = '无工具调用的普通答复。'
    const { text, toolCalls } = tryParseDsmlToolCalls(plain)
    assert.equal(text, plain)
    assert.deepEqual(toolCalls, [])
  })
})
