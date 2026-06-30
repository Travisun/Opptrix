import { useCallback, useEffect, useState } from 'react'
import type { CustomDiscoverStrategy } from '../types/schemas'
import {
  loadCustomDiscoverStrategies,
  removeCustomDiscoverStrategy,
  saveCustomDiscoverStrategy,
  subscribeCustomDiscoverStrategies,
} from './discoverStrategyStorage'

export function useCustomDiscoverStrategies() {
  const [strategies, setStrategies] = useState<CustomDiscoverStrategy[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const items = await loadCustomDiscoverStrategies()
    setStrategies(items)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
    return subscribeCustomDiscoverStrategies(() => { void refresh() })
  }, [refresh])

  const saveStrategy = useCallback((input: Partial<CustomDiscoverStrategy> & { name: string; prompt: string }) => {
    const result = saveCustomDiscoverStrategy(strategies, input)
    if (!result) return null
    setStrategies(result.items)
    return result.saved
  }, [strategies])

  const removeStrategy = useCallback((id: string) => {
    setStrategies(removeCustomDiscoverStrategy(strategies, id))
  }, [strategies])

  return { strategies, loading, saveStrategy, removeStrategy, setStrategies }
}
