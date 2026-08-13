export type ResearchChecklistStatus = 'pending' | 'done' | 'skipped'

export type ResearchChecklistItem = {
  id: string
  title: string
  status: ResearchChecklistStatus
}

type SessionChecklist = {
  items: ResearchChecklistItem[]
  /** 用于 spin-guard：是否相对上一快照有进展 */
  progressEpoch: number
}

const sessions = new Map<string, SessionChecklist>()

function getOrCreate(sessionId: string): SessionChecklist {
  let state = sessions.get(sessionId)
  if (!state) {
    state = { items: [], progressEpoch: 0 }
    sessions.set(sessionId, state)
  }
  return state
}

function normalizeStatus(raw: unknown): ResearchChecklistStatus | null {
  if (raw === 'pending' || raw === 'done' || raw === 'skipped') return raw
  return null
}

function normalizeItem(raw: unknown, index: number): ResearchChecklistItem | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const rec = raw as Record<string, unknown>
  const title = typeof rec.title === 'string' ? rec.title.trim() : ''
  if (!title) return null
  const idRaw = typeof rec.id === 'string' ? rec.id.trim() : ''
  const id = idRaw || `item_${index + 1}`
  const status = normalizeStatus(rec.status) ?? 'pending'
  return { id, title, status }
}

export function getResearchChecklist(sessionId: string): ResearchChecklistItem[] {
  return getOrCreate(sessionId).items.map(i => ({ ...i }))
}

export function hasPendingChecklistItems(sessionId: string): boolean {
  return getOrCreate(sessionId).items.some(i => i.status === 'pending')
}

export function isChecklistAllDone(sessionId: string): boolean {
  const items = getOrCreate(sessionId).items
  if (!items.length) return false
  return items.every(i => i.status === 'done' || i.status === 'skipped')
}

export function getChecklistProgressEpoch(sessionId: string): number {
  return getOrCreate(sessionId).progressEpoch
}

/**
 * replace：整体替换；merge：按 id 合并（无 id 则追加）。
 */
export function updateResearchChecklist(
  sessionId: string,
  args: { mode?: string; items?: unknown },
): {
  ok: true
  mode: 'replace' | 'merge'
  items: ResearchChecklistItem[]
  pending_count: number
} | { error: string } {
  const modeRaw = typeof args.mode === 'string' ? args.mode.trim().toLowerCase() : 'merge'
  const mode = modeRaw === 'replace' ? 'replace' : modeRaw === 'merge' ? 'merge' : null
  if (!mode) return { error: 'mode 须为 replace 或 merge' }
  if (!Array.isArray(args.items)) return { error: 'items 须为数组' }

  const incoming: ResearchChecklistItem[] = []
  for (let i = 0; i < args.items.length; i++) {
    const item = normalizeItem(args.items[i], i)
    if (!item) return { error: `items[${i}] 无效：需要 title` }
    incoming.push(item)
  }

  const state = getOrCreate(sessionId)
  const beforePending = state.items.filter(i => i.status === 'pending').length
  const beforeDone = state.items.filter(i => i.status === 'done' || i.status === 'skipped').length

  if (mode === 'replace') {
    state.items = incoming
  } else {
    const byId = new Map(state.items.map(i => [i.id, i]))
    for (const item of incoming) {
      byId.set(item.id, item)
    }
    state.items = [...byId.values()]
  }

  const afterPending = state.items.filter(i => i.status === 'pending').length
  const afterDone = state.items.filter(i => i.status === 'done' || i.status === 'skipped').length
  if (afterPending !== beforePending || afterDone !== beforeDone || mode === 'replace') {
    state.progressEpoch += 1
  }

  return {
    ok: true,
    mode,
    items: state.items.map(i => ({ ...i })),
    pending_count: afterPending,
  }
}

/** Skill 激活后写入占位步骤（解析不稳时的稳健路径）。 */
export function seedChecklistOnSkillActivate(
  sessionId: string,
  skillNames: readonly string[],
): void {
  const names = skillNames.map(n => n.trim()).filter(Boolean)
  if (!names.length) return
  const state = getOrCreate(sessionId)
  const id = 'skill_workflow'
  const title = names.length === 1
    ? `按已激活技能「${names[0]}」步骤推进`
    : `按已激活技能步骤推进（${names.join('、')}）`
  const existing = state.items.find(i => i.id === id)
  if (existing) {
    existing.title = title
    if (existing.status === 'done' || existing.status === 'skipped') {
      existing.status = 'pending'
      state.progressEpoch += 1
    }
    return
  }
  state.items.push({ id, title, status: 'pending' })
  state.progressEpoch += 1
}

export function buildChecklistTurnTail(sessionId: string): string {
  const pending = getOrCreate(sessionId).items.filter(i => i.status === 'pending')
  if (!pending.length) return ''
  const lines = pending.map((i, idx) => `${idx + 1}. [${i.id}] ${i.title}`)
  return [
    '【研究步骤 — 未完成】',
    ...lines,
    '可用 update_research_checklist 标记完成或跳过；勿忽略未完成项直接空转。',
  ].join('\n')
}

export function clearResearchChecklistSession(sessionId: string): void {
  sessions.delete(sessionId)
}

export function resetResearchChecklistForTests(): void {
  sessions.clear()
}
