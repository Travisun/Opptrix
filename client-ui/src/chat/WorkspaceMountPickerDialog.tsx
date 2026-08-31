import { useCallback, useEffect, useState } from 'react'
import {
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Spinner,
  Text,
  makeStyles,
  mergeClasses,
} from '@fluentui/react-components'
import { FolderRegular, ChevronRightRegular } from '@fluentui/react-icons'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import {
  browseWorkspaceMount,
  listWorkspaceMounts,
  type WorkspaceBrowseEntryDto,
  type WorkspaceMountRootDto,
} from '../api/client'
import { opptrixCssVars, opptrixTokens } from '../theme/tokens'
import { ghostInteractive } from '../theme/mixins'

const useStyles = makeStyles({
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '4px 0 0',
    minHeight: '220px',
  },
  intro: {
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.55,
  },
  breadcrumb: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '2px 4px',
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
  },
  crumbBtn: {
    ...ghostInteractive,
    border: 'none',
    background: 'transparent',
    padding: '2px 6px',
    borderRadius: opptrixTokens.radiusMd,
    color: opptrixCssVars.textSecondary,
    cursor: 'pointer',
    fontSize: 'var(--opptrix-font-sm)',
    ':hover': {
      backgroundColor: opptrixCssVars.surfaceHover,
      color: opptrixCssVars.textPrimary,
    },
    ':disabled': {
      opacity: 0.5,
      cursor: 'default',
    },
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    maxHeight: '280px',
    overflowY: 'auto',
  },
  row: {
    ...ghostInteractive,
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    width: '100%',
    minHeight: '40px',
    padding: '6px 10px',
    border: 'none',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: 'transparent',
    color: opptrixCssVars.textPrimary,
    cursor: 'pointer',
    textAlign: 'left',
    boxSizing: 'border-box',
    ':hover': {
      backgroundColor: opptrixCssVars.surfaceHover,
    },
  },
  rowSelected: {
    backgroundColor: opptrixCssVars.surfaceHover,
    outline: `1px solid ${opptrixCssVars.separator}`,
  },
  rowLabel: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 'var(--opptrix-font-base)',
  },
  empty: {
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.55,
    padding: '8px 2px',
  },
  error: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.error,
    lineHeight: 1.45,
  },
  hint: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.45,
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 4px',
    color: opptrixCssVars.textSecondary,
    fontSize: 'var(--opptrix-font-sm)',
  },
})

interface WorkspaceMountPickerDialogProps {
  open: boolean
  mode: 'ro' | 'rw'
  disabled?: boolean
  onClose: () => void
  onConfirm: (absPath: string, label?: string) => void
}

export default function WorkspaceMountPickerDialog({
  open,
  mode,
  disabled = false,
  onClose,
  onConfirm,
}: WorkspaceMountPickerDialogProps) {
  const s = useStyles()
  const [mounts, setMounts] = useState<WorkspaceMountRootDto[]>([])
  const [emptyReason, setEmptyReason] = useState<string | null>(null)
  const [activeRoot, setActiveRoot] = useState<WorkspaceMountRootDto | null>(null)
  const [relPath, setRelPath] = useState('')
  const [entries, setEntries] = useState<WorkspaceBrowseEntryDto[]>([])
  const [truncated, setTruncated] = useState(false)
  const [selectedAbs, setSelectedAbs] = useState<string | null>(null)
  const [selectedLabel, setSelectedLabel] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resetBrowse = useCallback(() => {
    setActiveRoot(null)
    setRelPath('')
    setEntries([])
    setTruncated(false)
    setSelectedAbs(null)
    setSelectedLabel(undefined)
  }, [])

  const loadMounts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await listWorkspaceMounts()
      setMounts(resp.mounts)
      setEmptyReason(resp.empty_reason ?? (resp.mounts.length === 0
        ? '还没有可选用的已挂载目录。请先在服务器上添加需要共享的文件夹后刷新。本对话工作区与公共资产仍可正常使用。'
        : null))
      resetBrowse()
    } catch (e) {
      setError(e instanceof Error ? e.message : '暂时无法加载已挂载目录')
      setMounts([])
    } finally {
      setLoading(false)
    }
  }, [resetBrowse])

  useEffect(() => {
    if (!open) return
    void loadMounts()
  }, [open, loadMounts])

  const openRoot = useCallback(async (mount: WorkspaceMountRootDto) => {
    setLoading(true)
    setError(null)
    try {
      const resp = await browseWorkspaceMount(mount.abs_path, '')
      setActiveRoot(mount)
      setRelPath(resp.path)
      setEntries(resp.entries)
      setTruncated(resp.truncated)
      setSelectedAbs(mount.abs_path)
      setSelectedLabel(mount.label)
    } catch (e) {
      setError(e instanceof Error ? e.message : '暂时无法打开该目录')
    } finally {
      setLoading(false)
    }
  }, [])

  const browseTo = useCallback(async (nextRel: string) => {
    if (!activeRoot) return
    setLoading(true)
    setError(null)
    try {
      const resp = await browseWorkspaceMount(activeRoot.abs_path, nextRel)
      setRelPath(resp.path)
      setEntries(resp.entries)
      setTruncated(resp.truncated)
      const segs = nextRel.split('/').filter(Boolean)
      const currentAbs = segs.length
        ? [activeRoot.abs_path.replace(/[/\\]+$/, ''), ...segs].join('/')
        : activeRoot.abs_path
      setSelectedAbs(currentAbs)
      setSelectedLabel(segs[segs.length - 1] ?? activeRoot.label)
    } catch (e) {
      setError(e instanceof Error ? e.message : '暂时无法打开该目录')
    } finally {
      setLoading(false)
    }
  }, [activeRoot])

  const enterChild = useCallback((entry: WorkspaceBrowseEntryDto) => {
    const next = relPath ? `${relPath}/${entry.name}` : entry.name
    setSelectedAbs(entry.abs_path)
    setSelectedLabel(entry.name)
    void browseTo(next)
  }, [browseTo, relPath])

  const crumbSegments = relPath ? relPath.split('/').filter(Boolean) : []

  const handleConfirm = useCallback(() => {
    if (!selectedAbs || disabled || loading) return
    onConfirm(selectedAbs, selectedLabel)
  }, [disabled, loading, onConfirm, selectedAbs, selectedLabel])

  const modeLabel = mode === 'ro' ? '只读' : '可读写'
  const busy = disabled || loading

  return (
    <Dialog
      open={open}
      modalType="modal"
      onOpenChange={(_, data) => {
        if (!data.open) onClose()
      }}
    >
      <DialogSurface className="opptrix-glass-dialog-surface opptrix-workspace-mount-picker-dialog">
        <DialogBody>
          <DialogTitle>选择服务器上的文件夹</DialogTitle>
          <DialogContent className={s.body}>
            <Text className={s.intro} block>
              从已挂载目录中选择要授权给助手的文件夹（{modeLabel}）。
            </Text>

            {activeRoot && (
              <div className={s.breadcrumb} aria-label="当前位置">
                <button
                  type="button"
                  className={s.crumbBtn}
                  disabled={busy}
                  onClick={() => { void openRoot(activeRoot) }}
                >
                  {activeRoot.label}
                </button>
                {crumbSegments.map((seg, i) => {
                  const target = crumbSegments.slice(0, i + 1).join('/')
                  return (
                    <span key={target} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                      <ChevronRightRegular fontSize={12} />
                      <button
                        type="button"
                        className={s.crumbBtn}
                        disabled={busy}
                        onClick={() => { void browseTo(target) }}
                      >
                        {seg}
                      </button>
                    </span>
                  )
                })}
              </div>
            )}

            {loading && mounts.length === 0 && !activeRoot ? (
              <div className={s.loading}>
                <Spinner size="tiny" />
                正在加载已挂载目录…
              </div>
            ) : !activeRoot ? (
              mounts.length === 0 ? (
                <Text className={s.empty} block>
                  {emptyReason}
                </Text>
              ) : (
                <div className={s.list} role="list">
                  {mounts.map(m => (
                    <button
                      key={m.abs_path}
                      type="button"
                      className={s.row}
                      disabled={busy}
                      role="listitem"
                      onClick={() => { void openRoot(m) }}
                    >
                      <FolderRegular fontSize={16} />
                      <span className={s.rowLabel}>{m.label}</span>
                      <ChevronRightRegular fontSize={14} />
                    </button>
                  ))}
                </div>
              )
            ) : (
              <div className={s.list} role="list">
                {entries.length === 0 && !loading ? (
                  <Text className={s.empty} block>
                    此位置没有子文件夹。可直接授权当前文件夹。
                  </Text>
                ) : (
                  entries.map(entry => (
                    <button
                      key={entry.abs_path}
                      type="button"
                      className={mergeClasses(s.row, selectedAbs === entry.abs_path && s.rowSelected)}
                      disabled={busy}
                      role="listitem"
                      onClick={() => enterChild(entry)}
                    >
                      <FolderRegular fontSize={16} />
                      <span className={s.rowLabel}>{entry.name}</span>
                      <ChevronRightRegular fontSize={14} />
                    </button>
                  ))
                )}
                {truncated && (
                  <Text className={s.hint} block>
                    子文件夹较多，仅显示部分。可进入子目录继续选择。
                  </Text>
                )}
              </div>
            )}

            {error && (
              <Text className={s.error} block role="alert">
                {error}
              </Text>
            )}
          </DialogContent>
          <DialogActions>
            {activeRoot && (
              <OpptrixButton
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  resetBrowse()
                }}
              >
                返回目录列表
              </OpptrixButton>
            )}
            <OpptrixButton variant="secondary" onClick={onClose}>
              取消
            </OpptrixButton>
            <OpptrixButton
              variant="primary"
              disabled={busy || !selectedAbs || mounts.length === 0}
              onClick={handleConfirm}
            >
              授权此文件夹
            </OpptrixButton>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
