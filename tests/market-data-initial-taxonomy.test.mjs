import assert from 'node:assert/strict'
import test from 'node:test'
import {
  taxonomyNodeCode,
  taxonomyNodeName,
} from '../packages/market-data/dist/sync/initial-sync.js'

test('taxonomyNodeCode: zzshare plate_code / plateCode', () => {
  const zz = { plate_code: '881101', plate_name: '种植业与林业', plate_type: 14 }
  assert.equal(taxonomyNodeCode(zz, 'industry'), '881101')
  assert.equal(taxonomyNodeName(zz, 'industry'), '种植业与林业')

  const zz2 = { plateCode: '881102', name: '养殖业' }
  assert.equal(taxonomyNodeCode(zz2, 'industry'), '881102')
  assert.equal(taxonomyNodeName(zz2, 'industry'), '养殖业')
})

test('taxonomyNodeCode: stockindex industryCode', () => {
  const si = { industryCode: 'sw001', name: '农林牧渔' }
  assert.equal(taxonomyNodeCode(si, 'industry'), 'sw001')
  assert.equal(taxonomyNodeName(si, 'industry'), '农林牧渔')
})

test('taxonomyNodeCode: board keys', () => {
  const board = { boardKey: 'hsj', name: '沪深京A股' }
  assert.equal(taxonomyNodeCode(board, 'board'), 'hsj')
  assert.equal(taxonomyNodeName(board, 'board'), '沪深京A股')
})
