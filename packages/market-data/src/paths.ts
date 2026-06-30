import fs from 'node:fs'
import path from 'node:path'
import { resolveUserDataRoot } from '@opptrix/shared'

export function marketDataDir(): string {
  const dir = resolveUserDataRoot()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function marketDbPath(): string {
  return process.env.OPPTRIX_MARKET_DB_PATH ?? path.join(marketDataDir(), 'market.db')
}
