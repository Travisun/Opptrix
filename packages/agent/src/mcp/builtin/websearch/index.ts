export {
  ENGINE_DEFS,
  buildSearchUrl,
  composeQuery,
  googleTbs,
  isAllowedSearchHost,
  queryLooksChinese,
  resolveRegion,
  selectEngines,
} from './engines.js'
export type { EngineDef, EngineId, SearchRegion, TimeWindow } from './engines.js'

export {
  MemoryCookieJar,
  WEBSEARCH_FETCH_TIMEOUT_MS,
  WEBSEARCH_UA,
  assertAllowedSearchUrl,
  engineById,
  fetchSearchHtml,
  getWebsearchFetch,
  isWebsearchFetchInjected,
  setWebsearchFetchForTests,
  WebsearchFetchError,
} from './session-fetch.js'
export type { WebsearchFetch } from './session-fetch.js'

export { parseEngineHtml } from './parse.js'
export type { SearchHit } from './parse.js'

export { runWebSearch, WEBSEARCH_QUERY_MAX_LEN, WEBSEARCH_DISCLAIMER } from './search.js'
export type { WebSearchParams, WebSearchResult } from './search.js'

export { WEBSEARCH_MCP_TOOLS, callWebsearchMcpTool } from './tools.js'
export type { WebsearchMcpToolDef } from './tools.js'

export { resolveWebsearchMcpStdioTransport } from './resolve-stdio.js'
