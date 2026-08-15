import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listAgentSkills, type PublicAgentSkill } from '../api/client'

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
  const [skills, setSkills] = useState<PublicAgentSkill[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const loadGen = useRef(0)

  const loadSkills = useCallback(async () => {
    const gen = ++loadGen.current
    setLoading(true)
    setLoadError(null)
    try {
      const resp = await listAgentSkills()
      if (gen !== loadGen.current) return
      setSkills(resp.skills.slice().sort((a, b) => a.name.localeCompare(b.name)))
    } catch {
      if (gen !== loadGen.current) return
      setSkills([])
      setLoadError('暂时无法加载技能列表，请稍后重试')
    } finally {
      if (gen === loadGen.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!state.open) return
    void loadSkills()
  }, [loadSkills, state.open])

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
    const q = state.query.trim().toLowerCase()
    if (!q) return skills.slice(0, 30)
    return skills
      .filter(skill => {
        const name = skill.name.toLowerCase()
        const desc = (skill.description ?? '').toLowerCase()
        return name.includes(q) || desc.includes(q)
      })
      .slice(0, 30)
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
    reload: loadSkills,
  }
}
