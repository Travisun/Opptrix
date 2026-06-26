import fs from 'node:fs'
import path from 'node:path'
import type { StockKline } from '@ni-k/shared'
import { normalizeCode } from '../utils/helpers.js'

const COEFFICIENTS: Record<string, [number, number]> = {
  SH_A_STOCK: [0.01, 0.01], SZ_A_STOCK: [0.01, 0.01],
  SH_INDEX: [0.01, 1], SZ_INDEX: [0.01, 1],
  SH_FUND: [0.001, 1], SZ_FUND: [0.001, 0.01],
  SH_BOND: [0.001, 1], SZ_BOND: [0.001, 0.01],
  SH_B_STOCK: [0.001, 0.01], SZ_B_STOCK: [0.01, 0.01],
}

function securityType(exchange: string, codeHead: string): string {
  if (exchange === 'sz') {
    if (['00', '30'].includes(codeHead)) return 'SZ_A_STOCK'
    if (codeHead === '39') return 'SZ_INDEX'
    if (['15', '16'].includes(codeHead)) return 'SZ_FUND'
    return 'SZ_A_STOCK'
  }
  if (['60', '68'].includes(codeHead)) return 'SH_A_STOCK'
  if (['00', '88', '99'].includes(codeHead)) return 'SH_INDEX'
  if (['50', '51'].includes(codeHead)) return 'SH_FUND'
  return 'SH_A_STOCK'
}

function parseFile(filePath: string, code = ''): StockKline[] {
  const buf = fs.readFileSync(filePath)
  const fname = path.basename(filePath).toLowerCase()
  const exchange = fname.slice(0, 2)
  const codeHead = fname.slice(2, 4)
  const fileCode = code || fname.slice(2, 8)
  const coeff = COEFFICIENTS[securityType(exchange, codeHead)] ?? [0.01, 0.01]
  const rows: StockKline[] = []
  let prevClose: number | null = null

  for (let off = 0; off + 32 <= buf.length; off += 32) {
    const dateInt = buf.readUInt32LE(off)
    const open = buf.readUInt32LE(off + 4) * coeff[0]
    const high = buf.readUInt32LE(off + 8) * coeff[0]
    const low = buf.readUInt32LE(off + 12) * coeff[0]
    const close = buf.readUInt32LE(off + 16) * coeff[0]
    const amount = buf.readFloatLE(off + 20)
    const volume = buf.readUInt32LE(off + 24) * coeff[1]
    const ds = String(dateInt)
    const changePct = prevClose ? ((close - prevClose) / prevClose) * 100 : null
    rows.push({
      code: fileCode,
      date: `${ds.slice(0, 4)}-${ds.slice(4, 6)}-${ds.slice(6, 8)}`,
      open, high, low, close, volume, amount,
      changePct, turnoverRate: null,
    })
    prevClose = close
  }
  return rows
}

/** Offline TDX daily bar reader — mirrors pytdx TdxDailyBarReader */
export class TdxDailyBarReader {
  constructor(private vipdocPath?: string) {}

  resolvePath(code: string, exchange?: string) {
    const c = normalizeCode(code)
    const ex = exchange ?? (c.startsWith('6') || c.startsWith('9') || (c.startsWith('000') && parseInt(c, 10) < 1000) ? 'sh' : 'sz')
    if (!this.vipdocPath) throw new Error('vipdoc path not set')
    return path.join(this.vipdocPath, ex, 'lday', `${ex}${c}.day`)
  }

  readByCode(code: string, exchange?: string) {
    const c = normalizeCode(code)
    return parseFile(this.resolvePath(c, exchange), c)
  }

  readByFile(filePath: string, code = '') {
    if (!fs.existsSync(filePath)) throw new Error(`TDX file not found: ${filePath}`)
    return parseFile(filePath, code)
  }
}

export function readTdxDayFile(filePath: string, code = '') {
  return parseFile(filePath, code)
}
