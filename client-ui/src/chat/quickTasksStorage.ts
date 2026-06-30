import {
  DEFAULT_PINNED_QUICK_TASKS,
  flattenQuickTaskCatalog,
} from './quickTaskCatalog'

const STORAGE_KEY = 'inno-composer-quick-tasks-v2'
const LEGACY_KEY = 'inno-composer-quick-tasks-v1'

const LEGACY_DEFAULTS = [
  '这只股票现在适合买入吗？',
  '最近有什么重要公告或财报？',
  '和同行业比，估值处于什么水平？',
  '机构最近怎么评价这只股票？',
  '帮我梳理买入理由和主要风险',
] as const

function normalizeTasks(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((t): t is string => typeof t === 'string')
    .map(t => t.trim())
    .filter(Boolean)
}

function isLegacyDefaultSet(tasks: string[]): boolean {
  if (tasks.length !== LEGACY_DEFAULTS.length) return false
  const set = new Set(tasks)
  return LEGACY_DEFAULTS.every(t => set.has(t))
}

/** 用户自定义 / 收藏的快捷任务（「我的快捷任务」） */
export function readComposerQuickTasks(): string[] {
  if (typeof window === 'undefined') return [...DEFAULT_PINNED_QUICK_TASKS]
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const tasks = normalizeTasks(JSON.parse(raw))
      if (tasks.length) return tasks
    }

    const legacyRaw = localStorage.getItem(LEGACY_KEY)
    if (legacyRaw) {
      const legacy = normalizeTasks(JSON.parse(legacyRaw))
      if (legacy.length && !isLegacyDefaultSet(legacy)) {
        saveComposerQuickTasks(legacy)
        return legacy
      }
    }
  } catch {
    /* fall through */
  }
  return [...DEFAULT_PINNED_QUICK_TASKS]
}

export function saveComposerQuickTasks(tasks: string[]): void {
  if (typeof window === 'undefined') return
  const normalized = tasks.map(t => t.trim()).filter(Boolean)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
}

/** @deprecated 仅兼容旧引用 */
export const DEFAULT_COMPOSER_QUICK_TASKS = flattenQuickTaskCatalog()
