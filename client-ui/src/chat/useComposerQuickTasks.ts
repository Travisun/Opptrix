import { useEffect, useState } from 'react'
import {
  DEFAULT_PINNED_QUICK_TASKS,
} from './quickTaskCatalog'
import { getUserPreference, setUserPreference } from '../api/client'

const PREFERENCE_KEY = 'composer_quick_tasks'

function normalizeTasks(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((t): t is string => typeof t === 'string')
    .map(t => t.trim())
    .filter(Boolean)
}

export function useComposerQuickTasks() {
  const [tasks, setTasks] = useState<string[]>([...DEFAULT_PINNED_QUICK_TASKS])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const resp = await getUserPreference<string[]>(PREFERENCE_KEY)
        const remote = normalizeTasks(resp.value)
        if (!cancelled && remote.length) setTasks(remote)
      } catch { /* keep defaults */ }
      finally {
        if (!cancelled) setReady(true)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const saveTasks = (next: string[]) => {
    const normalized = next.map(t => t.trim()).filter(Boolean)
    setTasks(normalized)
    if (!ready) return
    void setUserPreference(PREFERENCE_KEY, normalized).catch(() => {})
  }

  return { tasks, saveTasks, ready }
}
