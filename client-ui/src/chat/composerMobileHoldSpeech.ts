/** 手机输入区长按阈值：短于此时长仍视为点按聚焦输入 */
export const MOBILE_SPEECH_HOLD_MS = 360

/** 按住期间位移超过该值则视为滚动/拖移，取消语音 */
export const MOBILE_SPEECH_HOLD_MOVE_CANCEL_PX = 12

export function clearEditorSelection(): void {
  try {
    window.getSelection()?.removeAllRanges()
  } catch {
    /* ignore */
  }
}

export function isTouchLikePointer(pointerType: string): boolean {
  return pointerType === 'touch' || pointerType === 'pen'
}
