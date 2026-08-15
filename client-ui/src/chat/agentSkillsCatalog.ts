/**
 * Composer「+」引用技能与 `/` 技能列表的单一数据源。
 * 模块级缓存 + in-flight 去重；展示排序统一走 compareSkillsForSlash。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { listAgentSkills, type PublicAgentSkill } from '../api/client'
import { compareSkillsForSlash } from './skillDisplay'

const CATALOG_TTL_MS = 30_000

let cachedSkills: PublicAgentSkill[] | null = null
let cachedAt = 0
/** 递增后，进行中的旧请求不得写回缓存 */
let cacheEpoch = 0
let inFlight: Promise<PublicAgentSkill[]> | null = null

function isCacheFresh(): boolean {
  return cachedSkills !== null && Date.now() - cachedAt < CATALOG_TTL_MS
}

/** 设置页创建/删除/保存后调用，使 Composer 下次打开拿到最新列表 */
export function invalidateAgentSkillsCatalog(): void {
  cachedSkills = null
  cachedAt = 0
  cacheEpoch += 1
  inFlight = null
}

/**
 * 拉取技能目录（已按 slash-rank → 展示标题排序）。
 * 默认命中短 TTL 缓存；`force` 绕过缓存与 TTL。
 */
export async function loadAgentSkillsCatalog(
  opts?: { force?: boolean },
): Promise<PublicAgentSkill[]> {
  if (opts?.force) {
    invalidateAgentSkillsCatalog()
  }
  if (isCacheFresh() && cachedSkills) {
    return cachedSkills
  }
  if (inFlight) {
    return inFlight
  }

  const epochAtStart = cacheEpoch
  const request = listAgentSkills()
    .then(resp => {
      const sorted = resp.skills.slice().sort(compareSkillsForSlash)
      if (epochAtStart === cacheEpoch) {
        cachedSkills = sorted
        cachedAt = Date.now()
      }
      return sorted
    })
    .finally(() => {
      if (inFlight === request) inFlight = null
    })

  inFlight = request
  return request
}

/**
 * `enabled` 为 true 时加载目录；返回与 `/`、`+` 共用的 skills。
 */
export function useAgentSkillsCatalog(enabled: boolean) {
  const [skills, setSkills] = useState<PublicAgentSkill[]>(() => cachedSkills ?? [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loadGen = useRef(0)

  const reload = useCallback(async (force = false) => {
    const gen = ++loadGen.current
    setLoading(true)
    setError(null)
    try {
      const next = await loadAgentSkillsCatalog({ force })
      if (gen !== loadGen.current) return
      setSkills(next)
    } catch {
      if (gen !== loadGen.current) return
      setSkills([])
      setError('暂时无法加载技能列表，请稍后重试')
    } finally {
      if (gen === loadGen.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    void reload(false)
  }, [enabled, reload])

  return { skills, loading, error, reload }
}
