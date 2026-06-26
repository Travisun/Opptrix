declare module 'nodetdx' {
  export interface TdxQuote {
    market: number
    code: string
    lastPrice: number
    preClose: number
    open: number
    high: number
    low: number
    totalVol: number
    volume: number
    amount: number
    serverTime?: string
  }

  export interface TdxBar {
    open: number
    close: number
    high: number
    low: number
    volume: number
    dbvol?: number
    datetime: string
    year: number
    month: number
    day: number
  }

  export class TdxMarketApi {
    constructor(options?: {
      useHeartbeat?: boolean
      heartbeatInterval?: number
      idleTimeout?: number
      maxReconnectTimes?: number
      reconnectInterval?: number
      pingTimeout?: number
      autoSelectBestGateway?: boolean
    })
    connect(host?: string, port?: number): Promise<boolean>
    disconnect(): void
    destroy(): void
    getSecurityQuotes(...symbols: string[]): Promise<TdxQuote[]>
    getSecurityBars(period: string, symbol: string, start: number, count: number): Promise<TdxBar[]>
    getIndexBars(period: string, symbol: string, start: number, count: number): Promise<TdxBar[]>
  }

  export function setLogLevel(level: string): void
}
