import { normalizeCode } from '../../../../utils/helpers.js'
import { FuyaoClient } from '../../api/client.js'
import { isTonghuashunEnabled } from '../../config.js'
import { toIndexThsCode, toThsCode } from '../../api/symbols.js'
import { mapValuationSnapshotItem } from '../../normalize/index.js'
import type { TonghuashunMarketHandler } from './handler.js'

type Handler = TonghuashunMarketHandler & Record<string, unknown>

const SOURCE = 'tonghuashun' as const

async function withFuyaoClient<T>(fn: (client: FuyaoClient) => Promise<T>): Promise<T | null> {
  if (!isTonghuashunEnabled()) return null
  const client = FuyaoClient.fromConfig()
  if (!client) return null
  try {
    return await fn(client)
  } catch {
    return null
  }
}

function resolveStockThscode(code: string): string {
  const raw = String(code ?? '').trim()
  if (!raw) return ''
  if (raw.includes('.')) return raw
  return toThsCode(raw)
}

function resolveIndexThscode(code: string): string {
  const raw = String(code ?? '').trim()
  if (!raw) return ''
  if (raw.includes('.')) return raw
  return toIndexThsCode(raw)
}

function withSourceRows(items: Record<string, unknown>[]): Record<string, unknown>[] {
  return items.map(row => ({ ...row, source: SOURCE }))
}

function parseCodesArg(codes: string | string[]): string[] {
  if (Array.isArray(codes)) {
    return codes.map(c => normalizeCode(String(c))).filter(Boolean)
  }
  const raw = String(codes ?? '').trim()
  if (!raw) return []
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) {
        return parsed.map(c => normalizeCode(String(c))).filter(Boolean)
      }
    } catch {
      /* fall through */
    }
  }
  return raw.split(/[,，\s]+/).map(c => normalizeCode(c)).filter(Boolean)
}

/**
 * 同花顺富耀 API 自定义方法挂载。
 * 完整 API 文档见 {@link ../../custom-method-docs.ts}；MCP 注册见 `core/custom-methods.ts`。
 */
export function mixTonghuashunExt(Driver: { prototype: TonghuashunMarketHandler }) {
  const p = Driver.prototype as Handler

  /**
   * 同花顺指数/板块目录（按 tag 分类）
   * @sourceUrl https://fuyao.aicubes.cn/api/a-share-index/catalog/ths-index-list
   * @pageUrl https://fuyao.aicubes.cn/
   * @returns Record<string, unknown>[] 含 item 行及 source=tonghuashun
   * @usage engine.invokeCustomMethod("tonghuashun", "thsIndexList", ["cn_concept"])
   * @remarks 须配置富耀 API Key；无数据时返回 null。
   * @param tag cn_concept / region / tszs / industry（可选），默认 "cn_concept"
   * @example {"provider":"tonghuashun","method":"thsIndexList","args":["cn_concept"]}
   */
  p.thsIndexList = async function thsIndexList(
    tag: 'cn_concept' | 'region' | 'tszs' | 'industry' | string = 'cn_concept',
  ) {
    return withFuyaoClient(async client => {
      const data = await client.thsIndexList(tag)
      const rows = withSourceRows(data.item ?? [])
      return rows.length ? rows : null
    })
  }

  /**
   * 同花顺指数/板块成分股列表
   * @sourceUrl https://fuyao.aicubes.cn/api/a-share-index/constituents/ths-stock-list
   * @pageUrl https://fuyao.aicubes.cn/
   * @returns Record<string, unknown>[] 成分股行，含 source=tonghuashun
   * @usage engine.invokeCustomMethod("tonghuashun", "thsIndexConstituents", ["885338.TI"])
   * @remarks 裸指数代码将转为 thscode；无成分时返回 null。
   * @param code 同花顺指数/板块 thscode 或裸代码（必填）
   * @example {"provider":"tonghuashun","method":"thsIndexConstituents","args":["885338.TI"]}
   */
  p.thsIndexConstituents = async function thsIndexConstituents(code: string) {
    const thscode = resolveIndexThscode(code)
    if (!thscode) return null
    return withFuyaoClient(async client => {
      const data = await client.thsIndexConstituents(thscode)
      const rows = withSourceRows(data.item ?? [])
      return rows.length ? rows : null
    })
  }

  /**
   * 财务指标（成长/盈利/偿债/营运/现金流等 abilities 分组）
   * @sourceUrl https://fuyao.aicubes.cn/api/a-share/financials/indicators
   * @pageUrl https://fuyao.aicubes.cn/
   * @returns [{ ...indicatorsPayload, source: "tonghuashun" }]
   * @usage engine.invokeCustomMethod("tonghuashun", "thsFinancialIndicators", ["600519","2024Q3"])
   * @remarks 按单报告期返回；无数据时返回 null。
   * @param code 6 位 A 股代码或 thscode（必填）
   * @param report 报告期，如 2024、2024Q3（必填）
   * @example {"provider":"tonghuashun","method":"thsFinancialIndicators","args":["600519","2024Q3"]}
   */
  p.thsFinancialIndicators = async function thsFinancialIndicators(code: string, report: string) {
    const thscode = resolveStockThscode(code)
    const r = String(report ?? '').trim()
    if (!thscode || !r) return null
    return withFuyaoClient(async client => {
      const data = await client.financialsIndicators(thscode, r)
      if (!data || Object.keys(data).length === 0) return null
      return [{ ...data, source: SOURCE }]
    })
  }

  /**
   * A 股估值快照（PE/PB 等）
   * @sourceUrl https://fuyao.aicubes.cn/api/a-share/valuations/snapshot
   * @pageUrl https://fuyao.aicubes.cn/
   * @returns Record<string, unknown>[] 含 pe/pb（由 pe_ttm/pb_mrq 归一）及 source=tonghuashun
   * @usage engine.invokeCustomMethod("tonghuashun", "thsValuationsSnapshot", ["600519"])
   * @remarks 支持逗号分隔或数组；标准 realtime/batchRealtime 已自动 enrich pe/pb。
   * @param codes 单只代码、逗号分隔多码或 JSON 数组（必填）
   * @example {"provider":"tonghuashun","method":"thsValuationsSnapshot","args":["600519,000001"]}
   */
  p.thsValuationsSnapshot = async function thsValuationsSnapshot(codes: string | string[]) {
    const bareList = parseCodesArg(codes)
    if (!bareList.length) return null
    const thscodes = bareList.map(c => resolveStockThscode(c)).filter(Boolean)
    if (!thscodes.length) return null
    return withFuyaoClient(async client => {
      const data = await client.valuationsSnapshot(thscodes)
      const rows = (data.item ?? []).map(row => {
        const mapped = mapValuationSnapshotItem(row)
        return {
          ...row,
          pe: mapped?.pe ?? null,
          pb: mapped?.pb ?? null,
          ...(mapped?.extras ?? {}),
          source: SOURCE,
        }
      })
      return rows.length ? rows : null
    })
  }

  /**
   * 连板天梯（近 30 个交易日涨停梯队）
   * @sourceUrl https://fuyao.aicubes.cn/api/a-share/special-data/limit-up-ladder
   * @pageUrl https://fuyao.aicubes.cn/
   * @returns [{ ...ladderPayload, source: "tonghuashun" }]
   * @usage engine.invokeCustomMethod("tonghuashun", "thsLimitUpLadder", [])
   * @remarks 覆盖近 30 交易日；无数据时返回 null。
   * @example {"provider":"tonghuashun","method":"thsLimitUpLadder","args":[]}
   */
  p.thsLimitUpLadder = async function thsLimitUpLadder() {
    return withFuyaoClient(async client => {
      const data = await client.limitUpLadder()
      const items = data.item ?? []
      if (!items.length) return null
      return [{ ...data, source: SOURCE }]
    })
  }

  /**
   * 热度飙升榜 Top30
   * @sourceUrl https://fuyao.aicubes.cn/api/a-share/special-data/skyrocket-list
   * @pageUrl https://fuyao.aicubes.cn/
   * @returns Record<string, unknown>[] 热股行，含 source=tonghuashun
   * @usage engine.invokeCustomMethod("tonghuashun", "thsSkyrocketList", ["day"])
   * @remarks period 默认 day；无数据时返回 null。
   * @param period day / hour（可选），默认 "day"
   * @example {"provider":"tonghuashun","method":"thsSkyrocketList","args":["day"]}
   */
  p.thsSkyrocketList = async function thsSkyrocketList(period: 'day' | 'hour' = 'day') {
    return withFuyaoClient(async client => {
      const data = await client.skyrocketList(period)
      const rows = withSourceRows(data.item ?? [])
      return rows.length ? rows : null
    })
  }

  /**
   * 历史热股排行（按自然日）
   * @sourceUrl https://fuyao.aicubes.cn/api/a-share/special-data/hot-stock-list-history
   * @pageUrl https://fuyao.aicubes.cn/
   * @returns Record<string, unknown>[] 热股行，含 source=tonghuashun
   * @usage engine.invokeCustomMethod("tonghuashun", "thsHotStockListHistory", ["2024-01-15"])
   * @remarks date 为 YYYY-MM-DD；无数据时返回 null。
   * @param date 自然日 YYYY-MM-DD（必填）
   * @example {"provider":"tonghuashun","method":"thsHotStockListHistory","args":["2024-01-15"]}
   */
  p.thsHotStockListHistory = async function thsHotStockListHistory(date: string) {
    const d = String(date ?? '').trim().slice(0, 10)
    if (!d) return null
    return withFuyaoClient(async client => {
      const data = await client.hotStockListHistory(d)
      const rows = withSourceRows(data.item ?? [])
      return rows.length ? rows : null
    })
  }

  /**
   * 个股热榜排名走势（时间序列）
   * @sourceUrl https://fuyao.aicubes.cn/api/a-share/special-data/hot-stock-rank-trend
   * @pageUrl https://fuyao.aicubes.cn/
   * @returns Record<string, unknown>[] 排名走势行，含 source=tonghuashun
   * @usage engine.invokeCustomMethod("tonghuashun", "thsHotStockRankTrend", ["600519","2024-01-01","2024-03-01"])
   * @remarks start/end 可选；无数据时返回 null。
   * @param code 6 位 A 股代码或 thscode（必填）
   * @param start 起始日期 YYYY-MM-DD（可选）
   * @param end 结束日期 YYYY-MM-DD（可选）
   * @example {"provider":"tonghuashun","method":"thsHotStockRankTrend","args":["600519","2024-01-01","2024-03-01"]}
   */
  p.thsHotStockRankTrend = async function thsHotStockRankTrend(
    code: string,
    start?: string,
    end?: string,
  ) {
    const thscode = resolveStockThscode(code)
    if (!thscode) return null
    return withFuyaoClient(async client => {
      const data = await client.hotStockRankTrend(
        thscode,
        start?.trim() || undefined,
        end?.trim() || undefined,
      )
      const rows = withSourceRows(data.item ?? [])
      return rows.length ? rows : null
    })
  }

  /**
   * 当日个股异动原因列表（全市场）
   * @sourceUrl https://fuyao.aicubes.cn/api/a-share/special-data/anomaly-analysis-list
   * @pageUrl https://fuyao.aicubes.cn/
   * @returns Record<string, unknown>[] 异动行，含 source=tonghuashun
   * @usage engine.invokeCustomMethod("tonghuashun", "thsAnomalyAnalysisList", [])
   * @remarks tag 可选筛选；无数据时返回 null。
   * @param tag 异动类型标签（可选）
   * @example {"provider":"tonghuashun","method":"thsAnomalyAnalysisList","args":[]}
   */
  p.thsAnomalyAnalysisList = async function thsAnomalyAnalysisList(tag?: string) {
    return withFuyaoClient(async client => {
      const data = await client.anomalyAnalysisList(tag?.trim() || undefined)
      const rows = withSourceRows(data.item ?? [])
      return rows.length ? rows : null
    })
  }

  /**
   * 按股票批量查询当日异动原因
   * @sourceUrl https://fuyao.aicubes.cn/api/a-share/special-data/anomaly-analysis-stock
   * @pageUrl https://fuyao.aicubes.cn/
   * @returns Record<string, unknown>[] 异动行，含 source=tonghuashun
   * @usage engine.invokeCustomMethod("tonghuashun", "thsAnomalyAnalysisStock", ["600519"])
   * @remarks 支持逗号分隔或数组；裸代码自动转 thscode。
   * @param codes 单只代码、逗号分隔多码或 JSON 数组（必填）
   * @example {"provider":"tonghuashun","method":"thsAnomalyAnalysisStock","args":["600519,000001"]}
   */
  p.thsAnomalyAnalysisStock = async function thsAnomalyAnalysisStock(codes: string | string[]) {
    const bareList = parseCodesArg(codes)
    if (!bareList.length) return null
    const thscodes = bareList.map(c => resolveStockThscode(c)).filter(Boolean)
    if (!thscodes.length) return null
    return withFuyaoClient(async client => {
      const data = await client.anomalyAnalysisStock(thscodes)
      const rows = withSourceRows(data.item ?? [])
      return rows.length ? rows : null
    })
  }

  /**
   * 炸板股票池
   * @sourceUrl https://fuyao.aicubes.cn/api/a-share/special-data/limit-break-pool
   * @pageUrl https://fuyao.aicubes.cn/
   * @returns Record<string, unknown>[] 炸板行，含 source=tonghuashun
   * @usage engine.invokeCustomMethod("tonghuashun", "thsLimitBreakPool", ["2024-01-15"])
   * @remarks 可选交易日；无数据时返回 null。勿与标准 limitUpdown（涨跌停）混淆。
   * @param date 交易日 YYYY-MM-DD（可选）
   * @example {"provider":"tonghuashun","method":"thsLimitBreakPool","args":["2024-01-15"]}
   */
  p.thsLimitBreakPool = async function thsLimitBreakPool(date?: string) {
    const d = String(date ?? '').trim().slice(0, 10)
    const dateMs = d ? new Date(`${d}T00:00:00+08:00`).getTime() : undefined
    if (d && !Number.isFinite(dateMs)) return null
    return withFuyaoClient(async client => {
      const data = await client.limitBreakPool(dateMs, 1, 200)
      const rows = withSourceRows(data.item ?? [])
      return rows.length ? rows : null
    })
  }

  /**
   * 集合竞价快照
   * @sourceUrl https://fuyao.aicubes.cn/api/a-share/auction/snapshot
   * @pageUrl https://fuyao.aicubes.cn/
   * @returns Record<string, unknown>[] 竞价行，含 source=tonghuashun
   * @usage engine.invokeCustomMethod("tonghuashun", "thsAuctionSnapshot", ["600519","live"])
   * @remarks 支持逗号分隔或数组；裸代码自动转 thscode。stage 默认 final。
   * @param codes 单只代码、逗号分隔多码或 JSON 数组（必填）
   * @param stage live（实时）/ final（终态，可选）
   * @example {"provider":"tonghuashun","method":"thsAuctionSnapshot","args":["600519,000001","final"]}
   */
  p.thsAuctionSnapshot = async function thsAuctionSnapshot(
    codes: string | string[],
    stage?: 'live' | 'final' | string,
  ) {
    const bareList = parseCodesArg(codes)
    if (!bareList.length) return null
    const thscodes = bareList.map(c => resolveStockThscode(c)).filter(Boolean)
    if (!thscodes.length) return null
    const stageNorm = String(stage ?? '').trim().toLowerCase()
    const stageOpt: 'live' | 'final' | undefined =
      stageNorm === 'live' || stageNorm === 'final' ? stageNorm : undefined
    return withFuyaoClient(async client => {
      const data = await client.auctionSnapshot(thscodes, stageOpt)
      const rows = withSourceRows(data.item ?? [])
      return rows.length ? rows : null
    })
  }

  /**
   * 短线风向标竞价基准
   * @sourceUrl https://fuyao.aicubes.cn/api/a-share/auction/short-term-benchmark
   * @pageUrl https://fuyao.aicubes.cn/
   * @returns Record<string, unknown>[] 基准行，含 source=tonghuashun
   * @usage engine.invokeCustomMethod("tonghuashun", "thsAuctionShortTermBenchmark", ["2024-01-15"])
   * @remarks date 可选 YYYY-MM-DD；缺省取上海当日；无数据时返回 null。
   * @param date 查询日期 YYYY-MM-DD（可选）
   * @example {"provider":"tonghuashun","method":"thsAuctionShortTermBenchmark","args":["2024-01-15"]}
   */
  p.thsAuctionShortTermBenchmark = async function thsAuctionShortTermBenchmark(date?: string) {
    const d = String(date ?? '').trim().slice(0, 10) || undefined
    return withFuyaoClient(async client => {
      const data = await client.auctionShortTermBenchmark(d)
      const rows = withSourceRows(data.item ?? [])
      return rows.length ? rows : null
    })
  }
}
