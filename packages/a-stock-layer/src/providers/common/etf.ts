/** @deprecated 请改用 standard-etf.js；保留 re-export 以兼容现有 import */
export {
  filterCnEtfListItems,
  mapKlinesToEtfNavRows,
  mapProfilesToEtfProfileRows,
} from './standard-etf.js'

export const CN_ETF_FREE_CAPABILITIES = [
  'etf_list',
  'etf_profile',
  'etf_nav',
] as const
