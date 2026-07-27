/**
 * cn-offline-daily-k — 公共区离线日 K 包入口。
 * @module cn-offline-daily-k
 */

export {
  STALE_FULL_DAYS,
  defaultMetaRelativePath,
  readMeta,
  writeMeta,
  daysSinceLastSuccess,
} from './meta.js'

export {
  decideDumpKind,
  markUpdateSuccess,
  getDeployStatus,
  buildUpdatePlaybook,
} from './deploy.js'

export {
  normalizeBarRow,
  normalizeBarRows,
  loadBarsFromParquet,
} from './parquet.js'

export {
  getDailyBars,
  listTradeDates,
  crossSection,
  coverage,
} from './query.js'

export {
  screenByMaTrend,
  screenByPricePercentile,
  screenByVolatility,
  screenByVolumeSurge,
  screenByMaxDrawdown,
  sectorRelativeStrength,
  marketBreadth,
  sectorLeaders,
} from './screen.js'
