import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Text,
  makeStyles,
  mergeClasses,
} from '@fluentui/react-components'
import { FolderAddRegular } from '@fluentui/react-icons'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import { OpptrixDialogAlert } from '../components/opptrix/OpptrixDialogAlert'
import ComposerTooltipMenu, {
  COMPOSER_TOOLTIP_ABOVE_DIALOG_Z_INDEX,
  ComposerTooltipMenuItem,
} from './ComposerTooltipMenu'
import { opptrixCssVars, opptrixTokens } from '../theme/tokens'
import { ghostInteractive } from '../theme/mixins'
import type { WorkspaceGrantDto } from '../api/client'

export function grantFolderName(grant: WorkspaceGrantDto): string {
  if (grant.label?.trim()) return grant.label.trim()
  const normalized = grant.abs_path.replace(/\\/g, '/').replace(/\/+$/, '')
  const segments = normalized.split('/').filter(Boolean)
  const last = segments[segments.length - 1]
  return last ?? grant.root_id
}

function grantModeLabel(mode: 'ro' | 'rw'): string {
  return mode === 'ro' ? '只读' : '可读写'
}

const useStyles = makeStyles({
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    padding: '4px 0 0',
  },
  intro: {
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.55,
    whiteSpace: 'pre-wrap',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  sectionTitle: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    color: opptrixCssVars.textSecondary,
  },
  grantList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  grantRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    minHeight: '40px',
    padding: '6px 10px',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: opptrixCssVars.surfaceHover,
    boxSizing: 'border-box',
  },
  grantRowDefault: {
    backgroundColor: 'transparent',
    border: `1px solid ${opptrixCssVars.separator}`,
  },
  grantMeta: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  grantName: {
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 500,
    color: opptrixCssVars.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  grantPath: {
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  grantBadge: {
    flexShrink: 0,
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
    whiteSpace: 'nowrap',
  },
  grantActions: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    flexShrink: 0,
  },
  textBtn: {
    ...ghostInteractive,
    padding: '4px 8px',
    border: 'none',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: 'transparent',
    color: opptrixCssVars.textSecondary,
    fontSize: 'var(--opptrix-font-sm)',
    cursor: 'pointer',
    ':hover': {
      backgroundColor: opptrixCssVars.surfaceHover,
      color: opptrixCssVars.textPrimary,
    },
    ':disabled': {
      opacity: 0.4,
      cursor: 'default',
    },
  },
  textBtnDanger: {
    ':hover': {
      backgroundColor: opptrixCssVars.errorSoft,
      color: opptrixCssVars.error,
    },
  },
  emptyHint: {
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.5,
    padding: '4px 2px',
  },
  footerActions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: '12px',
  },
  footerStart: {
    display: 'inline-flex',
    alignItems: 'center',
    minWidth: 0,
    flex: '1 1 auto',
  },
  footerAddAnchor: {
    display: 'inline-flex',
  },
  desktopHint: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.45,
    padding: '6px 10px',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: opptrixCssVars.surfaceHover,
  },
  error: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.error,
    lineHeight: 1.45,
  },
  removeConfirm: {
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.45,
  },
})

interface WorkspaceGrantsDialogProps {
  open: boolean
  onClose: () => void
  grants: WorkspaceGrantDto[]
  loading: boolean
  disabled: boolean
  error: string | null
  isDesktop: boolean
  onAddFolder: (mode: 'ro' | 'rw') => void
  onReplaceGrant: (grant: WorkspaceGrantDto) => void
  onRemoveGrant: (grant: WorkspaceGrantDto) => void
}

export default function WorkspaceGrantsDialog({
  open,
  onClose,
  grants,
  loading,
  disabled,
  error,
  isDesktop,
  onAddFolder,
  onReplaceGrant,
  onRemoveGrant,
}: WorkspaceGrantsDialogProps) {
  const s = useStyles()
  const addBtnRef = useRef<HTMLSpanElement>(null)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<WorkspaceGrantDto | null>(null)

  const defaultGrant = grants.find(grant => grant.is_default) ?? null
  const extraGrants = grants.filter(grant => !grant.is_default)

  useEffect(() => {
    if (!open) setAddMenuOpen(false)
  }, [open])

  const handleConfirmRemove = useCallback(() => {
    if (!removeTarget) return
    onRemoveGrant(removeTarget)
    setRemoveTarget(null)
  }, [onRemoveGrant, removeTarget])

  const handleAddModeSelect = useCallback((mode: 'ro' | 'rw') => {
    setAddMenuOpen(false)
    onAddFolder(mode)
  }, [onAddFolder])

  const busy = disabled || loading
  const canAddFolder = isDesktop && !busy

  return (
    <>
      <Dialog
        open={open}
        modalType="modal"
        onOpenChange={(_, data) => {
          if (!data.open) onClose()
        }}
      >
        <DialogSurface className="opptrix-glass-dialog-surface opptrix-workspace-grants-dialog">
          <DialogBody>
            <DialogTitle>授权文件夹访问</DialogTitle>
            <DialogContent className={s.body}>
              <Text className={s.intro} block>
                在本对话中，助手只能读取你授权的本地文件夹。{'\n'}
                下方「本对话工作区」默认可用，仅当前对话可读写。{'\n'}
                需要查看电脑上的其他资料时，再添加额外文件夹；可随时更换或移除。{'\n'}
                额外授权仅对本对话生效，关闭对话后将不再保留。
              </Text>

              <div className={s.section}>
                <Text className={s.sectionTitle}>本对话工作区</Text>
                {defaultGrant ? (
                  <div className={mergeClasses(s.grantRow, s.grantRowDefault)}>
                    <div className={s.grantMeta}>
                      <Text className={s.grantName} block>
                        {defaultGrant.label?.trim() || '本对话工作区'}
                      </Text>
                      <Text className={s.grantPath} block title={defaultGrant.abs_path}>
                        {grantFolderName(defaultGrant)}
                      </Text>
                    </div>
                    <Text className={s.grantBadge}>默认 · 可读写</Text>
                  </div>
                ) : (
                  <Text className={s.emptyHint} block>
                    正在加载本对话工作区…
                  </Text>
                )}
              </div>

              <div className={s.section}>
                <Text className={s.sectionTitle}>本对话额外文件夹</Text>
                <div className={s.grantList}>
                  {extraGrants.length === 0 ? (
                    <Text className={s.emptyHint} block>
                      还没有额外文件夹。添加后，助手才能读取其中的文件。
                    </Text>
                  ) : (
                    extraGrants.map(grant => (
                      <div key={grant.id} className={s.grantRow}>
                        <div className={s.grantMeta}>
                          <Text className={s.grantName} block>
                            {grantFolderName(grant)}
                          </Text>
                          <Text className={s.grantPath} block title={grant.abs_path}>
                            {grant.abs_path}
                          </Text>
                        </div>
                        <Text className={s.grantBadge}>{grantModeLabel(grant.mode)}</Text>
                        <div className={s.grantActions}>
                          <button
                            type="button"
                            className={s.textBtn}
                            disabled={busy}
                            onClick={() => onReplaceGrant(grant)}
                          >
                            更换
                          </button>
                          <button
                            type="button"
                            className={mergeClasses(s.textBtn, s.textBtnDanger)}
                            disabled={busy}
                            onClick={() => setRemoveTarget(grant)}
                          >
                            移除
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {!isDesktop && (
                <Text className={s.desktopHint} block>
                  添加本地文件夹需使用桌面版。你可以在桌面应用中打开本对话后再添加。
                </Text>
              )}

              {error && (
                <Text className={s.error} block role="alert">
                  {error}
                </Text>
              )}
            </DialogContent>
            <DialogActions className={s.footerActions} fluid>
              <div className={s.footerStart}>
                <span ref={addBtnRef} className={s.footerAddAnchor}>
                  <OpptrixButton
                    variant="secondary"
                    disabled={!canAddFolder}
                    icon={<FolderAddRegular fontSize={16} />}
                    aria-expanded={addMenuOpen}
                    aria-haspopup="menu"
                    onClick={e => {
                      if (!canAddFolder) return
                      e.stopPropagation()
                      setAddMenuOpen(open => !open)
                    }}
                  >
                    添加文件夹
                  </OpptrixButton>
                </span>
              </div>
              <OpptrixButton variant="primary" onClick={onClose}>
                完成
              </OpptrixButton>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <ComposerTooltipMenu
        open={addMenuOpen && canAddFolder}
        anchorRef={addBtnRef}
        align="start"
        width={208}
        maxHeight={120}
        title="选择访问方式"
        zIndex={COMPOSER_TOOLTIP_ABOVE_DIALOG_Z_INDEX}
        ariaLabel="选择文件夹权限"
        onClose={() => setAddMenuOpen(false)}
      >
        <ComposerTooltipMenuItem onClick={() => handleAddModeSelect('ro')}>
          只读文件夹
        </ComposerTooltipMenuItem>
        <ComposerTooltipMenuItem onClick={() => handleAddModeSelect('rw')}>
          可读写文件夹
        </ComposerTooltipMenuItem>
      </ComposerTooltipMenu>

      {removeTarget && (
        <OpptrixDialogAlert
          open
          title="移除这个文件夹？"
          message={(
            <span className={s.removeConfirm}>
              移除后，助手将无法再读取「{grantFolderName(removeTarget)}」中的文件。你可以随时重新添加。
            </span>
          )}
          confirmLabel="移除"
          confirmTone="danger"
          onConfirm={handleConfirmRemove}
          onCancel={() => setRemoveTarget(null)}
        />
      )}
    </>
  )
}
