import { memo } from 'react'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import {
  DESKTOP_SIDEBAR_LAYOUT_EASE,
  DESKTOP_SIDEBAR_LAYOUT_MS,
  DESKTOP_TITLEBAR_HEIGHT,
  WORKSPACE_RIGHT_PANEL_DEFAULT_WIDTH,
} from '../desktop/constants'
import type { ChatAttachmentMeta } from '../types/chat'
import RightMarketPanel from '../market/RightMarketPanel'
import FilePreviewPanel, { type FilePreviewTarget } from './FilePreviewPanel'
import type { StockDiscussPayload } from '../market/StockDecisionCard'

const useStyles = makeStyles({
  panelShell: {
    flexShrink: 0,
    width: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
    display: 'flex',
    flexDirection: 'column',
    /**
     * Keep content left-aligned inside the shell.
     * The shell sits on the trailing edge and grows leftward (chat is flex:1),
     * so left-aligned clip reads as one panel pulled from the right.
     * flex-end would reveal the panel's right edge first and make inner content
     * look like a second slide-in from the left (especially noticeable on macOS).
     */
    alignItems: 'flex-start',
    minHeight: 0,
    height: '100%',
    transitionProperty: 'width',
    transitionDuration: `${DESKTOP_SIDEBAR_LAYOUT_MS}ms`,
    transitionTimingFunction: DESKTOP_SIDEBAR_LAYOUT_EASE,
  },
  panelShellOpen: {
    pointerEvents: 'auto',
  },
  panelShellNoTransition: {
    transitionProperty: 'none',
  },
  panelShellElectron: {
    marginTop: `-${DESKTOP_TITLEBAR_HEIGHT}px`,
    height: `calc(100% + ${DESKTOP_TITLEBAR_HEIGHT}px)`,
    boxSizing: 'border-box',
  },
  panel: {
    height: '100%',
    minHeight: 0,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
  },
})

interface Props {
  visible: boolean
  width?: number
  fullWidth?: boolean
  transitionEnabled?: boolean
  electronChrome?: boolean
  chatColumnVisible?: boolean
  chromeToolbarReserve?: number
  focusStockCode?: string | null
  onFocusStockConsumed?: () => void
  onToggleRightPanel?: () => void
  onToggleChatColumn?: () => void
  onDiscussInChat?: (payload: StockDiscussPayload) => void
  /** 右侧处于文件预览模式（可无已选附件，显示空状态） */
  previewMode?: boolean
  preview?: FilePreviewTarget | null
  /** 空预览时用当前会话 id（preview.sessionId 可能为空） */
  previewSessionId?: string | null
  onSelectAttachment?: (attachment: ChatAttachmentMeta) => void
  onClosePreview?: () => void
}

function RightPanel({
  visible,
  width = WORKSPACE_RIGHT_PANEL_DEFAULT_WIDTH,
  fullWidth = false,
  transitionEnabled = true,
  electronChrome = false,
  chatColumnVisible = true,
  chromeToolbarReserve = 0,
  focusStockCode = null,
  onFocusStockConsumed,
  onToggleRightPanel,
  onToggleChatColumn,
  onDiscussInChat,
  previewMode = false,
  preview = null,
  previewSessionId = null,
  onSelectAttachment,
  onClosePreview,
}: Props) {
  const s = useStyles()
  const showPreview = previewMode || preview != null
  /** 仅当 preview 属于当前会话时才展示附件；否则用当前 session 的文件列表/空态 */
  const previewBelongsToActive = Boolean(
    preview?.sessionId
    && previewSessionId
    && preview.sessionId === previewSessionId,
  )
  const previewSid = previewSessionId || undefined
  const previewAttachment = previewBelongsToActive ? (preview?.attachment ?? null) : null

  const shellWidth = !visible
    ? 0
    : fullWidth
      ? '100%'
      : width

  return (
    <div
      className={mergeClasses(
        s.panelShell,
        visible && s.panelShellOpen,
        !transitionEnabled && s.panelShellNoTransition,
        electronChrome && s.panelShellElectron,
      )}
      style={{ width: typeof shellWidth === 'number' ? `${shellWidth}px` : shellWidth }}
    >
      <aside
        className={mergeClasses(s.panel, 'opptrix-right-panel')}
        style={fullWidth
          ? { width: '100%' }
          : { width: `${width}px`, minWidth: `${width}px` }}
        aria-label={showPreview ? '文件预览' : '行情与自选'}
        aria-hidden={!visible}
      >
        {showPreview ? (
          <FilePreviewPanel
            sessionId={previewSid}
            attachment={previewAttachment}
            panelVisible={visible}
            onClose={onClosePreview ?? (() => {})}
            onSelectAttachment={onSelectAttachment}
            electronChrome={electronChrome}
            chatColumnVisible={chatColumnVisible}
            chromeToolbarReserve={chromeToolbarReserve}
            panelFullWidth={fullWidth}
          />
        ) : (
          <RightMarketPanel
            panelVisible={visible}
            electronChrome={electronChrome}
            chatColumnVisible={chatColumnVisible}
            chromeToolbarReserve={chromeToolbarReserve}
            panelFullWidth={fullWidth}
            focusStockCode={focusStockCode}
            onFocusStockConsumed={onFocusStockConsumed}
            onToggleRightPanel={visible ? onToggleRightPanel : undefined}
            onToggleChatColumn={visible ? onToggleChatColumn : undefined}
            onDiscussInChat={visible ? onDiscussInChat : undefined}
          />
        )}
      </aside>
    </div>
  )
}

export default memo(RightPanel)
