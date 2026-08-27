import type { AssetClass, Market } from '@opptrix/shared'
import type { InstrumentFeeOverrides, PortfolioGlobalFees } from '@opptrix/shared'
import { getUserDataStore } from '@opptrix/user-store'
import type { TradeRecord } from './trade-models.js'
import {
  DEFAULT_PORTFOLIO_GLOBAL_FEES,
  migrateLegacyFeeState,
} from './models.js'
import {
  inferTradeAssetClass,
  portfolioCodeAliases,
  portfolioCodesMatch,
  portfolioDisplayCode,
  portfolioInstrumentRef,
} from './instrument.js'
import { recomputeAllTradeFees, recomputeTradeRecordFees } from './fee-recompute.js'
import {
  loadWatchlistItemsForPurge,
  PORTFOLIO_PURGE_WATCHLIST_ORPHANS_V1,
  purgePortfolioWatchlistOrphans,
} from './purge-watchlist-orphans.js'

const NAMESPACE = 'portfolio'
const DOC_ID = 'default'
const FEE_MARKET_AWARE_KEY = 'portfolio_fee_market_aware_v1'
/** 幂等：trades[].code / instrumentFees 键升格为 Opptrix ID */
export const INSTRUMENT_ID_UNIFY_PORTFOLIO_V1 = 'instrument_id_unify_portfolio_v1'
export { PORTFOLIO_PURGE_WATCHLIST_ORPHANS_V1 } from './purge-watchlist-orphans.js'

interface DbState {
  globalFees: PortfolioGlobalFees
  instrumentFees: Record<string, InstrumentFeeOverrides>
  trades: TradeRecord[]
  nextId: number
}

interface LegacyDbState {
  config?: Partial<import('./models.js').FeeConfig>
  stockConfig?: Record<string, Partial<import('./models.js').FeeConfig>>
  globalFees?: PortfolioGlobalFees
  instrumentFees?: Record<string, InstrumentFeeOverrides>
  trades?: TradeRecord[]
  nextId?: number
}

function defaultState(): DbState {
  return {
    globalFees: structuredClone(DEFAULT_PORTFOLIO_GLOBAL_FEES),
    instrumentFees: {},
    trades: [],
    nextId: 1,
  }
}

/** FUND 与股票类隔离；INDEX 仅匹配 INDEX（裸码别名不可跨类误删） */
function portfolioLedgerFamiliesMatch(a: AssetClass, b: AssetClass): boolean {
  const isFund = (x: AssetClass) => x === 'FUND'
  if (isFund(a) || isFund(b)) return isFund(a) && isFund(b)
  if (a === 'INDEX' || b === 'INDEX') return a === b
  return true
}

function legacyTradeMarket(trade: TradeRecord): Market {
  return trade.market ?? 'CN'
}

function portfolioStartupUpgradesComplete(userStore: ReturnType<typeof getUserDataStore>): boolean {
  return userStore.getMetaFlag(FEE_MARKET_AWARE_KEY)
    && userStore.getMetaFlag(INSTRUMENT_ID_UNIFY_PORTFOLIO_V1)
    && userStore.getMetaFlag(PORTFOLIO_PURGE_WATCHLIST_ORPHANS_V1)
}

function normalizeLoadedState(raw: LegacyDbState): DbState {
  const base = defaultState()
  if (raw.globalFees) {
    return {
      globalFees: raw.globalFees,
      instrumentFees: raw.instrumentFees ?? {},
      trades: raw.trades ?? [],
      nextId: raw.nextId ?? 1,
    }
  }
  const migrated = migrateLegacyFeeState({
    config: raw.config,
    stockConfig: raw.stockConfig,
  })
  return {
    globalFees: migrated.globalFees,
    instrumentFees: migrated.instrumentFees,
    trades: raw.trades ?? [],
    nextId: raw.nextId ?? 1,
  }
}

/** 升格单笔成交：code → Opptrix；补 assetClass / instrument */
export function migratePortfolioTradeInstrumentIdV1(trade: TradeRecord): TradeRecord {
  const market = legacyTradeMarket(trade)
  const ac = inferTradeAssetClass(trade.code, market, trade.assetClass)
  const ref = trade.instrument?.market && trade.instrument.symbol
    ? portfolioInstrumentRef(trade.instrument)
    : portfolioInstrumentRef(trade.code, market, ac)
  return {
    ...trade,
    code: portfolioDisplayCode(ref.symbol, ref.market, ref.assetClass),
    market: ref.market,
    assetClass: ref.assetClass,
    instrument: ref,
  }
}

/** 升格 instrumentFees 键到 Opptrix；同键合并 overrides */
export function migratePortfolioInstrumentFeesV1(
  fees: Record<string, InstrumentFeeOverrides>,
): Record<string, InstrumentFeeOverrides> {
  const next: Record<string, InstrumentFeeOverrides> = {}
  for (const [key, overrides] of Object.entries(fees)) {
    if (!overrides || typeof overrides !== 'object') continue
    const ref = portfolioInstrumentRef(key)
    const opptrix = portfolioDisplayCode(key, ref.market, ref.assetClass)
    const prev = next[opptrix]
    next[opptrix] = prev ? { ...prev, ...structuredClone(overrides) } : structuredClone(overrides)
  }
  return next
}

export function migratePortfolioStateInstrumentIdV1(state: DbState): DbState {
  return {
    ...state,
    trades: state.trades.map(migratePortfolioTradeInstrumentIdV1),
    instrumentFees: migratePortfolioInstrumentFeesV1(state.instrumentFees),
  }
}

export class PortfolioStore {
  private static inst: PortfolioStore | null = null
  private state: DbState

  private constructor() {
    const { state, feesMigrated, instrumentIdMigrated, orphansPurged } = this.load()
    this.state = state
    if (feesMigrated || instrumentIdMigrated || orphansPurged) this.save()
  }

  static getInstance() {
    if (!PortfolioStore.inst) PortfolioStore.inst = new PortfolioStore()
    return PortfolioStore.inst
  }

  private load(): {
    state: DbState
    feesMigrated: boolean
    instrumentIdMigrated: boolean
    orphansPurged: boolean
  } {
    try {
      const userStore = getUserDataStore()
      const raw = userStore.getDocument<LegacyDbState>(NAMESPACE, DOC_ID)
      if (raw) {
        let state = normalizeLoadedState(raw)

        if (portfolioStartupUpgradesComplete(userStore)) {
          return {
            state,
            feesMigrated: false,
            instrumentIdMigrated: false,
            orphansPurged: false,
          }
        }

        const feeFix = this.maybeRecomputeFeesForMarketFix(state)
        state = feeFix.state
        const idFix = this.maybeMigrateInstrumentIdUnify(state)
        const orphanFix = this.maybePurgeWatchlistOrphans(idFix.state)
        return {
          state: orphanFix.state,
          feesMigrated: feeFix.migrated,
          instrumentIdMigrated: idFix.migrated,
          orphansPurged: orphanFix.migrated,
        }
      }
    } catch { /* reset */ }
    return { state: defaultState(), feesMigrated: false, instrumentIdMigrated: false, orphansPurged: false }
  }

  /** 一次性按市场重算费率（修复美股等误用 A 股印花税的历史成交） */
  private maybeRecomputeFeesForMarketFix(state: DbState): { state: DbState; migrated: boolean } {
    const userStore = getUserDataStore()
    if (userStore.getMetaFlag(FEE_MARKET_AWARE_KEY)) return { state, migrated: false }
    const { trades, updated } = recomputeAllTradeFees(
      state.trades,
      state.globalFees,
      state.instrumentFees,
    )
    userStore.setMetaFlag(FEE_MARKET_AWARE_KEY)
    if (updated <= 0) return { state, migrated: false }
    return { state: { ...state, trades }, migrated: true }
  }

  /** 幂等：删除不在当前关注列表中的组合成交残留 */
  private maybePurgeWatchlistOrphans(state: DbState): { state: DbState; migrated: boolean } {
    const userStore = getUserDataStore()
    if (userStore.getMetaFlag(PORTFOLIO_PURGE_WATCHLIST_ORPHANS_V1)) {
      return { state, migrated: false }
    }
    try {
      const watchlistItems = loadWatchlistItemsForPurge()
      const { state: next, removedTrades } = purgePortfolioWatchlistOrphans(state, watchlistItems)
      userStore.setMetaFlag(PORTFOLIO_PURGE_WATCHLIST_ORPHANS_V1)
      if (removedTrades > 0) {
        console.info(`[portfolio] purged ${removedTrades} orphan trade(s) not in watchlist`)
      }
      return { state: next, migrated: removedTrades > 0 }
    } catch (err) {
      console.warn(
        '[portfolio] portfolio_purge_watchlist_orphans_v1 failed; keeping original:',
        err instanceof Error ? err.message : String(err),
      )
      return { state, migrated: false }
    }
  }

  /** 幂等：trades / instrumentFees → Opptrix；二次启动不变 */
  private maybeMigrateInstrumentIdUnify(state: DbState): { state: DbState; migrated: boolean } {
    const userStore = getUserDataStore()
    if (userStore.getMetaFlag(INSTRUMENT_ID_UNIFY_PORTFOLIO_V1)) {
      return { state, migrated: false }
    }
    try {
      const next = migratePortfolioStateInstrumentIdV1(state)
      userStore.setMetaFlag(INSTRUMENT_ID_UNIFY_PORTFOLIO_V1)
      const migrated = JSON.stringify(next.trades) !== JSON.stringify(state.trades)
        || JSON.stringify(next.instrumentFees) !== JSON.stringify(state.instrumentFees)
      return { state: next, migrated }
    } catch (err) {
      console.warn(
        '[portfolio] instrument_id_unify_portfolio_v1 failed; keeping original:',
        err instanceof Error ? err.message : String(err),
      )
      return { state, migrated: false }
    }
  }

  private save() {
    getUserDataStore().setDocument(NAMESPACE, DOC_ID, this.state)
  }

  getGlobalFees(): PortfolioGlobalFees {
    return structuredClone(this.state.globalFees)
  }

  setGlobalFees(globalFees: PortfolioGlobalFees): { globalFees: PortfolioGlobalFees; recalculatedTrades: number } {
    this.state.globalFees = structuredClone(globalFees)
    const recalculatedTrades = this.recomputeAllTradeFees()
    this.save()
    return { globalFees: this.getGlobalFees(), recalculatedTrades }
  }

  private applyRecomputedTrades(trades: TradeRecord[], updated: number): number {
    if (updated <= 0) return 0
    this.state.trades = trades
    return updated
  }

  recomputeAllTradeFees(): number {
    const { trades, updated } = recomputeAllTradeFees(
      this.state.trades,
      this.state.globalFees,
      this.state.instrumentFees,
    )
    return this.applyRecomputedTrades(trades, updated)
  }

  recomputeTradeFeesForCode(code: string, market?: Market, assetClass?: AssetClass): number {
    let updated = 0
    const trades = this.state.trades.map(trade => {
      if (!portfolioCodesMatch(
        trade.code,
        legacyTradeMarket(trade),
        code,
        market,
        inferTradeAssetClass(trade.code, legacyTradeMarket(trade), trade.assetClass),
        assetClass,
      )) {
        return trade
      }
      const next = recomputeTradeRecordFees(trade, this.state.globalFees, this.state.instrumentFees)
      if (
        next.commission !== trade.commission
        || next.stampDuty !== trade.stampDuty
        || next.transferFee !== trade.transferFee
        || next.totalFee !== trade.totalFee
      ) {
        updated += 1
      }
      return next
    })
    return this.applyRecomputedTrades(trades, updated)
  }

  setInstrumentFees(
    code: string,
    market: Market | undefined,
    overrides: InstrumentFeeOverrides,
    assetClass?: AssetClass,
  ): { overrides: InstrumentFeeOverrides; recalculatedTrades: number } {
    const key = portfolioDisplayCode(code, market, assetClass)
    const aliases = portfolioCodeAliases(code, market, assetClass)
    const next = structuredClone(overrides)
    const hasKeys = Object.keys(next).length > 0
    // 清掉旧裸码 / 命名空间键，只保留 Opptrix 权威键
    for (const alias of aliases) {
      delete this.state.instrumentFees[alias]
    }
    if (hasKeys) {
      this.state.instrumentFees[key] = next
    }
    const recalculatedTrades = this.recomputeTradeFeesForCode(code, market, assetClass)
    this.save()
    return { overrides: this.getInstrumentFees(code, market, assetClass), recalculatedTrades }
  }

  /** 读 Opptrix；回退旧裸码 / CN:PF / 命名空间 alias */
  getInstrumentFees(code: string, market?: Market, assetClass?: AssetClass): InstrumentFeeOverrides {
    const aliases = portfolioCodeAliases(code, market, assetClass)
    for (const alias of aliases) {
      const overrides = this.state.instrumentFees[alias]
      if (overrides) return structuredClone(overrides)
    }
    return {}
  }

  /** @deprecated 兼容旧调用 — 映射为 instrument overrides */
  getStockConfig(code: string, market?: Market): InstrumentFeeOverrides {
    return this.getInstrumentFees(code, market)
  }

  addTrade(rec: Omit<TradeRecord, 'id'>): number {
    const id = this.state.nextId++
    this.state.trades.push({ ...rec, id })
    this.save()
    return id
  }

  deleteTrade(id: number) {
    const before = this.state.trades.length
    this.state.trades = this.state.trades.filter(t => t.id !== id)
    this.save()
    return this.state.trades.length < before
  }

  /** Remove all trades and per-stock fee overrides when a watchlist symbol is removed. */
  deleteTradesForCode(code: string, market?: Market, assetClass?: AssetClass) {
    const ref = portfolioInstrumentRef(code, market, assetClass)
    const targetAc = ref.assetClass
    const aliases = portfolioCodeAliases(code, market, assetClass ?? targetAc)
    const before = this.state.trades.length
    this.state.trades = this.state.trades.filter(t => {
      const tMarket = legacyTradeMarket(t)
      const tAc = inferTradeAssetClass(t.code, tMarket, t.assetClass)
      // namespace key 无 assetClass：先按账本族隔离（INDEX / FUND）
      if (!portfolioLedgerFamiliesMatch(tAc, targetAc)) {
        // 仅保留场外基金裸码 ↔ FUND 的兼容删除
        if (
          (tAc === 'FUND' || targetAc === 'FUND')
          && portfolioCodesMatch(t.code, tMarket, code, market, tAc, assetClass ?? targetAc)
        ) {
          return false
        }
        return true
      }
      if (portfolioCodesMatch(t.code, tMarket, code, market, tAc, assetClass ?? targetAc)) {
        return false
      }
      const tDisplay = portfolioDisplayCode(t.code, tMarket, tAc)
      if (aliases.has(t.code) || aliases.has(tDisplay)) return false
      return true
    })
    for (const alias of aliases) {
      delete this.state.instrumentFees[alias]
    }
    this.save()
    return before - this.state.trades.length
  }

  getTrades(code = '', market?: Market): TradeRecord[] {
    const sorted = [...this.state.trades].sort(
      (a, b) => b.tradeDate.localeCompare(a.tradeDate) || b.id - a.id,
    )
    // 无 code 过滤时返回全部（holdings/summary 依赖完整账本；禁止截断历史）
    if (!code.trim()) return sorted
    return sorted
      .filter(t => portfolioCodesMatch(t.code, legacyTradeMarket(t), code, market))
      .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate) || a.id - b.id)
  }

  clearAll() {
    const n = this.state.trades.length
    this.state.trades = []
    this.save()
    return n
  }

  /** Drop singleton without persisting (tests / OPPTRIX_DATA_DIR swap). */
  static resetForTests() {
    PortfolioStore.inst = null
  }
}

export { portfolioInstrumentRef } from './instrument.js'
