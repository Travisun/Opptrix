/**
 * StockIndex 公开检索 API — 兼容层，实现已迁至 providers/stockindex。
 * @deprecated 请优先通过 StockIndex Provider（queryInstrumentData / invokeCustomMethod）
 */

export {
  STOCKINDEX_DEFAULT_BASE_URL as STOCK_INDEX_BASE_URL,
  stockIndexSearch,
  stockIndexListStocks,
  stockIndexItemToInstrumentRef,
  refLabelFromInstrument,
  type StockIndexItem as StockIndexSearchItem,
} from '../providers/stockindex/index.js'
