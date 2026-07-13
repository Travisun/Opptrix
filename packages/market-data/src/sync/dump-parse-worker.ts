/**
 * Worker thread: CPU-heavy Parquet → row batch parsing (keeps main process event loop free).
 */
import { parentPort } from 'node:worker_threads'

type DailyKRow = {
  tradeDate: string
  code: string
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  volume: number | null
  amount: number | null
}

function stripThsSuffix(thscode: string): string {
  return thscode.replace(/\.(SH|SZ|BJ)$/i, '').trim()
}

function msToDate(ms: number): string {
  return new Date(ms).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' })
}

async function parseDailyKStream(buffer: Buffer, batchSize: number): Promise<void> {
  const pq = await import('parquet-wasm')
  const Arrow = await import('apache-arrow')
  const pqTable = pq.readParquet(buffer)
  const ipcData = pqTable.intoIPCStream()
  const arrowTable = Arrow.tableFromIPC(ipcData)

  const numRows = arrowTable.numRows
  parentPort?.postMessage({ type: 'meta', totalRows: numRows })

  const thscodeCol = arrowTable.getChild('thscode')
  const dateCol = arrowTable.getChild('date_ms')
  const openCol = arrowTable.getChild('open_price')
  const highCol = arrowTable.getChild('high_price')
  const lowCol = arrowTable.getChild('low_price')
  const closeCol = arrowTable.getChild('close_price')
  const volumeCol = arrowTable.getChild('volume')
  const amountCol = arrowTable.getChild('turnover')

  let batch: DailyKRow[] = []
  let parsed = 0

  for (let i = 0; i < numRows; i++) {
    const thscode = String(thscodeCol?.get(i) ?? '')
    const code = stripThsSuffix(thscode)
    if (!code || code.length !== 6) continue
    const dateMs = Number(dateCol?.get(i))
    if (!dateMs) continue
    batch.push({
      tradeDate: msToDate(dateMs),
      code,
      open: openCol?.get(i) as number ?? null,
      high: highCol?.get(i) as number ?? null,
      low: lowCol?.get(i) as number ?? null,
      close: closeCol?.get(i) as number ?? null,
      volume: volumeCol?.get(i) as number ?? null,
      amount: amountCol?.get(i) as number ?? null,
    })
    parsed++
    if (batch.length >= batchSize) {
      parentPort?.postMessage({ type: 'batch', rows: batch, parsed })
      batch = []
    }
  }

  if (batch.length) {
    parentPort?.postMessage({ type: 'batch', rows: batch, parsed })
  }
  parentPort?.postMessage({ type: 'done', totalRows: parsed })
}

parentPort?.on('message', (msg: { type: string; buffer?: Buffer; batchSize?: number }) => {
  if (msg.type !== 'parse' || !msg.buffer) return
  const batchSize = msg.batchSize ?? 20_000
  parseDailyKStream(msg.buffer, batchSize).catch(err => {
    parentPort?.postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    })
  })
})
