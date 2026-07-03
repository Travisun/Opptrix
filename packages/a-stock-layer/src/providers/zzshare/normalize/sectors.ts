import { fmtYmd, genericRecords, pick, str, type ZzshareRow } from './common.js'

function withPlateMeta(
  rows: Record<string, unknown>[],
  plateType?: number,
  plateCode = '',
  source = '',
): Record<string, unknown>[] {
  return rows.map(row => ({
    plateType: plateType ?? pick(row, 'plate_type', 'type'),
    plateCode: plateCode || str(pick(row, 'plate_code', 'code', 'b_code')),
    source,
    ...row,
  }))
}

/** plates_list → generic sector records. */
export function mapZzsharePlatesListRows(data: unknown, plateType?: number): Record<string, unknown>[] {
  return withPlateMeta(genericRecords(data), plateType, '', 'plates_list')
}

/** plates_rank → generic ranked sector records. */
export function mapZzsharePlatesRankRows(data: unknown, plateType?: number, dateHint = ''): Record<string, unknown>[] {
  return withPlateMeta(
    genericRecords(data).map(row => ({
      ...row,
      date: fmtYmd(pick(row, 'date', 'date1', 'trade_date')) || dateHint,
      rank: pick(row, 'rank', 'rank_no', 'hot_rank'),
      changePct: pick(row, 'change_pct', 'pct_chg', 'quote_rate'),
      source: 'plates_rank',
    })),
    plateType,
    '',
    'plates_rank',
  )
}

/** plates_stocks → generic constituent records. */
export function mapZzsharePlatesStocksRows(
  data: unknown,
  plateType?: number,
  plateCode = '',
  dateHint = '',
): Record<string, unknown>[] {
  return withPlateMeta(
    genericRecords(data).map(row => ({
      ...row,
      code: str(pick(row, 'code', 'stock_code', 'ts_code', 'symbol')),
      name: str(pick(row, 'name', 'stock_name')),
      date: fmtYmd(pick(row, 'date', 'date1', 'trade_date')) || dateHint,
      source: 'plates_stocks',
    })),
    plateType,
    plateCode,
    'plates_stocks',
  )
}

/** market_plate_stocks → popularity-ranked constituents. */
export function mapZzshareMarketPlateStocksRows(
  data: unknown,
  plateType?: number,
  plateCode = '',
  dateHint = '',
): Record<string, unknown>[] {
  return withPlateMeta(
    genericRecords(data).map(row => ({
      ...row,
      code: str(pick(row, 'code', 'stock_code', 'ts_code', 'symbol')),
      name: str(pick(row, 'name', 'stock_name')),
      rank: pick(row, 'rank', 'hot_rank', 'popularity_rank'),
      date: fmtYmd(pick(row, 'date', 'date1', 'trade_date')) || dateHint,
      source: 'market_plate_stocks',
    })),
    plateType,
    plateCode,
    'market_plate_stocks',
  )
}

export function mapZzshareSectorRows(data: unknown): Record<string, unknown>[] {
  return genericRecords(data)
}
