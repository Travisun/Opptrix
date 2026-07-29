/**
 * OpenAI 兼容根地址拼接契约：不自动补 /v1，不剥路径段。
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { joinOpenAiCompatibleUrl } from '../packages/agent/dist/llm/provider.js'

describe('joinOpenAiCompatibleUrl', () => {
  it('appends relative path without injecting /v1', () => {
    assert.equal(
      joinOpenAiCompatibleUrl('https://api.deepseek.com/v1', 'models'),
      'https://api.deepseek.com/v1/models',
    )
    assert.equal(
      joinOpenAiCompatibleUrl('https://api.deepseek.com/v1/', 'chat/completions'),
      'https://api.deepseek.com/v1/chat/completions',
    )
  })

  it('preserves non-/v1 roots (zhipu v4, longcat openai, google openai bridge)', () => {
    assert.equal(
      joinOpenAiCompatibleUrl('https://open.bigmodel.cn/api/paas/v4', 'models'),
      'https://open.bigmodel.cn/api/paas/v4/models',
    )
    assert.equal(
      joinOpenAiCompatibleUrl('https://api.longcat.chat/openai', 'chat/completions'),
      'https://api.longcat.chat/openai/chat/completions',
    )
    assert.equal(
      joinOpenAiCompatibleUrl(
        'https://generativelanguage.googleapis.com/v1beta/openai',
        'models',
      ),
      'https://generativelanguage.googleapis.com/v1beta/openai/models',
    )
  })

  it('does not rewrite host-only bases by inserting /v1', () => {
    assert.equal(
      joinOpenAiCompatibleUrl('https://api.example.com', 'models'),
      'https://api.example.com/models',
    )
  })

  it('strips trailing slashes only', () => {
    assert.equal(
      joinOpenAiCompatibleUrl('https://api.example.com/v1///', 'models'),
      'https://api.example.com/v1/models',
    )
  })

  it('does not double-append when base already ends with the resource path', () => {
    assert.equal(
      joinOpenAiCompatibleUrl('https://api.example.com/v1/models', 'models'),
      'https://api.example.com/v1/models',
    )
    assert.equal(
      joinOpenAiCompatibleUrl('https://api.example.com/v1/chat/completions', 'chat/completions'),
      'https://api.example.com/v1/chat/completions',
    )
  })
})
