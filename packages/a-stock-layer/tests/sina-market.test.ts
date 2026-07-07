import { describe, it, expect } from 'vitest'
import {
  mapSinaExtendedProfile,
  parseSinaExtendedParts,
} from '../src/providers/sinafinance/normalize/quote.js'
import {
  mapSinaMinlineTicks,
  mapSinaMoneyFlow,
  mapSinaTransRows,
} from '../src/providers/sinafinance/normalize/market.js'

describe('parseSinaExtendedParts', () => {
  it('splits comma fields', () => {
    const parts = parseSinaExtendedParts('A,sxny,0.12,0.08')
    expect(parts[0]).toBe('A')
    expect(parts[1]).toBe('sxny')
  })
})

describe('mapSinaExtendedProfile', () => {
  it('maps industry and concepts from _i line', () => {
    const parts = new Array(41).fill('')
    parts[22] = '三峡能源'
    parts[34] = '电力'
    parts[37] = '2771914.38'
    parts[40] = '绿色电力|低价'
    const profile = mapSinaExtendedProfile('600905', parts)
    expect(profile?.name).toBe('三峡能源')
    expect(profile?.industry).toBe('电力')
    expect(profile?.concepts).toEqual(['绿色电力', '低价'])
    expect(profile?.totalMarketCap).toBeCloseTo(27719143800, 0)
  })
})

describe('mapSinaMoneyFlow', () => {
  it('maps net inflow fields', () => {
    const row = mapSinaMoneyFlow('600905', {
      netamount: '-1000000',
      r0x_ratio: '-5.5',
      r0_in: '100',
      r0_out: '200',
      r1_in: '50',
      r1_out: '30',
      opendate: '2026-07-07',
      trade: '3.74',
      changeratio: '-0.0158',
    })
    expect(row?.code).toBe('600905')
    expect(row?.mainNet).toBe(-1000000)
    expect(row?.superLargeNet).toBe(-100)
    expect(row?.date).toBe('2026-07-07')
  })
})

describe('mapSinaTransRows', () => {
  it('maps tick direction', () => {
    const rows = mapSinaTransRows('600905', [['15:00:03', '1000', '3.74', 'DOWN']])
    expect(rows[0]?.direction).toBe('DOWN')
    expect(rows[0]?.price).toBe(3.74)
  })
})

describe('mapSinaMinlineTicks', () => {
  it('maps minute bars', () => {
    const rows = mapSinaMinlineTicks('600905', [{ m: '09:30:00', p: '3.8', v: '1020600' }])
    expect(rows[0]?.time).toBe('09:30:00')
    expect(rows[0]?.price).toBe(3.8)
  })
})
