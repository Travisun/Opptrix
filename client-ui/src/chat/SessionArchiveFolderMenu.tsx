import { useEffect, useRef, useState } from 'react'
import { Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { FolderRegular } from '@fluentui/react-icons'
import ComposerTooltipMenu from './ComposerTooltipMenu'
import type { SessionArchiveFolder } from '../types/chat'
import { listSessionArchiveFolders } from '../api/client'
import { opptrixCssVars } from '../theme/tokens'
import { ghostInteractive } from '../theme/mixins'

const useStyles = makeStyles({
  folderList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: '4px',
  },
  folderItem: {...ghostInteractive,
display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    padding: '8px 10px',
    borderRadius: '8px',
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 500,
    color: opptrixCssVars.textPrimary,
    textAlign: 'left',
  },
  folderIcon: {
    color: opptrixCssVars.textSecondary,
    flexShrink: 0,
  },
  loading: {
    padding: '12px 10px',
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textTertiary,
  },
})

interface Props {
  open: boolean
  anchorRef: React.RefObject<HTMLElement | null>
  onClose: () => void
  onSelect: (folderId: string) => void
}

export default function SessionArchiveFolderMenu({ open, anchorRef, onClose, onSelect }: Props) {
  const s = useStyles()
  const [folders, setFolders] = useState<SessionArchiveFolder[]>([])
  const [loading, setLoading] = useState(false)
  const loadedRef = useRef(false)

  useEffect(() => {
    if (!open) return
    if (loadedRef.current && folders.length) return
    setLoading(true)
    listSessionArchiveFolders()
      .then(res => {
        setFolders(res.folders)
        loadedRef.current = true
      })
      .catch(() => setFolders([]))
      .finally(() => setLoading(false))
  }, [open, folders.length])

  return (
    <ComposerTooltipMenu
      open={open}
      anchorRef={anchorRef}
      align="end"
      width={220}
      maxHeight={260}
      title="归档到"
      ariaLabel="选择归档文件夹"
      onClose={onClose}
    >
      <div className={s.folderList}>
        {loading && <Text className={s.loading} block>加载文件夹…</Text>}
        {!loading && folders.map(folder => (
          <button
            key={folder.id}
            type="button"
            className={mergeClasses(s.folderItem, 'opptrix-focusable')}
            onClick={() => {
              onSelect(folder.id)
              onClose()
            }}
          >
            <FolderRegular className={s.folderIcon} fontSize={16} />
            <span>{folder.title}</span>
          </button>
        ))}
      </div>
    </ComposerTooltipMenu>
  )
}
