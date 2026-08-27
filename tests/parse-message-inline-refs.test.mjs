/**
 * 用户消息内联引用解析：@skill / 名称(NAMESPACE)
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  isInstrumentNamespace,
  isValidSkillName,
  parseMessageInlineRefs,
} from '../client-ui/src/chat/parseMessageInlineRefs.ts'

describe('isValidSkillName', () => {
  it('accepts hyphenated lowercase names', () => {
    assert.equal(isValidSkillName('equity-deep-dive'), true)
    assert.equal(isValidSkillName('a'), true)
  })

  it('rejects illegal names', () => {
    assert.equal(isValidSkillName('PDF-Processing'), false)
    assert.equal(isValidSkillName('bad_name'), false)
    assert.equal(isValidSkillName('-pdf'), false)
    assert.equal(isValidSkillName('pdf-'), false)
    assert.equal(isValidSkillName('pdf--x'), false)
  })
})

describe('isInstrumentNamespace', () => {
  it('accepts OpptrixQuant unified IDs', () => {
    assert.equal(isInstrumentNamespace('CN:STOCK:600519.SH'), true)
    assert.equal(isInstrumentNamespace('US:STOCK:AAPL.US'), true)
    assert.equal(isInstrumentNamespace('HK:STOCK:00700.HK'), true)
    assert.equal(isInstrumentNamespace('CN:ETF:510050.SH'), true)
  })

  it('accepts legacy Stock-index namespaces', () => {
    assert.equal(isInstrumentNamespace('CN:SH.600519'), true)
    assert.equal(isInstrumentNamespace('CN:SZ.000858'), true)
    assert.equal(isInstrumentNamespace('US:NASDAQ.AAPL'), true)
    assert.equal(isInstrumentNamespace('US:AAPL'), true)
    assert.equal(isInstrumentNamespace('HK:00700'), true)
    assert.equal(isInstrumentNamespace('CRYPTO:BINANCE.BTC/USDT'), true)
  })

  it('rejects ordinary paren contents', () => {
    assert.equal(isInstrumentNamespace('上涨'), false)
    assert.equal(isInstrumentNamespace('草稿'), false)
    assert.equal(isInstrumentNamespace('600519'), false)
  })
})

describe('parseMessageInlineRefs', () => {
  it('parses mixed skill + instrument + prose', () => {
    const text = '请分析贵州茅台(CN:SH.600519) 并用 @skill:equity-deep-dive'
    const segs = parseMessageInlineRefs(text)
    // 中文无空格时，名称向前取到空白/起点（与 Composer sendText 粘连一致）
    assert.deepEqual(segs, [
      {
        kind: 'instrument',
        name: '请分析贵州茅台',
        code: 'CN:SH.600519',
        market: null,
      },
      { kind: 'text', value: ' 并用 ' },
      { kind: 'skill', name: 'equity-deep-dive' },
    ])
  })

  it('parses OpptrixQuant ID in instrument chip', () => {
    const text = '请分析 贵州茅台(CN:STOCK:600519.SH) 走势'
    const segs = parseMessageInlineRefs(text)
    assert.deepEqual(segs, [
      { kind: 'text', value: '请分析 ' },
      {
        kind: 'instrument',
        name: '贵州茅台',
        code: 'CN:STOCK:600519.SH',
        market: null,
      },
      { kind: 'text', value: ' 走势' },
    ])
  })

  it('parses US Opptrix ID with market badge', () => {
    const segs = parseMessageInlineRefs('苹果(US:STOCK:AAPL.US)')
    assert.deepEqual(segs, [
      {
        kind: 'instrument',
        name: '苹果',
        code: 'US:STOCK:AAPL.US',
        market: '美股',
      },
    ])
  })

  it('parses instrument after whitespace boundary', () => {
    const text = '请分析 贵州茅台(CN:SH.600519) 走势'
    const segs = parseMessageInlineRefs(text)
    assert.deepEqual(segs, [
      { kind: 'text', value: '请分析 ' },
      {
        kind: 'instrument',
        name: '贵州茅台',
        code: 'CN:SH.600519',
        market: null,
      },
      { kind: 'text', value: ' 走势' },
    ])
  })

  it('keeps invalid @skill as plain text', () => {
    const segs = parseMessageInlineRefs('试试 @skill:Bad_Name 和 @skill:ok-skill')
    assert.deepEqual(segs, [
      { kind: 'text', value: '试试 @skill:Bad_Name 和 ' },
      { kind: 'skill', name: 'ok-skill' },
    ])
  })

  it('does not treat ordinary parentheses as instruments', () => {
    const segs = parseMessageInlineRefs('价格(上涨) 与 备注(草稿) 即可')
    assert.deepEqual(segs, [
      { kind: 'text', value: '价格(上涨) 与 备注(草稿) 即可' },
    ])
  })

  it('parses non-CN market label for chip', () => {
    const segs = parseMessageInlineRefs('苹果(US:NASDAQ.AAPL)')
    assert.deepEqual(segs, [
      {
        kind: 'instrument',
        name: '苹果',
        code: 'US:NASDAQ.AAPL',
        market: '美股',
      },
    ])
  })

  it('parses adjacent instrument chips', () => {
    const segs = parseMessageInlineRefs('贵州茅台(CN:SH.600519)五粮液(CN:SZ.000858)')
    assert.deepEqual(segs, [
      {
        kind: 'instrument',
        name: '贵州茅台',
        code: 'CN:SH.600519',
        market: null,
      },
      {
        kind: 'instrument',
        name: '五粮液',
        code: 'CN:SZ.000858',
        market: null,
      },
    ])
  })
})
