import type { WatchlistItem } from '../types/market'
import CrossMarketSnapshotDetail from './CrossMarketSnapshotDetail'

interface Props {
  stock: WatchlistItem
  loading?: boolean
}

export default function UsDetailTab(props: Props) {
  return <CrossMarketSnapshotDetail {...props} />
}
