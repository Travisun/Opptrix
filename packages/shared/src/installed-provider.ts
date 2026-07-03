import type { MarketGroup } from './market-data.js'

/** One row in ~/.opptrix/providers/installed.json or derived from provider.json scan */
export interface InstalledProviderRecord {
  providerId: string
  version: string
  title: string
  subtitle?: string
  marketGroup: MarketGroup
  defaultPriority: number
  /** Absolute path to ~/.opptrix/providers/<providerId> */
  installDir: string
  /** Relative entry path from provider.json (e.g. dist/index.js) */
  entry: string
  installedAt: string
  /** Whether the driver is currently registered in DriverRegistry */
  loaded: boolean
}

/** Persisted index written by the installer at ~/.opptrix/providers/installed.json */
export interface InstalledProvidersIndex {
  schemaVersion: number
  providers: InstalledProviderRecord[]
  updatedAt: string
}
