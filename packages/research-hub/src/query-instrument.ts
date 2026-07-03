import type { InstrumentRef, ResearchResult } from '@opptrix/shared'
import {
  INSTRUMENT_HUB_FEATURE,
  instrumentRefsFromList,
  resolveInstrumentFromParams,
  type InstrumentHubCapability,
} from '@opptrix/shared'

export type InstrumentQueryCapability = InstrumentHubCapability

export type InstrumentDispatch = (
  feature: string,
  params: Record<string, unknown>,
) => Promise<ResearchResult>

function hubFeature(cap: InstrumentQueryCapability): string {
  return INSTRUMENT_HUB_FEATURE[cap]
}

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
      return dispatch(hubFeature('snapshot'), base)
    case 'quotes':
      return dispatch(hubFeature('quotes'), { instruments: [ref], ...extra })
    case 'chart':
      return dispatch(hubFeature('chart'), {
        ...base,
        period: extra.period ?? 'daily',
        count: extra.count ?? 120,
      })
    case 'chart_intraday':
      return dispatch(hubFeature('chart_intraday'), {
        ...base,
        period: extra.period ?? 'intraday',
        count: extra.count ?? 240,
      })
    case 'capabilities':
      return dispatch(hubFeature('capabilities'), base)
    case 'search':
      return dispatch(hubFeature('search'), {
        keyword: extra.keyword ?? ref.symbol,
        limit: extra.limit ?? 30,
        markets: extra.markets,
      })
    case 'cyq':
      return dispatch(hubFeature('cyq'), base)
    case 'institution_rating':
      return dispatch(hubFeature('institution_rating'), base)
    case 'institution_report':
      return dispatch(hubFeature('institution_report'), base)
    case 'evaluation':
      return dispatch(hubFeature('evaluation'), base)
    case 'strategy_signal':
      return dispatch(hubFeature('strategy_signal'), base)
    case 'indicators':
      return dispatch(hubFeature('indicators'), base)
    case 'strategy_verify':
      return dispatch(hubFeature('strategy_verify'), base)
    case 'batch_snapshots':
      return dispatch(hubFeature('batch_snapshots'), {
        instruments: extra.instruments ?? [ref],
        ...extra,
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
  const ref = resolveInstrumentFromParams(params)
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

/** Legacy codes[] → instrument_quotes */
export async function queryInstrumentQuotesFromCodes(
  dispatch: InstrumentDispatch,
  codes: string[],
  extra: Record<string, unknown> = {},
): Promise<ResearchResult> {
  const instruments = instrumentRefsFromList(codes)
  if (!instruments.length) {
    return {
      success: false,
      data: null,
      message: 'codes 必填',
      elapsed: 0,
    }
  }
  return dispatch(INSTRUMENT_HUB_FEATURE.quotes, { instruments, ...extra })
}
