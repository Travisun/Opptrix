import type { MarketDataStore } from '../store.js'
import { buildLocalListScreenSchema, localListScreen, type LocalListScreenQuery } from './local-list-screen.js'

export type LocalJpScreenQuery = Omit<LocalListScreenQuery, 'market' | 'assetClass'>

export function localJpScreen(store: MarketDataStore, query: LocalJpScreenQuery) {
  return localListScreen(store, { ...query, market: 'JP', assetClass: 'EQUITY' })
}

export function buildLocalJpScreenSchema() {
  return buildLocalListScreenSchema('JP', 'EQUITY')
}

export function localKrScreen(store: MarketDataStore, query: LocalJpScreenQuery) {
  return localListScreen(store, { ...query, market: 'KR', assetClass: 'EQUITY' })
}

export function buildLocalKrScreenSchema() {
  return buildLocalListScreenSchema('KR', 'EQUITY')
}

export function localHkScreen(store: MarketDataStore, query: LocalJpScreenQuery) {
  return localListScreen(store, { ...query, market: 'HK', assetClass: 'EQUITY' })
}

export function buildLocalHkScreenSchema() {
  return buildLocalListScreenSchema('HK', 'EQUITY')
}
