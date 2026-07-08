import type { CustomMethodApiDoc } from '../common/custom-method-doc-types.js'
import { toCustomMethodDef } from '../common/custom-method-doc-types.js'
import { STOCKINDEX_DEFAULT_BASE_URL } from './settings.js'

const BASE = STOCKINDEX_DEFAULT_BASE_URL
const INVOKE = (method: string, args = '["茅台"]') =>
  `engine.invokeCustomMethod("stockindex", "${method}", ${args})`

export const STOCKINDEX_METHOD_DOCS: Record<string, CustomMethodApiDoc> = {
  stockIndexSearch: {
    method: 'stockIndexSearch',
    description: '跨市场关键词搜索（CN/HK/US）',
    sourceUrl: `${BASE}/api/v1/search`,
    pageUrl: `${BASE}/openapi/`,
    params: [
      { name: 'query', type: 'string', description: '搜索词', required: true },
      { name: 'market', type: 'string', description: 'CN / HK / US，可选' },
      { name: 'limit', type: 'number', description: '条数，最大 100', default: 20 },
      { name: 'board', type: 'string', description: '板块 key 过滤' },
      { name: 'industry', type: 'string', description: '行业代码过滤' },
      { name: 'assetType', type: 'string', description: 'equity / etf' },
    ],
    returns: '[{ query, total, items: StockIndexItem[], source }]',
    usage: INVOKE('stockIndexSearch', '["600519","CN",20]'),
    notes: '公开接口无需鉴权；A 股空结果时可由上层回退腾讯搜索。',
    example: '{"provider":"stockindex","method":"stockIndexSearch","args":["茅台","CN",20]}',
  },
  stockIndexListStocks: {
    method: 'stockIndexListStocks',
    description: '分页个股列表（多条件筛选）',
    sourceUrl: `${BASE}/api/v1/stocks`,
    pageUrl: `${BASE}/openapi/`,
    params: [
      { name: 'market', type: 'string', description: 'CN / HK / US', default: 'CN' },
      { name: 'page', type: 'number', description: '页码，从 1 起', default: 1 },
      { name: 'pageSize', type: 'number', description: '每页条数，最大 100', default: 50 },
      { name: 'board', type: 'string', description: '板块 key' },
      { name: 'industry', type: 'string', description: '行业代码' },
      { name: 'q', type: 'string', description: '名称或代码关键词' },
      { name: 'assetType', type: 'string', description: 'equity / etf' },
    ],
    returns: '[{ page, pageSize, total, items, source }]',
    usage: INVOKE('stockIndexListStocks', '["US",1,50]'),
    example: '{"provider":"stockindex","method":"stockIndexListStocks","args":["HK",1,50]}',
  },
  stockIndexListBoards: {
    method: 'stockIndexListBoards',
    description: '板块目录',
    sourceUrl: `${BASE}/api/v1/boards`,
    pageUrl: `${BASE}/openapi/`,
    params: [
      { name: 'market', type: 'string', description: 'CN / HK / US', default: 'CN' },
      { name: 'withCount', type: 'boolean', description: '是否返回成分股数量', default: true },
    ],
    returns: '[{ total, items: [{ boardKey, name, stockCount, ... }], source }]',
    usage: INVOKE('stockIndexListBoards', '["CN",true]'),
    example: '{"provider":"stockindex","method":"stockIndexListBoards","args":["CN",true]}',
  },
  stockIndexListBoardStocks: {
    method: 'stockIndexListBoardStocks',
    description: '板块成分股（分页）',
    sourceUrl: `${BASE}/api/v1/boards/stocks`,
    pageUrl: `${BASE}/openapi/`,
    params: [
      { name: 'board', type: 'string', description: '板块 key，如 hsj / cyb', required: true },
      { name: 'market', type: 'string', description: 'CN / HK / US', default: 'CN' },
      { name: 'page', type: 'number', description: '页码', default: 1 },
      { name: 'pageSize', type: 'number', description: '每页条数', default: 50 },
      { name: 'q', type: 'string', description: '成分内关键词' },
      { name: 'assetType', type: 'string', description: 'equity / etf' },
    ],
    returns: '[{ board, page, total, items, source }]',
    usage: INVOKE('stockIndexListBoardStocks', '["hsj","CN",1,50]'),
    example: '{"provider":"stockindex","method":"stockIndexListBoardStocks","args":["MB","HK",1,50]}',
  },
  stockIndexListIndustries: {
    method: 'stockIndexListIndustries',
    description: '申万行业目录（A 股）',
    sourceUrl: `${BASE}/api/v1/industries`,
    pageUrl: `${BASE}/openapi/`,
    params: [
      { name: 'market', type: 'string', description: 'CN / HK / US', default: 'CN' },
      { name: 'level', type: 'number', description: '1 一级 / 2 二级' },
      { name: 'q', type: 'string', description: '行业名称关键词' },
      { name: 'parent', type: 'string', description: '一级行业 code，筛二级' },
      { name: 'withCount', type: 'boolean', description: '是否返回成分股数量', default: true },
    ],
    returns: '[{ total, items: [{ industryCode, name, level, stockCount, ... }], source }]',
    usage: INVOKE('stockIndexListIndustries', '["CN",1]'),
    example: '{"provider":"stockindex","method":"stockIndexListIndustries","args":["CN",2]}',
  },
  stockIndexListIndustryStocks: {
    method: 'stockIndexListIndustryStocks',
    description: '行业成分股（分页）',
    sourceUrl: `${BASE}/api/v1/industries/stocks`,
    pageUrl: `${BASE}/openapi/`,
    params: [
      { name: 'industryCode', type: 'string', description: '申万行业代码', required: true },
      { name: 'page', type: 'number', description: '页码', default: 1 },
      { name: 'pageSize', type: 'number', description: '每页条数', default: 50 },
      { name: 'q', type: 'string', description: '成分内关键词' },
    ],
    returns: '[{ industryCode, page, total, items, source }]',
    usage: INVOKE('stockIndexListIndustryStocks', '["801010",1,50]'),
    example: '{"provider":"stockindex","method":"stockIndexListIndustryStocks","args":["801010",1,50]}',
  },
}

export const STOCKINDEX_CUSTOM = Object.values(STOCKINDEX_METHOD_DOCS).map(toCustomMethodDef)
