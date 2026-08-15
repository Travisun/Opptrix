/**
 * 大输出截断 — 用户向提示（兼容多种后端字段名）。
 * 禁止向用户展示路径、字节数、TRUNCATE、tool-output 等技术词。
 */

export const TOOL_RESULT_TRUNCATED_STEP_HINT = '完整结果已保存'

export const TOOL_RESULT_TRUNCATED_DETAIL_HINT =
  '内容较长，完整结果已保存。助手可继续分段读取。'

/** 预留：doom_loop 确认（后端就绪前勿接假交互） */
export const DOOM_LOOP_CONFIRM_COPY = {
  once: '仅此一次',
  always: '本对话同类操作都允许',
  cancel: '取消',
} as const

/** OpenCode once/always 风格 — 权限确认统一展示文案（仅展示层；id 语义不变） */
export const PERMISSION_CONFIRM_DISPLAY = {
  once: '仅此一次',
  sticky: '本对话同类操作都允许',
  cancel: '取消',
} as const

export type ToolStepTruncationFields = {
  truncated?: boolean
  resultTruncated?: boolean
  ui_hint?: string
  saved_rel_path?: string
}

/** 任一兼容字段表明结果已落盘/截断（不把字段值展示给用户） */
export function isToolStepResultTruncated(step: ToolStepTruncationFields): boolean {
  if (step.truncated === true || step.resultTruncated === true) return true
  if (typeof step.saved_rel_path === 'string' && step.saved_rel_path.trim()) return true
  if (typeof step.ui_hint === 'string' && step.ui_hint.trim()) return true
  return false
}

/**
 * 将后端 once/sticky/cancel（及出站别名）映射为统一用户向文案。
 * 未知 id 保留原 label；出隔离（仅 once、无 sticky）仍只显示「仅此一次」。
 */
export function displayPermissionConfirmLabel(id: string, fallback: string): string {
  const key = id.trim()
  if (
    key === 'once'
    || key === 'allow_once'
    || key === 'allow_host_once'
  ) {
    return PERMISSION_CONFIRM_DISPLAY.once
  }
  if (
    key === 'sticky'
    || key === 'always'
    || key === 'allow_host_session'
  ) {
    return PERMISSION_CONFIRM_DISPLAY.sticky
  }
  if (key === 'cancel') return PERMISSION_CONFIRM_DISPLAY.cancel
  return fallback
}
