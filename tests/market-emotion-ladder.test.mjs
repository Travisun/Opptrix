import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseCnLimitLadder } from '../packages/research-hub/dist/market-emotion-map.js'

describe('parseCnLimitLadder', () => {
  it('parses latest day boards from ths envelope', () => {
    const raw = [{
      item: [{
        date: '2026-08-08',
        boards: {
          two_board: [{ thscode: '600519.SH', name: '贵州茅台' }],
          three_board: [{ thscode: '000001.SZ', name: '平安银行', continue_day_cnt: 3 }],
          seven_over: [],
        },
      }, {
        date: '2026-08-07',
        boards: { two_board: [{ thscode: '300750.SZ', name: '宁德时代' }] },
      }],
      source: 'tonghuashun',
    }]

    const parsed = parseCnLimitLadder(raw)
    assert.ok(parsed)
    assert.equal(parsed.date, '2026-08-08')
    assert.equal(parsed.boards.length, 2)
    assert.equal(parsed.boards[0]?.key, 'two_board')
    assert.equal(parsed.boards[0]?.label, '2板')
    assert.equal(parsed.boards[0]?.items[0]?.code, '600519')
    assert.equal(parsed.boards[1]?.items[0]?.board_num, 3)
  })

  it('returns null for empty payload', () => {
    assert.equal(parseCnLimitLadder(null), null)
    assert.equal(parseCnLimitLadder([]), null)
    assert.equal(parseCnLimitLadder([{ item: [] }]), null)
  })

  it('caps items per board', () => {
    const stocks = Array.from({ length: 12 }, (_, i) => ({
      thscode: `${String(i).padStart(6, '0')}.SH`,
      name: `S${i}`,
    }))
    const raw = [{ item: [{ date: '2026-08-08', boards: { two_board: stocks } }] }]
    const parsed = parseCnLimitLadder(raw)
    assert.equal(parsed?.boards[0]?.items.length, 8)
  })
})
