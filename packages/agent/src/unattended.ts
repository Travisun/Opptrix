/**
 * Unattended (background / scheduled) chat helpers.
 * Strips interactive tools and provides immediate fail results so JobRunner never hangs on waitForAnswer.
 */

/** Tools that require a live user — never expose in unattended tool lists */
export const UNATTENDED_BLOCKED_TOOL_NAMES = Object.freeze([
  'ask_user',
  'request_secret',
] as const)

export type UnattendedBlockedToolName = (typeof UNATTENDED_BLOCKED_TOOL_NAMES)[number]

const BLOCKED = new Set<string>(UNATTENDED_BLOCKED_TOOL_NAMES)

export function isUnattendedBlockedTool(name: string): boolean {
  return BLOCKED.has(name)
}

export function filterToolNamesForUnattended(names: readonly string[]): string[] {
  return names.filter(n => !BLOCKED.has(n))
}

/** OpenAI tools shape (minimal for filtering by function.name) */
export function filterOpenAiToolsForUnattended<T extends { function?: { name?: string } }>(
  tools: readonly T[],
): T[] {
  return tools.filter(t => {
    const name = t.function?.name
    return typeof name !== 'string' || !BLOCKED.has(name)
  })
}

/** Immediate tool result when ask_user is still invoked under unattended */
export const UNATTENDED_ASK_USER_RESULT = Object.freeze({
  ok: false as const,
  unattended: true as const,
  error: '无人值守模式不可向用户提问；请自行推断或跳过并在答复中说明',
})

/** Immediate secret / vault result — never auto-fill secrets */
export const UNATTENDED_SECRET_RESULT = Object.freeze({
  ok: false as const,
  unattended: true as const,
  cancelled: true as const,
  error: '无人值守模式无法录入或确认保险箱密钥；请跳过需密钥的步骤并说明',
})

/** Appended to turn-tail so the model knows not to ask the user */
export const UNATTENDED_TURN_TAIL_NOTE = [
  '【无人值守模式】',
  '本轮为后台计划任务，无法向用户提问或等待确认。',
  '禁止调用 ask_user / request_secret；勿索要密码或密钥。',
  '请根据已有信息自行推断；缺关键信息则跳过该步并在答复中说明原因。',
].join('')

export function appendUnattendedTurnTail(turnTail: string): string {
  const base = turnTail.trim()
  return base ? `${base}\n\n${UNATTENDED_TURN_TAIL_NOTE}` : UNATTENDED_TURN_TAIL_NOTE
}

/** Same preference order as scheduleShellConfirm — auto-allow overwrite/delete in unattended */
const CONFIRM_PREFER_IDS = [
  'allow_session',
  'sticky',
  'allow_host_session',
  'allow_once',
  'once',
  'allow_host_once',
] as const

export function pickUnattendedConfirmIds(
  options: ReadonlyArray<{ id: string }>,
): { selected_ids: string[] } {
  for (const id of CONFIRM_PREFER_IDS) {
    const hit = options.find(o => o.id === id)
    if (hit) return { selected_ids: [hit.id] }
  }
  const fallback = options.find(o => o.id !== 'cancel')
  if (fallback) return { selected_ids: [fallback.id] }
  return { selected_ids: ['cancel'] }
}
