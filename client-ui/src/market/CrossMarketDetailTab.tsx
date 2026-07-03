import type { WatchlistItem } from '../types/market'
import CrossMarketSnapshotDetail from './CrossMarketSnapshotDetail'
import { resolveWatchlistInstrument } from './instrument'

interface Props {
  stock: WatchlistItem
  localIndexed?: boolean | null
  loading?: boolean
  onManage?: () => void
}

/** US / HK / JP / KR 详情 — 统一 instrument 快照 */
export default function CrossMarketDetailTab(props: Props) {
  const ref = resolveWatchlistInstrument(props.stock)
  return <CrossMarketSnapshotDetail {...props} instrumentRef={ref} />
}
