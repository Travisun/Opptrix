import { useCallback, useMemo, useState } from 'react'
import { useAgentSkillsCatalog } from './agentSkillsCatalog'
import { skillMatchesSlashQuery } from './skillDisplay'

export interface SkillSlashState {
  open: boolean
  query: string
  startIndex: number
  activeIndex: number
}

const CLOSED: SkillSlashState = {
  open: false,
  query: '',
  startIndex: -1,
  activeIndex: 0,
}

/**
 * 检测 `/query` 触发：`/` 前须为行首或空白，避免 URL `http://` 误触。
 */
export function findSlashTrigger(text: string, cursor: number) {
  const slice = text.slice(0, cursor)
  const slashIndex = slice.lastIndexOf('/')
  if (slashIndex < 0) return null
  if (slashIndex > 0 && !/\s/.test(slice[slashIndex - 1]!)) return null
  const query = slice.slice(slashIndex + 1)
  if (/[\s/]/.test(query)) return null
  return { query, startIndex: slashIndex }
}

export function useSkillSlash() {
  const [state, setState] = useState<SkillSlashState>(CLOSED)
  const { skills, loading, error: loadError, reload } = useAgentSkillsCatalog(state.open)

  const syncFromInput = useCallback((text: string, cursor: number) => {
    const trigger = findSlashTrigger(text, cursor)
    if (!trigger) {
      setState(prev => (prev.open ? CLOSED : prev))
      return
    }
    setState(prev => ({
      open: true,
      query: trigger.query,
      startIndex: trigger.startIndex,
      activeIndex: prev.open && prev.startIndex === trigger.startIndex
        ? prev.activeIndex
        : 0,
    }))
  }, [])

  const close = useCallback(() => {
    setState(CLOSED)
  }, [])

  const matches = useMemo(() => {
    if (!state.open) return []
    const q = state.query.trim()
    // skills 已按 slash-rank → title 排好；不过滤条数上限（面板内滚动）
    if (!q) return skills
    return skills.filter(skill => skillMatchesSlashQuery(skill, q))
  }, [skills, state.open, state.query])

  const moveActive = useCallback((delta: number) => {
    setState(prev => {
      if (!prev.open || !matches.length) return prev
      const next = (prev.activeIndex + delta + matches.length) % matches.length
      return { ...prev, activeIndex: next }
    })
  }, [matches.length])

  const clampActiveIndex = useCallback(() => {
    setState(prev => {
      if (!prev.open || !matches.length) return prev
      if (prev.activeIndex < matches.length) return prev
      return { ...prev, activeIndex: Math.max(0, matches.length - 1) }
    })
  }, [matches.length])

  const setActiveIndex = useCallback((index: number) => {
    setState(prev => {
      if (!prev.open) return prev
      return { ...prev, activeIndex: index }
    })
  }, [])

  return {
    state,
    matches,
    loading,
    loadError,
    syncFromInput,
    close,
    moveActive,
    clampActiveIndex,
    setActiveIndex,
    reload: () => reload(true),
  }
}
