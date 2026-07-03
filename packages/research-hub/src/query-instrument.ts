import type { InstrumentRef, ResearchResult } from '@opptrix/shared'
import { instrumentRefFromParams } from '@opptrix/shared'

export type InstrumentQueryCapability =
  | 'snapshot'
  | 'quotes'
  | 'chart_daily'
  | 'capabilities'
  | 'search'

export type InstrumentDispatch = (
  feature: string,
  params: Record<string, unknown>,
) => Promise<ResearchResult>

/** 编排层统一入口 — 按 InstrumentRef + capability 路由 Hub feature */
export async function queryInstrument(
  dispatch: InstrumentDispatch,
  ref: InstrumentRef,
  capability: InstrumentQueryCapability,
  extra: Record<string, unknown> = {},
): Promise<ResearchResult> {
  const base = { instrument: ref, ...extra }
  switch (capability) {
    case 'snapshot':
      return dispatch('instrument_snapshot', base)
    case 'quotes':
      return dispatch('instrument_quotes', { instruments: [ref], ...extra })
    case 'chart_daily':
      return dispatch('instrument_chart', {
        ...base,
        period: extra.period ?? 'daily',
        count: extra.count ?? 120,
      })
    case 'capabilities':
      return dispatch('instrument_capabilities', base)
    case 'search':
      return dispatch('search_local_instruments', {
        keyword: extra.keyword ?? ref.symbol,
        limit: extra.limit ?? 30,
        markets: extra.markets,
      })
    default:
      return {
        success: false,
        data: null,
        message: `未知 capability: ${capability as string}`,
        elapsed: 0,
      }
  }
}

export async function queryInstrumentFromParams(
  dispatch: InstrumentDispatch,
  params: Record<string, unknown>,
  capability: InstrumentQueryCapability,
): Promise<ResearchResult> {
  const ref = instrumentRefFromParams(params)
  if (!ref) {
    return {
      success: false,
      data: null,
      message: 'instrument 或 market+symbol 必填',
      elapsed: 0,
    }
  }
  return queryInstrument(dispatch, ref, capability, params)
}
