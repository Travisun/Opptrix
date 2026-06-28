import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const DEFAULT_DIR = path.join(os.homedir(), '.a_stock_layer')

export function marketDataDir(): string {
  const dir = process.env.INNO_MARKET_DATA_DIR ?? DEFAULT_DIR
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function marketDbPath(): string {
  return process.env.INNO_MARKET_DB_PATH ?? path.join(marketDataDir(), 'market.db')
}
