import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
} from '@fluentui/react-components'
import type { WatchlistGroupsDocument, WatchlistItem } from '../types/market'
import WatchlistGroupsPanel from './WatchlistGroupsPanel'

interface Props {
  open: boolean
  items: WatchlistItem[]
  doc: WatchlistGroupsDocument
  onClose: () => void
  onSave: (doc: WatchlistGroupsDocument) => Promise<void>
}

/** 设置页等仍可用 Modal；右栏主路径请用 `WatchlistGroupsDrawer`。 */
export default function WatchlistGroupsDialog({ open, items, doc, onClose, onSave }: Props) {
  if (!open) return null

  return (
    <Dialog
      open
      modalType="modal"
      onOpenChange={(_, data) => {
        if (!data.open) onClose()
      }}
    >
      <DialogSurface className="opptrix-glass-dialog-surface opptrix-watchlist-groups-dialog">
        <DialogBody>
          <DialogTitle>管理关注分组</DialogTitle>
          <DialogContent>
            <WatchlistGroupsPanel
              items={items}
              doc={doc}
              onClose={onClose}
              onSave={onSave}
              variant="dialog"
            />
          </DialogContent>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
