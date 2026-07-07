/** CN market providers — explicit re-export from @opptrix/a-stock-layer */
export {
  MarketDataEngine,
  AshareEngine,
  Capability,
  DriverRegistry,
  BaseDriver,
  registerAllDrivers,
  TushareDriver,
  loadTushareConfig,
  isTushareEnabled,
  TushareClient,
  toTsCode,
  fromTsCode,
  normalizeCode,
  toInstrumentRef,
} from '@opptrix/a-stock-layer'

export type { InstrumentRef, Market, AssetClass } from '@opptrix/a-stock-layer'
