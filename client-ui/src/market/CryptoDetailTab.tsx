import type { WatchlistItem } from '../types/market'
import CrossMarketSnapshotDetail from './CrossMarketSnapshotDetail'

interface Props {
  stock: WatchlistItem
  localIndexed?: boolean | null
  loading?: boolean
  onManage?: () => void
}

export default function CryptoDetailTab(props: Props) {
  return <CrossMarketSnapshotDetail {...props} />
}
