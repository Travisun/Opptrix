import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { ComposerSpeechPhase } from './useComposerSpeech'
import { unlockChatCueSound } from '../platform/chatSound'
import {
  clearEditorSelection,
  isTouchLikePointer,
  MOBILE_SPEECH_HOLD_MS,
  MOBILE_SPEECH_HOLD_MOVE_CANCEL_PX,
} from './composerMobileHoldSpeech'

export type UseComposerMobileHoldSpeechOptions = {
  /** 手机 + 语音可用 + 未锁定 + 无附件上传 + 输入框为空 */
  baseEligible: boolean
  /** 手机输入模式已展开（展示 editor） */
  inputExpanded: boolean
  editorFocused: boolean
  mentionOpen: boolean
  slashOpen: boolean
  composingRef: RefObject<boolean>
  speechBusy: boolean
  speechPhase: ComposerSpeechPhase
  editorRef: RefObject<HTMLDivElement | null>
  startSpeech: () => Promise<void>
  stopSpeech: () => void
  cancelSpeech: () => void
  /** 单击「按住说话」：进入输入模式 */
  onTapToInput?: () => void
}

export function useComposerMobileHoldSpeech({
  baseEligible,
  inputExpanded,
  editorFocused,
  mentionOpen,
  slashOpen,
  composingRef,
  speechBusy,
  speechPhase,
  editorRef,
  startSpeech,
  stopSpeech,
  cancelSpeech,
  onTapToInput,
}: UseComposerMobileHoldSpeechOptions) {
  const pressedRef = useRef(false)
  const startedRef = useRef(false)
  const timerRef = useRef<number | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const originRef = useRef<{ x: number; y: number } | null>(null)
  const [holdPending, setHoldPending] = useState(false)

  const gestureEligible = baseEligible
    && !mentionOpen
    && !slashOpen
    && !speechBusy
    && (!inputExpanded || !editorFocused)

  /** 工具栏「按住说话」控件可见 */
  const holdControlActive = (gestureEligible || holdPending) && (!inputExpanded || !editorFocused)

  const clearGestureCleanup = useCallback(() => {
    cleanupRef.current?.()
    cleanupRef.current = null
    originRef.current = null
  }, [])

  const clearHoldTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const resetGesture = useCallback(() => {
    clearHoldTimer()
    clearGestureCleanup()
  }, [clearGestureCleanup, clearHoldTimer])

  useEffect(() => () => {
    setHoldPending(false)
    resetGesture()
  }, [resetGesture])

  const beginHoldSpeech = useCallback(() => {
    unlockChatCueSound()
    startedRef.current = true
    clearEditorSelection()
    editorRef.current?.blur()
    void (async () => {
      await startSpeech()
      if (!pressedRef.current) {
        stopSpeech()
        startedRef.current = false
        setHoldPending(false)
      }
    })()
  }, [editorRef, startSpeech, stopSpeech])

  useEffect(() => {
    if (speechBusy) setHoldPending(false)
  }, [speechBusy])

  const handleTouchLayerPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!gestureEligible) return
    if (e.button !== 0) return
    if (composingRef.current) return

    if (isTouchLikePointer(e.pointerType)) {
      e.preventDefault()
    }

    pressedRef.current = true
    startedRef.current = false
    originRef.current = { x: e.clientX, y: e.clientY }
    setHoldPending(true)
    clearEditorSelection()
    resetGesture()

    const preventDefaultGesture = (ev: Event) => {
      ev.preventDefault()
    }

    const target = e.currentTarget
    const pointerId = e.pointerId
    const cancelHoldPx2 = MOBILE_SPEECH_HOLD_MOVE_CANCEL_PX * MOBILE_SPEECH_HOLD_MOVE_CANCEL_PX

    target.addEventListener('contextmenu', preventDefaultGesture)
    document.addEventListener('selectstart', preventDefaultGesture, true)

    const handleMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      const origin = originRef.current
      if (!origin) return
      const dx = ev.clientX - origin.x
      const dy = ev.clientY - origin.y
      if (dx * dx + dy * dy > cancelHoldPx2) {
        pressedRef.current = false
        setHoldPending(false)
        clearHoldTimer()
        clearGestureCleanup()
      }
    }

    target.addEventListener('pointermove', handleMove)

    cleanupRef.current = () => {
      target.removeEventListener('contextmenu', preventDefaultGesture)
      document.removeEventListener('selectstart', preventDefaultGesture, true)
      target.removeEventListener('pointermove', handleMove)
    }

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      if (!pressedRef.current) return
      clearEditorSelection()
      try {
        target.setPointerCapture(pointerId)
      } catch {
        /* ignore */
      }
      beginHoldSpeech()
    }, MOBILE_SPEECH_HOLD_MS)
  }, [
    beginHoldSpeech,
    clearGestureCleanup,
    clearHoldTimer,
    gestureEligible,
    resetGesture,
    composingRef,
  ])

  const handleTouchLayerPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!baseEligible && !startedRef.current && speechPhase === 'idle') return

    const touchLike = isTouchLikePointer(e.pointerType)
    const wasHold = startedRef.current
      || speechPhase === 'recording'
      || speechPhase === 'requesting'

    pressedRef.current = false
    setHoldPending(false)
    clearHoldTimer()
    clearGestureCleanup()

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
    } catch {
      /* ignore */
    }

    if (wasHold) {
      stopSpeech()
      startedRef.current = false
      return
    }

    if (touchLike && gestureEligible) {
      clearEditorSelection()
      if (onTapToInput) {
        onTapToInput()
      } else {
        editorRef.current?.focus()
      }
    }
  }, [
    baseEligible,
    clearGestureCleanup,
    clearHoldTimer,
    editorRef,
    gestureEligible,
    onTapToInput,
    speechPhase,
    stopSpeech,
  ])

  const handleDismiss = useCallback(() => {
    pressedRef.current = false
    startedRef.current = false
    setHoldPending(false)
    clearHoldTimer()
    clearGestureCleanup()
    cancelSpeech()
  }, [cancelSpeech, clearGestureCleanup, clearHoldTimer])

  const handleMobileSpeechRelease = useCallback(() => {
    if (speechPhase !== 'recording' && speechPhase !== 'requesting') return
    pressedRef.current = false
    startedRef.current = false
    setHoldPending(false)
    resetGesture()
    stopSpeech()
  }, [resetGesture, speechPhase, stopSpeech])

  const showMobileDismiss = speechPhase === 'requesting' || speechPhase === 'recording'

  return {
    holdControlActive,
    holdPending,
    showMobileDismiss,
    handleHoldPointerDown: handleTouchLayerPointerDown,
    handleHoldPointerUp: handleTouchLayerPointerUp,
    handleMobileSpeechRelease,
    handleDismiss,
  }
}
