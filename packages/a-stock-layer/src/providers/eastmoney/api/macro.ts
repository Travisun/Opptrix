/**
 * 东财宏观数据中心 API（datacenter-web）。
 */

import { emDatacenterGet } from './client.js'
import {
  EM_MACRO_CN,
  EM_MACRO_FOREIGN,
  EM_MACRO_INDUSTRY,
  findMacroCn,
  findMacroForeign,
  findMacroIndustry,
  foreignReportName,
  type EmMacroCnDef,
  type EmMacroForeignItem,
  type EmMacroIndustryItem,
} from './macro-catalog.js'

export {
  EM_MACRO_CN,
  EM_MACRO_FOREIGN,
  EM_MACRO_INDUSTRY,
  findMacroCn,
  findMacroForeign,
  findMacroIndustry,
  foreignReportName,
}

function clampPage(page: number): number {
  return Math.max(1, Number(page) || 1)
}

function clampSize(size: number, max = 200): number {
  return Math.min(max, Math.max(1, Number(size) || 60))
}

/** 按 key / 别名拉中国宏观序列 */
export async function emFetchMacroCn(
  indicator: string,
  page = 1,
  pageSize = 60,
): Promise<{ def: EmMacroCnDef; rows: Record<string, unknown>[] } | null> {
  const def = findMacroCn(indicator)
  if (!def) return null
  const rows = await emDatacenterGet({
    reportName: def.reportName,
    pageNumber: clampPage(page),
    pageSize: clampSize(pageSize),
    sortColumns: def.sortColumns,
    sortTypes: -1,
    token: def.token,
  })
  return { def, rows }
}

/** 国外宏观：foreign_X_Y / INDICATOR_ID / 中文名 */
export async function emFetchMacroForeign(
  keyOrIdOrName: string,
  page = 1,
  pageSize = 60,
): Promise<{ item: EmMacroForeignItem; rows: Record<string, unknown>[] } | null> {
  const item = findMacroForeign(keyOrIdOrName)
  if (!item?.indicatorId) return null
  const rows = await emDatacenterGet({
    reportName: foreignReportName(item.mkt),
    filter: `(INDICATOR_ID="${item.indicatorId}")`,
    pageNumber: clampPage(page),
    pageSize: clampSize(pageSize),
    sortColumns: 'REPORT_DATE',
    sortTypes: -1,
  })
  return { item, rows }
}

/** 行业指数：hyzs_list_EMI… / EMI 码 / 中文名 */
export async function emFetchMacroIndustry(
  keyOrIdOrName: string,
  page = 1,
  pageSize = 60,
): Promise<{ item: EmMacroIndustryItem; rows: Record<string, unknown>[] } | null> {
  const item = findMacroIndustry(keyOrIdOrName)
  if (!item?.indicatorId) return null
  const rows = await emDatacenterGet({
    reportName: 'RPT_INDUSTRY_INDEX',
    filter: `(INDICATOR_ID="${item.indicatorId}")`,
    pageNumber: clampPage(page),
    pageSize: clampSize(pageSize),
    sortColumns: 'REPORT_DATE',
    sortTypes: -1,
  })
  return { item, rows }
}

/** 油价：汽油/柴油调价、各省油价、原油行情 */
export type EmOilKind = 'adjust' | 'province' | 'quote'

const OIL_TOKEN = '8944c01f984b480b601f8213e9a4a8ae'

export async function emFetchMacroOil(
  kind: EmOilKind = 'adjust',
  page = 1,
  pageSize = 60,
): Promise<Record<string, unknown>[]> {
  if (kind === 'province') {
    return emDatacenterGet({
      reportName: 'RPTA_WEB_YJ_JH',
      pageNumber: clampPage(page),
      pageSize: clampSize(pageSize, 500),
      sortColumns: 'DIM_DATE',
      sortTypes: -1,
      token: OIL_TOKEN,
    })
  }
  if (kind === 'quote') {
    return emDatacenterGet({
      reportName: 'RPTA_WEB_JY_HQ',
      pageNumber: clampPage(page),
      pageSize: clampSize(pageSize),
      sortColumns: 'DATE',
      sortTypes: -1,
      token: OIL_TOKEN,
    })
  }
  return emDatacenterGet({
    reportName: 'RPTA_WEB_YJ_BD',
    pageNumber: clampPage(page),
    pageSize: clampSize(pageSize),
    sortColumns: 'DIM_DATE',
    sortTypes: -1,
    token: OIL_TOKEN,
  })
}
