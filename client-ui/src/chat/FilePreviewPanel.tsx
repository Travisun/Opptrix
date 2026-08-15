import { useEffect, useState } from 'react'
import { Spinner, makeStyles, mergeClasses } from '@fluentui/react-components'
import {
  DismissRegular,
  DocumentTextRegular,
  TextBulletListSquareRegular,
} from '@fluentui/react-icons'
import type { ChatAttachmentMeta } from '../types/chat'
import {
  fetchAttachmentPreviewText,
  fetchAttachmentRawText,
  fetchSessionAttachmentMeta,
  sessionAttachmentUrl,
} from '../api/client'
import CanvasPreviewHost from './CanvasPreviewHost'
import WebPreviewHost from './WebPreviewHost'
import FilePreviewFileList from './FilePreviewFileList'
import MarkdownMessage from './MarkdownMessage'
import ImagePreviewViewer from './ImagePreviewViewer'
import MediaPreviewPlayer from './MediaPreviewPlayer'
import MindmapPreviewHost from './MindmapPreviewHost'
import PdfPreviewViewer from './PdfPreviewViewer'
import FilenameEllipsis from './FilenameEllipsis'
import ChromeToolButton from '../desktop/ChromeToolButton'
import {
  DESKTOP_CHROME_TOP_OFFSET,
  DESKTOP_SIDEBAR_TOOL_ICON_PADDING,
  DESKTOP_SIDEBAR_TOOL_ICON_SIZE,
  DESKTOP_TITLEBAR_HEIGHT,
  DESKTOP_TOOL_GAP,
  DESKTOP_Z_PANEL_TITLE,
} from '../desktop/constants'
import { electronPlatform } from '../platform/detect'
import { opptrixCssVars } from '../theme/tokens'

const MONO_FONT = 'var(--opptrix-font-mono)'

const useStyles = makeStyles({
  root: {
    height: '100%',
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: opptrixCssVars.canvas,
  },
  /** Electron: let ancestor right-panel / app-main tint show through. */
  rootElectron: {
    backgroundColor: 'transparent',
  },
  header: {
    flexShrink: 0,
    height: `${DESKTOP_TITLEBAR_HEIGHT}px`,
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    gap: '0',
    paddingLeft: '0',
    paddingRight: '8px',
    borderBottom: `1px solid ${opptrixCssVars.separatorHairline}`,
    backgroundColor: opptrixCssVars.canvas,
    position: 'relative',
    zIndex: DESKTOP_Z_PANEL_TITLE,
  },
  headerElectronFill: {
    backgroundColor: 'transparent',
  },
  headerWeb: {
    height: '40px',
    zIndex: 1,
  },
  /**
   * Match DesktopWindowChrome / RightMarketPanel: top inset + center within
   * remaining chromeBand so tools / title share the left chrome midline.
   */
  headerElectron: {
    paddingTop: `${DESKTOP_CHROME_TOP_OFFSET}px`,
  },
  headerElectronWin: {
    paddingRight: '12px',
  },
  headerElectronMac: {
    paddingRight: '12px',
  },
  titleBarDragLead: {
    flex: '0 0 auto',
    alignSelf: 'stretch',
    minWidth: '8px',
  },
  titleCluster: {
    flex: '0 1 auto',
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    height: '28px',
    paddingLeft: '8px',
    overflow: 'hidden',
  },
  headerTrail: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: `${DESKTOP_TOOL_GAP}px`,
    height: '28px',
  },
  /** 非 PDF 预览内部工具条（与 PdfPreviewViewer toolbar 对齐） */
  previewTools: {
    flexShrink: 0,
    height: '34px',
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    padding: '0 8px',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    backgroundColor: opptrixCssVars.canvas,
  },
  name: {
    flex: '0 1 auto',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: opptrixCssVars.textPrimary,
    fontSize: 'var(--opptrix-font-base)',
    lineHeight: 1,
  },
  /** 次级工具条左侧文件名 */
  toolsTitle: {
    flex: '0 1 auto',
    minWidth: 0,
    maxWidth: '80%',
    color: opptrixCssVars.textPrimary,
    fontSize: 'var(--opptrix-font-sm)',
    userSelect: 'none',
  },
  dragFill: {
    flex: '1 1 auto',
    minWidth: '8px',
    alignSelf: 'stretch',
  },
  body: {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
  },
  bodyFlush: {
    padding: 0,
    overflow: 'hidden',
  },
  /** Center file picker fills the pane; list scrolls inside. */
  bodyPicker: {
    padding: 0,
    overflow: 'hidden',
  },
  artifactHost: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    padding: '12px 16px 16px',
    boxSizing: 'border-box',
  },
  /** Canvas preview: flush to edges (no inset padding). */
  artifactHostFlush: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    padding: 0,
    boxSizing: 'border-box',
  },
  loading: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pre: {
    margin: 0,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontFamily: 'inherit',
    color: opptrixCssVars.textPrimary,
    fontSize: 'var(--opptrix-font-md)',
    lineHeight: '1.6',
  },
  preMono: {
    fontFamily: MONO_FONT,
  },
  unsupported: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    textAlign: 'center',
    padding: '16px',
  },
  unsupportedTitle: {
    color: opptrixCssVars.textPrimary,
    fontSize: 'var(--opptrix-font-base)',
  },
  unsupportedHint: {
    color: opptrixCssVars.textTertiary,
    fontSize: 'var(--opptrix-font-sm)',
  },
  unsupportedDetail: {
    color: opptrixCssVars.textTertiary,
    fontSize: 'var(--opptrix-font-sm)',
    wordBreak: 'break-word',
  },
  emptyState: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    textAlign: 'center',
    padding: '24px 20px',
  },
  emptyIcon: {
    display: 'inline-flex',
    color: opptrixCssVars.textTertiary,
    marginBottom: '4px',
  },
  emptyTitle: {
    color: opptrixCssVars.textPrimary,
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 600,
    lineHeight: 1.45,
  },
  emptyHint: {
    color: opptrixCssVars.textSecondary,
    fontSize: 'var(--opptrix-font-md)',
    lineHeight: 1.55,
    maxWidth: '28ch',
  },
  main: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  previewPane: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  /** 音视频：播放器 + 转写文稿纵向分区 */
  mediaBody: {
    padding: 0,
    overflow: 'hidden',
  },
  mediaLayout: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  mediaTranscript: {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
  },
  mediaTranscriptLabel: {
    flexShrink: 0,
    marginBottom: '8px',
    color: opptrixCssVars.textSecondary,
    fontSize: 'var(--opptrix-font-sm)',
    userSelect: 'none',
  },
})

export interface FilePreviewTarget {
  sessionId: string
  attachment: ChatAttachmentMeta
}

interface Props {
  sessionId?: string
  attachment?: ChatAttachmentMeta | null
  panelVisible: boolean
  onClose: () => void
  onSelectAttachment?: (attachment: ChatAttachmentMeta) => void
  electronChrome?: boolean
  chatColumnVisible?: boolean
  /** Skip left global toolbar band when sidebar overlay + panel spans full width. */
  chromeToolbarReserve?: number
  /** Right panel occupies full workspace width (chat column hidden). */
  panelFullWidth?: boolean
}

function isMarkdown(name: string): boolean {
  return /\.(md|markdown)$/i.test(name)
}

function isMonospaceText(name: string): boolean {
  return /\.(txt|csv|json)$/i.test(name)
}

function isPlainTextAttachment(attachment: ChatAttachmentMeta): boolean {
  if (attachment.kind === 'text') return true
  const mime = attachment.mime.toLowerCase().split(';')[0]?.trim() ?? ''
  if (
    mime === 'text/plain'
    || mime === 'text/markdown'
    || mime === 'text/x-markdown'
    || mime === 'text/csv'
    || mime === 'application/json'
    || mime === 'application/xml'
    || mime === 'text/xml'
    || mime === 'text/html'
  ) {
    return true
  }
  return /\.(txt|md|markdown|csv|json|xml|html|htm|log)$/i.test(attachment.name)
}

async function fetchDocumentPreviewResult(
  sessionId: string,
  attachment: ChatAttachmentMeta,
): Promise<{ phase: 'ready'; text: string } | { phase: 'failed'; message: string | null } | { phase: 'pending' }> {
  const meta = await fetchSessionAttachmentMeta(sessionId, attachment.id)
  const status = meta.extract?.status
  const plainText = isPlainTextAttachment(meta) || isPlainTextAttachment(attachment)

  // 纯文本：先试 extract/text；失败则直读原文（不依赖服务端 extract）
  if (plainText) {
    const res = await fetchAttachmentPreviewText(sessionId, attachment.id)
    if (res.ok) return { phase: 'ready', text: res.text }
    const raw = await fetchAttachmentRawText(sessionId, attachment.id)
    if (raw.ok) return { phase: 'ready', text: raw.text }
    // 仅展示固定友好短句，不透传技术向 extract 错误
    return { phase: 'failed', message: null }
  }

  if (status === 'ready') {
    const res = await fetchAttachmentPreviewText(sessionId, attachment.id)
    if (res.ok) return { phase: 'ready', text: res.text }
    if (res.status === 'failed') return { phase: 'failed', message: res.message ?? null }
    return { phase: 'pending' }
  }

  if (status === 'failed') {
    return { phase: 'failed', message: meta.extract?.error ?? null }
  }
  return { phase: 'pending' }
}

function UnsupportedState({
  title = '暂不支持预览此文件',
  hint,
  detail,
}: {
  title?: string
  hint?: string
  detail?: string
}) {
  const s = useStyles()
  return (
    <div className={s.unsupported}>
      <span className={s.unsupportedTitle}>{title}</span>
      {hint ? <span className={s.unsupportedHint}>{hint}</span> : null}
      {detail ? <span className={s.unsupportedDetail}>{detail}</span> : null}
    </div>
  )
}

function useDocumentText(
  sessionId: string,
  attachment: ChatAttachmentMeta,
  panelVisible: boolean,
) {
  const [phase, setPhase] = useState<'pending' | 'ready' | 'failed'>('pending')
  const [text, setText] = useState('')
  const [failed, setFailed] = useState<string | null>(null)
  const { id, extract } = attachment
  const plainText = isPlainTextAttachment(attachment)

  useEffect(() => {
    if (!panelVisible) return
    let cancelled = false
    let timer: number | undefined
    let consecutiveErrors = 0
    const stop = () => {
      if (timer != null) window.clearInterval(timer)
      timer = undefined
    }
    const finish = (next: { phase: 'ready'; text: string } | { phase: 'failed'; message: string | null }) => {
      stop()
      setPhase(next.phase)
      if (next.phase === 'ready') setText(next.text)
      else setFailed(next.message)
    }
    // 纯文本即使 meta 已标 failed，仍尝试拉原文预览
    if (extract?.status === 'failed' && !plainText) {
      finish({ phase: 'failed', message: extract.error ?? null })
      return
    }
    const poll = async () => {
      if (cancelled) return
      try {
        const result = await fetchDocumentPreviewResult(sessionId, attachment)
        if (cancelled) return
        consecutiveErrors = 0
        if (result.phase === 'pending') return
        finish(result)
      } catch {
        if (++consecutiveErrors > 6) finish({ phase: 'failed', message: '该文件暂时无法预览' })
      }
    }
    setPhase('pending')
    void poll()
    timer = window.setInterval(() => { void poll() }, 1200)
    return () => { cancelled = true; stop() }
  }, [panelVisible, sessionId, id, extract, plainText, attachment.kind, attachment.mime, attachment.name])

  return { phase, text, failed, plainText }
}

function DocumentPreview({
  sessionId,
  attachment,
  panelVisible,
}: {
  sessionId: string
  attachment: ChatAttachmentMeta
  panelVisible: boolean
}) {
  const s = useStyles()
  const { phase, text, failed, plainText } = useDocumentText(sessionId, attachment, panelVisible)

  if (phase === 'failed') {
    return (
      <UnsupportedState
        title={plainText ? '暂时无法预览' : '文档未能整理'}
        hint={plainText ? '暂时读不出这份文本，请换一份或稍后再试' : '可尝试上传可读文件后重新预览'}
        detail={failed ?? undefined}
      />
    )
  }
  if (phase === 'pending') {
    return (
      <div className={s.loading}>
        <Spinner size="small" label={plainText ? '正在加载文本…' : '正在整理文档，请稍候…'} />
      </div>
    )
  }
  if (isMarkdown(attachment.name)) {
    return <MarkdownMessage content={text} sessionId={sessionId} />
  }
  return (
    <pre className={mergeClasses(s.pre, isMonospaceText(attachment.name) && s.preMono)}>
      {text}
    </pre>
  )
}

function MediaTranscript({
  sessionId,
  attachment,
  panelVisible,
}: {
  sessionId: string
  attachment: ChatAttachmentMeta
  panelVisible: boolean
}) {
  const s = useStyles()
  const { phase, text } = useDocumentText(sessionId, attachment, panelVisible)

  if (phase === 'failed') {
    return (
      <UnsupportedState
        title="未能识别语音内容"
        hint="可换一段更清晰的录音后再试，或直接发送文件继续对话"
      />
    )
  }
  if (phase === 'pending') {
    return (
      <div className={s.loading}>
        <Spinner size="small" label="正在转写语音…" />
      </div>
    )
  }
  if (!text.trim()) {
    return (
      <UnsupportedState
        title="暂无转写文稿"
        hint="可直接播放上方内容，或发送文件继续对话"
      />
    )
  }
  return (
    <>
      <span className={s.mediaTranscriptLabel}>转写文稿</span>
      <pre className={s.pre}>{text}</pre>
    </>
  )
}

function MediaPreview({
  sessionId,
  attachment,
  url,
  panelVisible,
}: {
  sessionId: string
  attachment: ChatAttachmentMeta
  url: string
  panelVisible: boolean
}) {
  const s = useStyles()
  const kind = attachment.kind === 'video' ? 'video' : 'audio'

  return (
    <div className={s.mediaLayout}>
      <MediaPreviewPlayer
        url={url}
        kind={kind}
        title={attachment.name}
        panelVisible={panelVisible}
      />
      <div className={s.mediaTranscript}>
        <MediaTranscript
          sessionId={sessionId}
          attachment={attachment}
          panelVisible={panelVisible}
        />
      </div>
    </div>
  )
}

export default function FilePreviewPanel({
  sessionId = '',
  attachment = null,
  panelVisible,
  onClose,
  onSelectAttachment,
  electronChrome = false,
  chatColumnVisible = true,
  chromeToolbarReserve = 0,
  panelFullWidth = false,
}: Props) {
  const s = useStyles()
  const [fileListOpen, setFileListOpen] = useState(false)
  const [outlineOpen, setOutlineOpen] = useState(false)
  useEffect(() => {
    setOutlineOpen(false)
  }, [sessionId, attachment?.id])
  useEffect(() => {
    if (!attachment) setFileListOpen(false)
  }, [attachment])
  const hasAttachment = Boolean(attachment)
  const showCenterPicker = !hasAttachment && Boolean(sessionId)
  const url = attachment && sessionId ? sessionAttachmentUrl(sessionId, attachment.id) : ''
  const isPdf = attachment?.kind === 'pdf'
  const isImage = attachment?.kind === 'image'
  const isCanvas = attachment?.kind === 'canvas'
  const isMindmap = attachment?.kind === 'mindmap'
  const isWeb = attachment?.kind === 'web'
  const isMedia = attachment?.kind === 'audio' || attachment?.kind === 'video'
  const bodyFlush = Boolean(attachment && (isPdf || isImage || isCanvas || isMindmap || isWeb))
  const electronWin = electronChrome && electronPlatform() !== 'darwin'
  /** Full-width panel: reserve global toolbar band as a dedicated drag zone. */
  const titleBarDragLeadWidth = electronChrome
    && panelFullWidth
    && !chatColumnVisible
    && chromeToolbarReserve > 0
    ? chromeToolbarReserve
    : 0

  const fileListToggleLabel = fileListOpen ? '收起文件列表' : '文件列表'
  const toggleFileList = () => setFileListOpen((open) => !open)
  const toggleOutline = () => setOutlineOpen((open) => !open)
  /** Left sidebar list only applies once a file is open for preview. */
  const showSidebarList = fileListOpen && Boolean(sessionId) && hasAttachment
  /** 非 PDF / 图片 / 画布 / 脑图且已打开附件时，在 previewPane 顶部显示文件名工具条（宿主自带文件名的类型除外） */
  const showNonPdfTools = hasAttachment
    && !isPdf
    && !isImage
    && !isCanvas
    && !isMindmap
    && !isWeb
    && !showCenterPicker

  return (
    <div className={mergeClasses(s.root, electronChrome && s.rootElectron)}>
      <div
        className={mergeClasses(
          s.header,
          !electronChrome && s.headerWeb,
          electronChrome && s.headerElectron,
          electronChrome && s.headerElectronFill,
          electronChrome && 'opptrix-right-panel-title-bar',
          electronChrome && (electronWin ? s.headerElectronWin : s.headerElectronMac),
        )}
      >
        {titleBarDragLeadWidth > 0 && (
          <div
            className={mergeClasses(s.titleBarDragLead, 'opptrix-right-panel-title-drag')}
            style={{ width: `${titleBarDragLeadWidth}px` }}
            aria-hidden
          />
        )}
        <div className={mergeClasses(s.titleCluster, 'opptrix-panel-title-no-drag')}>
          {attachment ? (
            <ChromeToolButton
              label={fileListToggleLabel}
              iconPadding={DESKTOP_SIDEBAR_TOOL_ICON_PADDING}
              active={showSidebarList}
              onClick={toggleFileList}
              disabled={!sessionId || !hasAttachment}
            >
              <TextBulletListSquareRegular fontSize={DESKTOP_SIDEBAR_TOOL_ICON_SIZE} />
            </ChromeToolButton>
          ) : (
            <span className={s.name}>文件预览</span>
          )}
        </div>
        <div
          className={mergeClasses(
            s.dragFill,
            electronChrome && 'opptrix-right-panel-title-drag',
          )}
          aria-hidden
        />
        <div className={mergeClasses(s.headerTrail, 'opptrix-panel-title-no-drag')}>
          <ChromeToolButton
            label="关闭预览"
            iconPadding={DESKTOP_SIDEBAR_TOOL_ICON_PADDING}
            onClick={onClose}
          >
            <DismissRegular fontSize={DESKTOP_SIDEBAR_TOOL_ICON_SIZE} />
          </ChromeToolButton>
        </div>
      </div>
      <div className={s.main}>
        {showSidebarList ? (
          <FilePreviewFileList
            variant="sidebar"
            sessionId={sessionId}
            panelVisible={panelVisible}
            selectedId={attachment?.id ?? null}
            onSelectAttachment={onSelectAttachment}
          />
        ) : null}
        <div className={s.previewPane}>
          {showNonPdfTools && attachment ? (
            <div className={s.previewTools} role="toolbar" aria-label="预览工具">
              <FilenameEllipsis name={attachment.name} className={s.toolsTitle} />
            </div>
          ) : null}
          <div
            className={mergeClasses(
              s.body,
              bodyFlush && s.bodyFlush,
              isMedia && s.mediaBody,
              showCenterPicker && s.bodyPicker,
            )}
          >
            {showCenterPicker ? (
              <FilePreviewFileList
                variant="picker"
                sessionId={sessionId}
                panelVisible={panelVisible}
                selectedId={null}
                onSelectAttachment={onSelectAttachment}
              />
            ) : !hasAttachment || !attachment ? (
              <div className={s.emptyState} role="status">
                <span className={s.emptyIcon} aria-hidden>
                  <DocumentTextRegular fontSize={36} />
                </span>
                <span className={s.emptyTitle}>还没有打开预览</span>
                <span className={s.emptyHint}>在对话里点击报告或附件，即可在这里查看</span>
              </div>
            ) : isImage ? (
              <ImagePreviewViewer
                url={url}
                alt={attachment.name}
                title={attachment.name}
                panelVisible={panelVisible}
              />
            ) : isPdf ? (
              <PdfPreviewViewer
                url={url}
                title={attachment.name}
                panelVisible={panelVisible}
                outlineOpen={outlineOpen}
                onToggleOutline={toggleOutline}
                showOutlineToggle
              />
            ) : isCanvas ? (
              <div className={s.artifactHostFlush}>
                <CanvasPreviewHost
                  sessionId={sessionId}
                  attachmentId={attachment.id}
                  name={attachment.name}
                  panelVisible={panelVisible}
                />
              </div>
            ) : isMindmap ? (
              <div className={s.artifactHostFlush}>
                <MindmapPreviewHost
                  sessionId={sessionId}
                  attachmentId={attachment.id}
                  name={attachment.name}
                  panelVisible={panelVisible}
                />
              </div>
            ) : isWeb ? (
              <div className={s.artifactHostFlush}>
                <WebPreviewHost
                  sessionId={sessionId}
                  attachmentId={attachment.id}
                  name={attachment.name}
                  panelVisible={panelVisible}
                />
              </div>
            ) : attachment.kind === 'document' ? (
              <DocumentPreview
                sessionId={sessionId}
                attachment={attachment}
                panelVisible={panelVisible}
              />
            ) : isMedia ? (
              <MediaPreview
                sessionId={sessionId}
                attachment={attachment}
                url={url}
                panelVisible={panelVisible}
              />
            ) : (
              <UnsupportedState />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
