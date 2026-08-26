import type { WatchlistItem } from '../types/market'
import CrossMarketSnapshotDetail from './CrossMarketSnapshotDetail'
import CrossMarketDetailPlaceholder from './CrossMarketDetailPlaceholder'
import { resolveWatchlistInstrument } from './instrument'

interface Props {
  stock: WatchlistItem
  loading?: boolean
  onManage?: () => void
  onSelectPeer?: (item: WatchlistItem) => void
}

/** US / HK / JP / KR 详情 — 统一 instrument 快照 */
export default function CrossMarketDetailTab(props: Props) {
  const ref = resolveWatchlistInstrument(props.stock)
  if (!ref) {
    return (
      <CrossMarketDetailPlaceholder
        stock={props.stock}
        loading={props.loading}
      />
    )
  }
  return <CrossMarketSnapshotDetail {...props} instrumentRef={ref} />
}
