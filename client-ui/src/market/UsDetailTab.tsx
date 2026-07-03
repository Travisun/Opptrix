import type { WatchlistItem } from '../types/market'
import CrossMarketSnapshotDetail from './CrossMarketSnapshotDetail'

interface Props {
  stock: WatchlistItem
  localIndexed?: boolean | null
  loading?: boolean
}

export default function UsDetailTab(props: Props) {
  return <CrossMarketSnapshotDetail {...props} market="US" />
}
