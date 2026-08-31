import assert from 'node:assert/strict'
import test from 'node:test'
import {
  articleLikelyNeedsChineseTranslation,
  buildTranslatePrompt,
  cleanBlockTranslationOutput,
  splitIntoChunks,
} from '../apps/server/dist/translation-text.js'

test('articleLikelyNeedsChineseTranslation detects foreign text', () => {
  assert.equal(articleLikelyNeedsChineseTranslation('Hello world from Twitter'), true)
  assert.equal(articleLikelyNeedsChineseTranslation('今日 A 股收盘综述'), false)
})

test('buildTranslatePrompt uses HY-MT Chinese template', () => {
  const prompt = buildTranslatePrompt('Hello', 'Chinese')
  assert.match(prompt, /Translate the following segment into Chinese/)
  assert.match(prompt, /Hello/)
})

test('buildTranslatePrompt supports other target languages', () => {
  const prompt = buildTranslatePrompt('Hello', 'French')
  assert.match(prompt, /Translate the following segment into French/)
  assert.match(prompt, /Hello/)
})

test('splitIntoChunks respects max length', () => {
  const long = 'Word '.repeat(200).trim()
  const chunks = splitIntoChunks(long, 120)
  assert.ok(chunks.length > 1)
  for (const chunk of chunks) {
    assert.ok(chunk.length <= 200)
  }
})

test('cleanBlockTranslationOutput strips prompt echo', () => {
  const out = cleanBlockTranslationOutput(
    'Translate the following segment into Chinese, without additional explanation. 免费供应',
    'It is on the house.',
  )
  assert.equal(out, '免费供应')
})
