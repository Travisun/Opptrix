import { describe, expect, it } from 'vitest'
import {
  mapTencentBigOrderRows,
  mapTencentFundFlowSeries,
  mapTencentKlineAppNodes,
  mapTencentMinuteKlines,
  mapTencentMinuteTicks,
  mapTencentPlateTagRows,
  mapTencentSmartboxStocks,
  mapTencentSqtRealtime,
  parseTencentScopedMarket,
} from '../src/providers/tencent/normalize/market.js'

describe('mapTencentSqtRealtime', () => {
  it('maps utf8 json array to realtime', () => {
    const q = mapTencentSqtRealtime('300308', [
      '51', '中际旭创', '300308', '1121.90', '1098.92', '1098.00', '292864',
    ])
    expect(q?.code).toBe('300308')
    expect(q?.price).toBe(1121.9)
    expect(q?.preClose).toBe(1098.92)
  })
})

describe('mapTencentMinuteTicks', () => {
  it('parses HHMM price volume amount', () => {
    const rows = mapTencentMinuteTicks('300308', ['0930 1098.00 1435 157563000.00'], '2026-07-07')
    expect(rows[0]?.time).toBe('09:30')
    expect(rows[0]?.price).toBe(1098)
  })
})

describe('mapTencentKlineAppNodes', () => {
  it('maps open/high/low/last nodes', () => {
    const rows = mapTencentKlineAppNodes('300308', [{
      open: '1130.00',
      last: '1116.00',
      high: '1188.01',
      low: '1115.00',
      volume: '32861800',
      amount: '37702362949',
      date: '2026-07-03',
      exchange: '2.96',
    }])
    expect(rows[0]?.date).toBe('2026-07-03')
    expect(rows[0]?.close).toBe(1116)
  })
})

describe('mapTencentFundFlowSeries', () => {
  it('merges today and history by date', () => {
    const rows = mapTencentFundFlowSeries('300308', {
      todayFundFlow: { mainNetIn: '100' },
      fiveDayFundFlow: {
        DayMainNetInList: [{ date: '2026-07-01', mainNetIn: '200' }],
      },
    })
    expect(rows.some(r => r.mainNet === 100)).toBe(true)
    expect(rows.some(r => r.date === '2026-07-01' && r.mainNet === 200)).toBe(true)
  })
})

describe('mapTencentPlateTagRows', () => {
  it('tags industry and concept separately', () => {
    const rows = mapTencentPlateTagRows('300308', {
      plate: [{ id: '1', name: '通信设备' }],
      concept: [{ id: '2', name: '5G概念', zdf: '1.2' }],
    })
    expect(rows.find(r => r.plateType === 'industry')?.plateName).toBe('通信设备')
    expect(rows.find(r => r.plateType === 'concept')?.plateName).toBe('5G概念')
  })
})

describe('mapTencentBigOrderRows', () => {
  it('maps dadan tuple rows', () => {
    const rows = mapTencentBigOrderRows('300308', {
      summary: { date: '20260707' },
      detail: [['15:00:00', '1121.90', '2113', 'S']],
    })
    expect(rows[0]?.side).toBe('S')
    expect(rows[0]?.date).toBe('2026-07-07')
  })
})

describe('mapTencentSmartboxStocks', () => {
  it('strips symbol prefix', () => {
    const rows = mapTencentSmartboxStocks([{ code: 'sz300308', name: '中际旭创', type: 'GP-A-CYB' }])
    expect(rows[0]?.code).toBe('300308')
  })
})

describe('parseTencentScopedMarket', () => {
  it('detects search and stock scopes', () => {
    expect(parseTencentScopedMarket('search:300308').kind).toBe('search')
    expect(parseTencentScopedMarket('stock:600519').value).toBe('600519')
    expect(parseTencentScopedMarket('cyb').kind).toBe('board')
  })
})

describe('mapTencentMinuteKlines', () => {
  it('builds minute bars with datetime', () => {
    const rows = mapTencentMinuteKlines('300308', ['0931 1098.56 9770 1072314709.32'], '2026-07-07')
    expect(rows[0]?.date).toBe('2026-07-07 09:31:00')
    expect(rows[0]?.close).toBe(1098.56)
  })
})
