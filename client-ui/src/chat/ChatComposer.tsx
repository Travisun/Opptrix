import { useRef, useEffect, useCallback, useState, useMemo, forwardRef, useImperativeHandle } from 'react'
import { Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { ArrowUpRegular, MicFilled, MicRegular, PauseFilled } from '@fluentui/react-icons'
import ModelSelector from './ModelSelector'
import type { SessionLlmParamsPatch } from './ModelSelector'
import ContextUsageMeter from './ContextUsageMeter'
import ComposerContextRefTag from './ComposerContextRefTag'
import ChatWorkspaceGrants, { type ChatWorkspaceGrantsHandle } from './ChatWorkspaceGrants'
import ComposerPlusMenu from './ComposerPlusMenu'
import ComposerStockMentionList from './ComposerStockMentionList'
import ComposerSkillSlashList from './ComposerSkillSlashList'
import ComposerAgentUserPromptPanel from './ComposerAgentUserPromptPanel'
import ComposerPromptQueuePanel from './ComposerPromptQueuePanel'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import type { QueuedPrompt } from './sessionPromptQueue'
import { useWatchlist } from '../market/useWatchlist'
import { useStockMention } from './useStockMention'
import { findSlashTrigger, useSkillSlash } from './useSkillSlash'
import type { AvailableModel, ChatAttachmentMeta, ChatContextUsage, SessionContextRef, SessionLlmParams } from '../types/chat'
import type { ChatUserPromptPayload, UserPromptAnswerPayload } from '../types/chatProgress'
import type { WatchlistItem } from '../types/market'
import type { PublicAgentSkill } from '../api/client'
import {
  displayCodeFromInstrument,
  marketDisplayName,
  normalizeWatchlistItem,
  resolveWatchlistInstrument,
  watchlistItemKey,
} from '../market/instrument'
import {
  captureCaretRange,
  clearEditor,
  collectChipKeys,
  createChipElement,
  editorHasContent,
  focusEditorEnd,
  focusEditorStart,
  getCaretTextContext,
  getSendText,
  insertChipAtCaret,
  insertLineBreakAtCaret,
  insertMentionChip,
  insertSlashChip,
  insertTextAtCaret,
  normalizeEmptyEditor,
  setEditorText,
  type InlineChipData,
} from './composerEditor'
import { useComposerSpeech } from './useComposerSpeech'
import ComposerSpeechListeningBar from './ComposerSpeechListeningBar'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
import { motion, primaryInteractive, ghostInteractive, interactiveTransition, fadeInUp } from '../theme/mixins'
import ComposerAttachmentStrip from './ComposerAttachmentStrip'
import { useComposerAttachments } from './useComposerAttachments'
import { resolveActiveModelMedia, modelAllowsAttachments, buildAcceptForMedia, isLegacyOfficeAttachment } from './mediaCapabilities'
import { listRowKey } from '../utils/listRowKey'
import { useOpptrixDialogAlert } from '../components/opptrix/OpptrixDialogAlert'

const LINE_HEIGHT = 1.45
const FONT_SIZE = 14
const ROW_PX = Math.round(FONT_SIZE * LINE_HEIGHT)
	/** 空态约一行；多行仍可长到 MAX */
	const MIN_TEXT_HEIGHT = ROW_PX
	const MAX_TEXT_HEIGHT = ROW_PX * 8
const ACTION_BTN = 28

const useStyles = makeStyles({
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    width: '100%',
    backgroundColor: 'transparent',
  },
  startersSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    paddingLeft: opptrixTokens.chatComposerPadding,
  },
  /** 空态入场；勿写死 opacity:0，否则常驻态关掉动画后会一直隐形 */
  startersSectionEnter: {
    ...fadeInUp,
    animationDuration: '480ms',
    animationDelay: '0.95s',
  },
  startersLabel: {
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 500,
    color: opptrixCssVars.textTertiary,
    letterSpacing: '0.01em',
  },
  starters: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  startersMobile: {
    flexWrap: 'nowrap',
    overflowX: 'auto',
  },
  /** 专家快捷：贴在 composer 输入区顶部；与「接下来」分区（无标题，省纵向空间） */
  expertStarterBar: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    boxSizing: 'border-box',
    margin: '0 0 2px',
    padding: '0 0 8px',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    overflow: 'hidden',
  },
  expertStarterTrack: {
    display: 'flex',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    overflowX: 'auto',
    overflowY: 'hidden',
  },
  starterChip: {
    borderRadius: opptrixTokens.radiusFull,
    fontWeight: 500,
    fontSize: 'var(--opptrix-font-base)',
    padding: '6px 14px',
    border: `1px solid ${opptrixCssVars.border}`,
    backgroundColor: opptrixCssVars.canvasAlt,
    color: opptrixCssVars.textSecondary,
    whiteSpace: 'nowrap',
    flexShrink: 0,
    transitionProperty: 'background-color, color, border-color, box-shadow',
    transitionDuration: motion.fast,
    ':hover': {
      backgroundColor: opptrixCssVars.surfaceHover,
      color: opptrixCssVars.textPrimary,
      border: `1px solid ${opptrixCssVars.separatorStrong}`,
    },
    ':focus-visible': {
      outline: `${opptrixTokens.focusRingWidth} solid ${opptrixCssVars.inputBorderFocus}`,
      outlineOffset: opptrixTokens.focusRingOffset,
    },
  },
  expertStarterChip: {
    backgroundColor: 'transparent',
  },
  panelWrap: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    width: '100%',
    boxSizing: 'border-box',
    backgroundColor: 'transparent',
  },
  panel: {
    ...interactiveTransition,
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    boxSizing: 'border-box',
	    /* 顶极小距避免贴边；左右/底保留，勿改 chatComposerPadding（starters/error 仍用） */
	    padding: '4px 12px 10px',
	    gap: '4px',
    borderRadius: opptrixTokens.chatComposerRadius,
    border: `1px solid ${opptrixCssVars.separatorHairline}`,
    backgroundColor: opptrixCssVars.canvas,
    boxShadow: opptrixCssVars.composerFloatShadow,
    ':hover': {
      border: `1px solid ${opptrixCssVars.separator}`,
      boxShadow: opptrixCssVars.composerFloatShadowHover,
    },
    ':focus-within': {
      border: `1px solid ${opptrixCssVars.separatorStrong}`,
      boxShadow: opptrixCssVars.composerFloatShadowFocus,
    },
  },
	  inputRow: {
	    display: 'flex',
	    flexDirection: 'column',
	    gap: '3px',
	    width: '100%',
	  },
		  /** 上行：全宽 editor（录音中仍可见已输入文字） */
		  editorRow: {
		    position: 'relative',
		    width: '100%',
		    minWidth: 0,
		    display: 'flex',
		    alignItems: 'center',
		  },
	  mentionAnchor: {
    position: 'absolute',
    left: 0,
    bottom: '2px',
    width: '24px',
    height: '20px',
    pointerEvents: 'none',
  },
  editor: {
    position: 'relative',
    width: '100%',
    minWidth: 0,
    minHeight: `${MIN_TEXT_HEIGHT}px`,
    maxHeight: `${MAX_TEXT_HEIGHT}px`,
    overflowY: 'auto',
    border: 'none',
    background: 'transparent',
    outline: 'none',
    fontSize: `${FONT_SIZE}px`,
    lineHeight: LINE_HEIGHT,
    fontFamily: 'inherit',
	    color: opptrixCssVars.textPrimary,
	    padding: '4px 0 2px',
	    margin: 0,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    cursor: 'text',
  },
  editorMobile: {
    fontSize: 'var(--opptrix-font-2xl)',
  },
  /** 下行 toolbar：左 +/授权 | 中弹性空白 | 右 模型/mic+send（可并存）/stop；与 28px 按钮齐平 */
  toolbarRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '6px',
    width: '100%',
    height: `${ACTION_BTN}px`,
    minHeight: `${ACTION_BTN}px`,
    padding: 0,
    boxSizing: 'border-box',
  },
  toolbarStart: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    flex: '0 0 auto',
    minWidth: 0,
    height: `${ACTION_BTN}px`,
  },
  toolbarCenter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: '1 1 auto',
    minWidth: 0,
    height: `${ACTION_BTN}px`,
    overflow: 'hidden',
  },
  toolbarEnd: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '4px',
    flex: '0 1 auto',
    minWidth: 0,
    height: `${ACTION_BTN}px`,
  },
  /** 右侧模型区：窄宽时可收缩省略，不挤掉 28px 圆钮 */
  toolbarModel: {
    display: 'flex',
    alignItems: 'center',
    minWidth: 0,
    flex: '0 1 auto',
    maxWidth: '168px',
    overflow: 'hidden',
  },
  /**
   * 录音/识别：纵向柱波叠在整个 panel 正中（非 toolbar 中缝）。
   * 轻遮罩挡住空态 placeholder / 底稿；overlay 不拦截点击，ListeningBar 自身 pointer-events:auto。
   */
  speechListeningOverlay: {
    position: 'absolute',
    inset: 0,
    zIndex: 2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    padding: '8px 12px',
    boxSizing: 'border-box',
    borderRadius: opptrixTokens.chatComposerRadius,
    backgroundColor: 'color-mix(in srgb, var(--opptrix-canvas) 92%, transparent)',
  },
  /** 发送 / 停止：accent 实心圆 */
  sendBtn: {
    ...primaryInteractive,
    borderRadius: opptrixTokens.radiusFull,
    minWidth: `${ACTION_BTN}px`,
    maxWidth: `${ACTION_BTN}px`,
    width: `${ACTION_BTN}px`,
    minHeight: `${ACTION_BTN}px`,
    maxHeight: `${ACTION_BTN}px`,
    height: `${ACTION_BTN}px`,
    padding: 0,
    flexShrink: 0,
  },
	  /** 空态仅麦：primary 实心圆，与发送同级 CTA */
	  micBtn: {
	    ...primaryInteractive,
	    borderRadius: opptrixTokens.radiusFull,
	    minWidth: `${ACTION_BTN}px`,
	    maxWidth: `${ACTION_BTN}px`,
	    width: `${ACTION_BTN}px`,
	    minHeight: `${ACTION_BTN}px`,
	    maxHeight: `${ACTION_BTN}px`,
	    height: `${ACTION_BTN}px`,
	    padding: 0,
	    flexShrink: 0,
	    /* 缩短背景过渡，减少与录音红圆切态残影 */
	    transitionProperty: 'background-color, color, opacity, border-color, box-shadow',
	    transitionDuration: motion.fast,
	  },
	  /**
	   * 有发送时左侧麦：透明图标次级；静止无实心底，hover 极轻 surfaceHover。
	   * 显式清背景与伪层，盖住 Fluent appearance 残留。
	   */
	  micBtnGhost: {
	    ...ghostInteractive,
	    borderRadius: opptrixTokens.radiusFull,
	    minWidth: `${ACTION_BTN}px`,
	    maxWidth: `${ACTION_BTN}px`,
	    width: `${ACTION_BTN}px`,
	    minHeight: `${ACTION_BTN}px`,
	    maxHeight: `${ACTION_BTN}px`,
	    height: `${ACTION_BTN}px`,
	    padding: 0,
	    flexShrink: 0,
	    color: opptrixCssVars.textSecondary,
	    backgroundColor: 'transparent',
	    backgroundImage: 'none',
	    /* 缩短背景过渡，减少从录音红圆切回时的残影感 */
	    transitionProperty: 'color, opacity, border-color, box-shadow',
	    transitionDuration: motion.fast,
	    ':hover': {
	      backgroundColor: opptrixCssVars.surfaceHover,
	      backgroundImage: 'none',
	      color: opptrixCssVars.textPrimary,
	    },
	    ':active': {
	      backgroundColor: opptrixCssVars.surfaceHover,
	      backgroundImage: 'none',
	      opacity: opptrixTokens.activeOpacity,
	    },
	    ':focus': {
	      backgroundColor: 'transparent',
	      backgroundImage: 'none',
	    },
	    '::after': {
	      backgroundColor: 'transparent',
	      backgroundImage: 'none',
	    },
	  },
  /** 录音中底座：与红圆叠加；不用 primaryInteractive，避免切态残留 accent */
  micBtnRecordingBase: {
    borderRadius: opptrixTokens.radiusFull,
    minWidth: `${ACTION_BTN}px`,
    maxWidth: `${ACTION_BTN}px`,
    width: `${ACTION_BTN}px`,
    minHeight: `${ACTION_BTN}px`,
    maxHeight: `${ACTION_BTN}px`,
    height: `${ACTION_BTN}px`,
    padding: 0,
    flexShrink: 0,
    border: 'none',
    backgroundImage: 'none',
  },
  stopBtn: {
    ...primaryInteractive,
    borderRadius: opptrixTokens.radiusFull,
    minWidth: `${ACTION_BTN}px`,
    maxWidth: `${ACTION_BTN}px`,
    width: `${ACTION_BTN}px`,
    minHeight: `${ACTION_BTN}px`,
    maxHeight: `${ACTION_BTN}px`,
    height: `${ACTION_BTN}px`,
    padding: 0,
    flexShrink: 0,
    backgroundColor: opptrixCssVars.textSecondary,
    ':hover': {
      backgroundColor: opptrixCssVars.textPrimary,
      color: opptrixCssVars.accentForeground,
    },
  },
  error: {
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.error,
    padding: `0 0 0 ${opptrixTokens.chatComposerPadding}`,
    animationDuration: motion.fast,
    animationName: {
      from: { opacity: 0 },
      to: { opacity: 1 },
    },
  },
  /**
   * 录音中：红色实心圆。须压过 Opptrix ghost / Fluent subtle 的 hover color（textPrimary），
   * 图标保持 accentForeground；背景仅略加深，勿变黑底。
   */
  micRecording: {
    backgroundColor: opptrixCssVars.error,
    color: opptrixCssVars.accentForeground,
    ':hover': {
      backgroundColor: `color-mix(in srgb, ${opptrixCssVars.error} 88%, ${opptrixCssVars.textPrimary})`,
      color: opptrixCssVars.accentForeground,
    },
    ':active': {
      backgroundColor: `color-mix(in srgb, ${opptrixCssVars.error} 80%, ${opptrixCssVars.textPrimary})`,
      color: opptrixCssVars.accentForeground,
    },
    ':focus': {
      color: opptrixCssVars.accentForeground,
    },
    ':focus-visible': {
      color: opptrixCssVars.accentForeground,
    },
    '& .fui-Button__icon': {
      color: opptrixCssVars.accentForeground,
    },
    '& svg': {
      color: opptrixCssVars.accentForeground,
      fill: 'currentColor',
    },
    ':hover .fui-Button__icon': {
      color: opptrixCssVars.accentForeground,
    },
    ':hover svg': {
      color: opptrixCssVars.accentForeground,
      fill: 'currentColor',
    },
    ':active .fui-Button__icon': {
      color: opptrixCssVars.accentForeground,
    },
    ':active svg': {
      color: opptrixCssVars.accentForeground,
      fill: 'currentColor',
    },
  },
  /**
   * 输入卡下方底栏：含 AI 提示行 + bottomInset。
   * 透明——消息淡出由 ChatView scrollViewport mask，底盘与主区同色/透底。
   */
  composerFooter: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    width: '100%',
    boxSizing: 'border-box',
    backgroundColor: 'transparent',
    paddingBottom: opptrixTokens.chatComposerBottomInset,
  },
  composerFooterMobile: {
    paddingBottom: `max(${opptrixTokens.chatComposerBottomInset}, env(safe-area-inset-bottom))`,
  },
  /** 底栏 AI 提示行：轻量居中文案 + 右侧上下文用量（无独立底色） */
  disclaimerRow: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
    width: '100%',
    margin: '2px 0 0',
    padding: '4px 10px 0',
    boxSizing: 'border-box',
    userSelect: 'none',
  },
  disclaimerSide: {
    flex: '1 1 0',
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
  },
  disclaimerSideEnd: {
    justifyContent: 'flex-end',
  },
  disclaimer: {
    flexShrink: 0,
    textAlign: 'center',
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: 1.4,
    color: opptrixCssVars.textTertiary,
    margin: 0,
    padding: '0 8px',
  },
})

interface ChatComposerProps {
  /** 父组件注入草稿（revision 递增时同步到输入框） */
  draftSync?: { revision: number; text: string }
  sessionId?: string | null
  loading: boolean
  error: string
  isEmpty: boolean
  /**
   * 为 true 时即使会话非空也展示 starters（专家对话快捷提问常驻）。
   * 普通对话仍仅在空态展示。
   */
  alwaysShowStarters?: boolean
  isMobile?: boolean
  contextRef?: SessionContextRef | null
  starters: Array<{ label: string; text: string }>
  welcomeKey?: number
  availableModels: AvailableModel[]
  sessionModel?: string
  sessionLlmParams?: SessionLlmParams | null
  contextUsage?: ChatContextUsage | null
  onSubmit: (text?: string, attachmentIds?: string[], attachmentMetas?: ChatAttachmentMeta[]) => void
  onStop?: () => void
  onModelChange?: (ref: string) => void
  onLlmParamsChange?: (patch: SessionLlmParamsPatch) => void
  onClearContextRef?: () => void
  ensureSession?: () => Promise<string>
  userPrompt?: ChatUserPromptPayload | null
  userPromptSubmitting?: boolean
  onUserPromptSubmit?: (answer: UserPromptAnswerPayload) => void
  /** 当前会话待执行任务（pin 在 composer 上方） */
  promptQueue?: QueuedPrompt[]
  onPromptQueueRemove?: (id: string) => void
  onPromptQueueRunNow?: (id: string) => void
  onOpenPreview?: (sessionId: string, attachment: ChatAttachmentMeta) => void
}

/** 供 ChatView 在消息区 drop 时调用，避免重复 pin 状态 */
export type ChatComposerHandle = {
  addDroppedFiles: (files: FileList | File[]) => void
}

const ChatComposer = forwardRef<ChatComposerHandle, ChatComposerProps>(function ChatComposer({
  draftSync,
  sessionId = null,
  loading,
  error,
  isEmpty,
  alwaysShowStarters = false,
  isMobile = false,
  contextRef = null,
  starters,
  welcomeKey = 0,
  availableModels,
  sessionModel,
  sessionLlmParams,
  contextUsage,
  onSubmit,
  onStop,
  onModelChange,
  onLlmParamsChange,
  onClearContextRef,
  ensureSession,
  userPrompt = null,
  userPromptSubmitting = false,
  onUserPromptSubmit,
  promptQueue = [],
  onPromptQueueRemove,
  onPromptQueueRunNow,
  onOpenPreview,
}, ref) {
  const s = useStyles()
  const editorRef = useRef<HTMLDivElement>(null)
  const mentionAnchorRef = useRef<HTMLSpanElement>(null)
  // composingRef: 中文/IME 输入合成期间，跳过 @ 提及检测，避免误触发与卡顿。
  const composingRef = useRef(false)
  // 最近一次编辑器内的光标快照：点菜单项插入 chip 时实时 selection 已被扰动，须用快照定位。
  const caretRangeRef = useRef<Range | null>(null)
  // 有无可发送内容（文字或 chip）；驱动发送按钮与 placeholder。
  const [hasContent, setHasContent] = useState(false)
  const [speechError, setSpeechError] = useState('')
  const {
    pinned,
    uploading,
    toast: attachmentToast,
    fileInputRef,
    addFiles,
    removePinned,
    reconcileWithModel,
    clearPinned,
    openFilePicker,
    attachmentIds,
  } = useComposerAttachments(sessionId, ensureSession)

  const { confirm } = useOpptrixDialogAlert()

  const activeMedia = useMemo(
    () => resolveActiveModelMedia(availableModels, sessionModel),
    [availableModels, sessionModel],
  )

  const acceptTypes = useMemo(() => buildAcceptForMedia(activeMedia), [activeMedia])
  const attachmentsAllowed = modelAllowsAttachments(activeMedia)

  /** 选文件/拖拽上传前：旧格式确认；取消则跳过 .doc/.ppt，其余继续 */
  const offerFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files)
    if (!list.length) return
    const hasLegacy = list.some(isLegacyOfficeAttachment)
    if (!hasLegacy) {
      await addFiles(list, activeMedia)
      return
    }
    const ok = await confirm({
      title: '格式较旧',
      message: '这份文件格式较旧，请将其转换为PDF/DOCX格式后上传，否则文中的图片无法被识别。',
      confirmLabel: '仍要上传',
      cancelLabel: '取消',
    })
    const toUpload = ok ? list : list.filter(f => !isLegacyOfficeAttachment(f))
    if (toUpload.length) await addFiles(toUpload, activeMedia)
  }, [activeMedia, addFiles, confirm])

  useEffect(() => {
    reconcileWithModel(activeMedia)
  }, [activeMedia, reconcileWithModel])

  const { items: watchlistItems } = useWatchlist()

  const {
    state: mentionState,
    matches: mentionMatches,
    syncFromInput: syncMentionFromInput,
    close: closeMention,
    moveActive: moveMentionActive,
    clampActiveIndex,
    setMentionActiveIndex,
  } = useStockMention(watchlistItems)

  const {
    state: slashState,
    matches: slashMatches,
    loading: slashLoading,
    loadError: slashLoadError,
    syncFromInput: syncSlashFromInput,
    close: closeSlash,
    moveActive: moveSlashActive,
    clampActiveIndex: clampSlashActiveIndex,
    setActiveIndex: setSlashActiveIndex,
  } = useSkillSlash()

  useEffect(() => {
    clampActiveIndex()
  }, [clampActiveIndex, mentionMatches.length])

  useEffect(() => {
    clampSlashActiveIndex()
  }, [clampSlashActiveIndex, slashMatches.length])

  // 从编辑器 DOM 刷新可发送状态；空态时去掉残留 <br>，避免光标落在 placeholder 右侧。
  const refreshContentState = useCallback(() => {
    const root = editorRef.current
    if (!root) {
      setHasContent(false)
      return
    }
    // IME 合成中不要清空 DOM，否则会打断拼音。
    if (!composingRef.current && normalizeEmptyEditor(root) && document.activeElement === root) {
      focusEditorStart(root)
    }
    setHasContent(editorHasContent(root))
  }, [])

  // 根据当前光标上下文，驱动 @ / 面板（互斥，同时只开一个）。
  const syncTriggers = useCallback(() => {
    if (composingRef.current) return
    const root = editorRef.current
    if (!root) return
    // 每次光标/输入变动都快照当前 Range，供随后「点菜单项」插入时定位。
    caretRangeRef.current = captureCaretRange(root)
    const { text, offset } = getCaretTextContext(root)
    // `/` 有效时优先技能面板，避免与 `@` 同时打开。
    if (findSlashTrigger(text, offset)) {
      syncSlashFromInput(text, offset)
      closeMention()
      return
    }
    closeSlash()
    syncMentionFromInput(text, offset)
  }, [closeMention, closeSlash, syncMentionFromInput, syncSlashFromInput])

  // 草稿同步（父组件注入）：重置编辑器为纯文本。
  useEffect(() => {
    if (!draftSync) return
    const root = editorRef.current
    if (!root) return
    setEditorText(root, draftSync.text)
    closeMention()
    closeSlash()
    refreshContentState()
  }, [draftSync, closeMention, closeSlash, refreshContentState])

  const buildChipData = useCallback((item: WatchlistItem): InlineChipData => {
    const row = normalizeWatchlistItem(item)
    const ref = resolveWatchlistInstrument(row)
    const code = displayCodeFromInstrument(ref)
    const market = ref.market !== 'CN' ? marketDisplayName(ref.market) : null
    return {
      key: watchlistItemKey(row),
      sendText: `${row.name}(${code})`,
      name: row.name,
      code,
      market,
    }
  }, [])

  const insertStockChip = useCallback((item: WatchlistItem) => {
    const root = editorRef.current
    if (!root) return
    // 用光标快照定位，避免点菜单项时实时 selection 退化到编辑器末尾。
    const savedRange = caretRangeRef.current
    root.focus()
    const data = buildChipData(item)
    if (collectChipKeys(root).includes(data.key)) {
      // 已存在同一标的：仅删除 @query 触发文本，不重复插入。
      const dup = createChipElement(data)
      insertMentionChip(root, dup, savedRange)
      dup.remove()
    } else {
      insertMentionChip(root, createChipElement(data), savedRange)
    }
    caretRangeRef.current = captureCaretRange(root)
    closeMention()
    closeSlash()
    refreshContentState()
  }, [buildChipData, closeMention, closeSlash, refreshContentState])

  const insertSkillChip = useCallback((skill: PublicAgentSkill, fromSlash = false) => {
    const root = editorRef.current
    if (!root) return
    const key = `skill:${skill.name}`
    const data: InlineChipData = {
      key,
      sendText: `@skill:${skill.name}`,
      name: skill.name,
    }
    root.focus()
    const savedRange = caretRangeRef.current
    if (collectChipKeys(root).includes(key)) {
      // 已引用同一技能：若来自 / 则仅删除触发段；否则聚焦末尾。
      if (fromSlash) {
        const dup = createChipElement(data)
        insertSlashChip(root, dup, savedRange)
        dup.remove()
      } else {
        focusEditorEnd(root)
      }
      closeSlash()
      closeMention()
      refreshContentState()
      return
    }
    if (fromSlash) {
      insertSlashChip(root, createChipElement(data), savedRange)
    } else {
      insertChipAtCaret(root, createChipElement(data), savedRange)
    }
    caretRangeRef.current = captureCaretRange(root)
    closeSlash()
    closeMention()
    refreshContentState()
  }, [closeMention, closeSlash, refreshContentState])

  const grantsRef = useRef<ChatWorkspaceGrantsHandle>(null)
  const pendingGrantsOpenRef = useRef(false)

  const handleSelectMention = useCallback((item: WatchlistItem) => {
    insertStockChip(item)
  }, [insertStockChip])

  const clearEditorContent = useCallback(() => {
    const root = editorRef.current
    if (root) {
      clearEditor(root)
      if (document.activeElement === root) focusEditorStart(root)
    }
    setHasContent(false)
  }, [])

  const handleSubmitMessage = useCallback((text?: string) => {
    const explicit = text?.trim()
    const metas = pinned.length ? pinned : undefined
    const ids = attachmentIds.length ? attachmentIds : undefined
    if (explicit) {
      onSubmit(explicit, ids, metas)
      clearEditorContent()
      clearPinned()
      return
    }
    const root = editorRef.current
    const composed = root ? getSendText(root).trim() : ''
    if ((!composed && !attachmentIds.length) || userPrompt || uploading) return
    onSubmit(composed || undefined, ids, metas)
    clearEditorContent()
    clearPinned()
  }, [attachmentIds, clearEditorContent, clearPinned, onSubmit, pinned, uploading, userPrompt])

  const hasSendPayload = hasContent || attachmentIds.length > 0
  const canEnqueueOrSend = hasSendPayload && !userPrompt && !uploading
  /** 生成中也可发送纯文字作为补充说明（soft steer） */
  const canSend = canEnqueueOrSend && (!loading || (hasContent && attachmentIds.length === 0))
  /** 仅 ask_user / 上传中锁定编辑；执行中仍可输入以补充或排队 */
  const composerLocked = Boolean(userPrompt) || uploading
  const showWelcomeStarters = starters.length > 0 && isEmpty && !alwaysShowStarters
  const showExpertStarterBar = alwaysShowStarters && starters.length > 0

  const handleAuthorizeFolders = useCallback(async () => {
    if (composerLocked) return
    if (!sessionId) {
      if (!ensureSession) return
      pendingGrantsOpenRef.current = true
      try {
        await ensureSession()
      } catch {
        pendingGrantsOpenRef.current = false
      }
      return
    }
    grantsRef.current?.open()
  }, [composerLocked, ensureSession, sessionId])

  useEffect(() => {
    if (!sessionId || !pendingGrantsOpenRef.current) return
    pendingGrantsOpenRef.current = false
    grantsRef.current?.open()
  }, [sessionId])

  const handleSpeechTranscript = useCallback((text: string) => {
    const root = editorRef.current
    if (!root) return
    insertTextAtCaret(root, text)
    refreshContentState()
    setSpeechError('')
  }, [refreshContentState])

  const {
    available: speechAvailable,
    phase: speechPhase,
    levelRms,
    isBusy: speechBusy,
    isRecording,
    toggle: toggleSpeech,
  } = useComposerSpeech({
    disabled: composerLocked || uploading,
    onTranscript: handleSpeechTranscript,
    onError: (message) => setSpeechError(message),
  })

  const speechListening = speechBusy
  const speechListeningPhase = speechPhase !== 'idle' ? speechPhase : null

  /** 右侧：loading 时 stop + 可发补充；非 loading 时 mic / send */
  const showStop = loading
  const showMic = !loading && speechAvailable
  const showSend = canSend
  /** 空态仅麦 → primary 实心底；与发送并排 → ghost 透明图标 */
  const micSolo = showMic && !showSend && !speechListening
  const micBesideSend = showMic && showSend && !speechListening

  const handleInput = useCallback(() => {
    refreshContentState()
    syncTriggers()
  }, [refreshContentState, syncTriggers])

  const handleCompositionStart = useCallback(() => {
    composingRef.current = true
  }, [])

  const handleCompositionEnd = useCallback(() => {
    composingRef.current = false
    refreshContentState()
    syncTriggers()
  }, [refreshContentState, syncTriggers])

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    const items = e.clipboardData.items
    const imageFiles: File[] = []
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const f = item.getAsFile()
        if (f) imageFiles.push(f)
      }
    }
    if (imageFiles.length) {
      e.preventDefault()
      void addFiles(imageFiles, activeMedia)
      return
    }
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    if (text) document.execCommand('insertText', false, text)
    refreshContentState()
    syncTriggers()
  }, [activeMedia, addFiles, refreshContentState, syncTriggers])

  useImperativeHandle(ref, () => ({
    addDroppedFiles: (files) => {
      if (composerLocked || uploading) return
      void offerFiles(files)
    },
  }), [composerLocked, offerFiles, uploading])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (composingRef.current) return

    if (slashState.open && slashMatches.length) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        moveSlashActive(1)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        moveSlashActive(-1)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const skill = slashMatches[slashState.activeIndex]
        if (skill) insertSkillChip(skill, true)
        return
      }
    }

    if (slashState.open && e.key === 'Escape') {
      e.preventDefault()
      closeSlash()
      return
    }

    if (mentionState.open && mentionMatches.length) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        moveMentionActive(1)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        moveMentionActive(-1)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const item = mentionMatches[mentionState.activeIndex]
        if (item) insertStockChip(item)
        return
      }
    }

    if (mentionState.open && e.key === 'Escape') {
      e.preventDefault()
      closeMention()
      return
    }

    if (e.key === 'Enter') {
      // Shift+Enter / Ctrl+Cmd+Enter: 插入换行。
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const root = editorRef.current
        if (root) {
          insertLineBreakAtCaret(root)
          refreshContentState()
        }
        return
      }
      // 普通 Enter：发送或加入排队。
      e.preventDefault()
      if (canEnqueueOrSend) handleSubmitMessage()
    }
  }

  const handleSelect = useCallback(() => {
    syncTriggers()
  }, [syncTriggers])

  // 失焦时延迟关闭面板，避免与菜单项点击（mousedown）产生时序竞争。
  const handleBlur = useCallback(() => {
    window.setTimeout(() => {
      if (composingRef.current) return
      closeMention()
      closeSlash()
    }, 120)
  }, [closeMention, closeSlash])

  return (
    <div className={s.wrap}>
      {showWelcomeStarters && (
        <div
          key={welcomeKey}
          className={mergeClasses(
            s.startersSection,
            s.startersSectionEnter,
          )}
        >
          <Text className={s.startersLabel}>你可以这样问</Text>
          <div className={mergeClasses(s.starters, isMobile && `${s.startersMobile} opptrix-scroll-x`)}>
            {starters.map((st, index) => (
              <OpptrixButton
                key={listRowKey(index, st.label, st.text)}
                className={s.starterChip}
                variant="pill"
                size="small"
                disabled={Boolean(userPrompt) || uploading}
                onClick={() => onSubmit(st.text)}
              >
                {st.label}
              </OpptrixButton>
            ))}
          </div>
        </div>
      )}

      {error && <div className={s.error} role="alert">{error}</div>}
      {speechError && !error && (
        <div className={s.error} role="alert">{speechError}</div>
      )}
      {attachmentToast && !error && !speechError && (
        <div className={s.error} role="status">{attachmentToast}</div>
      )}

      <div className={s.panelWrap}>
        {userPrompt && onUserPromptSubmit && (
          <ComposerAgentUserPromptPanel
            prompt={userPrompt}
            submitting={userPromptSubmitting}
            onSubmit={onUserPromptSubmit}
          />
        )}
        <div
          className={mergeClasses(s.panel, 'opptrix-composer-shell')}
        >
          {speechListening && speechListeningPhase && (
            <div className={s.speechListeningOverlay}>
              <ComposerSpeechListeningBar
                phase={speechListeningPhase}
                levelRms={levelRms}
                onEnd={isRecording ? toggleSpeech : undefined}
              />
            </div>
          )}
          {promptQueue.length > 0 && onPromptQueueRemove && onPromptQueueRunNow && (
            <ComposerPromptQueuePanel
              items={promptQueue}
              runNowDisabled={Boolean(userPrompt)}
              waitingConfirmHint={Boolean(userPrompt)}
              onRunNow={onPromptQueueRunNow}
              onRemove={onPromptQueueRemove}
            />
          )}
          {showExpertStarterBar && (
            <div
              className={s.expertStarterBar}
              role="region"
              aria-label="快捷提问"
              data-composer-section="starters"
            >
              <div className={mergeClasses(s.expertStarterTrack, 'opptrix-scroll-x')}>
                {starters.map((st, index) => (
                  <OpptrixButton
                    key={listRowKey(index, st.label, st.text)}
                    className={mergeClasses(s.starterChip, s.expertStarterChip)}
                    variant="pill"
                    size="small"
                    disabled={Boolean(userPrompt) || uploading}
                    onClick={() => onSubmit(st.text)}
                  >
                    {st.label}
                  </OpptrixButton>
                ))}
              </div>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            hidden
            multiple
            accept={acceptTypes || undefined}
            onChange={(e) => {
              const picked = e.target.files ? Array.from(e.target.files) : []
              e.target.value = ''
              if (picked.length) void offerFiles(picked)
            }}
          />
          <div className={s.inputRow}>
            {contextRef && (
              <ComposerContextRefTag
                contextRef={contextRef}
                onClear={onClearContextRef}
              />
            )}
            <ComposerAttachmentStrip
              items={pinned}
              sessionId={sessionId}
              onRemove={removePinned}
              onPreview={onOpenPreview && sessionId ? (item) => onOpenPreview(sessionId, item) : undefined}
            />
            <div className={s.editorRow}>
              <span ref={mentionAnchorRef} className={s.mentionAnchor} aria-hidden />
              <div
                ref={editorRef}
                className={mergeClasses(
                  s.editor,
                  isMobile && s.editorMobile,
                  'opptrix-scroll',
                  'opptrix-composer-editor',
                )}
                contentEditable={!composerLocked && !speechListening}
                suppressContentEditableWarning
                role="textbox"
                aria-multiline="true"
                aria-label="输入问题，@ 选择股票，/ 引用技能"
                data-placeholder={
                  loading
                    ? (isMobile ? '继续输入，可补充说明…' : '继续输入，发送后作为补充说明…')
                    : (isMobile
                      ? '输入问题，@ 股票，/ 技能…'
                      : '输入问题，@ 选择股票，/ 引用技能，Enter 发送…')
                }
                data-empty={hasContent || speechListening ? undefined : 'true'}
                data-speech-listening={speechListening ? 'true' : undefined}
                onInput={handleInput}
                onKeyDown={handleKeyDown}
                onKeyUp={handleSelect}
                onMouseUp={handleSelect}
                onPaste={handlePaste}
                onCompositionStart={handleCompositionStart}
                onCompositionEnd={handleCompositionEnd}
                onBlur={handleBlur}
              />
            </div>
            <div className={s.toolbarRow}>
              <div className={s.toolbarStart}>
                <ComposerPlusMenu
                  disabled={composerLocked || speechListening}
                  attachmentsAllowed={attachmentsAllowed && !uploading}
                  grantsAvailable={Boolean(sessionId || ensureSession)}
                  onAttach={openFilePicker}
                  onAuthorizeFolders={() => { void handleAuthorizeFolders() }}
                  onSelectSkill={(skill) => insertSkillChip(skill, false)}
                />
                <ChatWorkspaceGrants
                  ref={grantsRef}
                  sessionId={sessionId ?? null}
                  variant="dialog-only"
                  disabled={composerLocked || speechListening}
                />
              </div>
              <div className={s.toolbarCenter} />
              <div className={s.toolbarEnd}>
                {onModelChange && (
                  <div className={s.toolbarModel}>
                    <ModelSelector
                      models={availableModels}
                      value={sessionModel}
                      disabled={composerLocked || speechListening}
                      isMobile={isMobile}
                      compact
                      showParams
                      llmParams={sessionLlmParams}
                      onLlmParamsChange={onLlmParamsChange}
                      onChange={onModelChange}
                    />
                  </div>
                )}
                {showStop && (
                  <OpptrixButton
                    className={mergeClasses(s.stopBtn, 'opptrix-round-icon-btn')}
                    variant="primary"
                    icon={<PauseFilled fontSize={14} />}
                    disabled={!onStop}
                    onClick={() => onStop?.()}
                    aria-label="停止生成"
                  />
                )}
                {showMic && (
                  <OpptrixButton
                    className={mergeClasses(
                      speechListening
                        ? s.micBtnRecordingBase
                        : micSolo
                          ? s.micBtn
                          : s.micBtnGhost,
                      'opptrix-round-icon-btn',
                      !speechListening && micBesideSend && 'opptrix-round-icon-btn-ghost',
                      speechListening && s.micRecording,
                      speechListening && 'opptrix-composer-mic-recording',
                    )}
                    variant={speechListening || micSolo ? 'primary' : 'ghost'}
                    icon={speechListening
                      ? <MicFilled fontSize={16} />
                      : <MicRegular fontSize={16} />}
                    disabled={composerLocked || uploading || speechPhase === 'transcribing' || speechPhase === 'requesting'}
                    aria-label={isRecording ? '结束聆听' : speechBusy ? '正在识别' : '语音输入'}
                    aria-pressed={isRecording}
                    title={isRecording ? '点击或空格结束 · Esc 取消' : '语音输入'}
                    onClick={toggleSpeech}
                  />
                )}
                {showSend && (
                  <OpptrixButton
                    className={mergeClasses(s.sendBtn, 'opptrix-round-icon-btn')}
                    variant="primary"
                    icon={<ArrowUpRegular fontSize={14} />}
                    disabled={!canSend}
                    onClick={() => handleSubmitMessage()}
                    aria-label={loading ? '补充说明' : '发送'}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
        <div
          data-composer-footer
          className={mergeClasses(
            s.composerFooter,
            isMobile && s.composerFooterMobile,
          )}
        >
          <div className={s.disclaimerRow}>
            <div className={s.disclaimerSide} aria-hidden />
            <span className={s.disclaimer}>
              内容由AI生成，不构成投资建议，请核实重要信息
            </span>
            <div className={mergeClasses(s.disclaimerSide, s.disclaimerSideEnd)}>
              {!speechListening && <ContextUsageMeter usage={contextUsage} />}
            </div>
          </div>
        </div>
      </div>

      <ComposerStockMentionList
        open={mentionState.open && !slashState.open}
        anchorRef={mentionAnchorRef}
        items={mentionMatches}
        activeIndex={mentionState.activeIndex}
        query={mentionState.query}
        onSelect={handleSelectMention}
        onHover={setMentionActiveIndex}
        onClose={closeMention}
      />
      <ComposerSkillSlashList
        open={slashState.open}
        anchorRef={mentionAnchorRef}
        items={slashMatches}
        activeIndex={slashState.activeIndex}
        query={slashState.query}
        loading={slashLoading}
        loadError={slashLoadError}
        onSelect={(skill) => insertSkillChip(skill, true)}
        onHover={setSlashActiveIndex}
        onClose={closeSlash}
      />
    </div>
  )
})

export default ChatComposer
