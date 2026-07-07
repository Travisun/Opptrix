import type { NewsItem } from '../../../core/schema.js'
import { mapRecordsToNewsItems } from '../../common/free-proxies.js'

export { mapRecordsToNewsItems }

export function mapZzshareStockNewsRows(
  code: string,
  ...batches: Record<string, unknown>[][]
): NewsItem[] {
  const merged = batches.flat()
  return mapRecordsToNewsItems(code, merged)
}
