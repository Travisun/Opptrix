import { useCallback, useEffect, useState } from 'react'
import type { CustomDiscoverStrategy } from '../types/schemas'
import {
  loadCustomDiscoverStrategies,
  removeCustomDiscoverStrategy,
  saveCustomDiscoverStrategy,
  subscribeCustomDiscoverStrategies,
} from './discoverStrategyStorage'

export function useCustomDiscoverStrategies() {
  const [strategies, setStrategies] = useState<CustomDiscoverStrategy[]>(() => loadCustomDiscoverStrategies())

  useEffect(() => subscribeCustomDiscoverStrategies(() => {
    setStrategies(loadCustomDiscoverStrategies())
  }), [])

  const saveStrategy = useCallback((input: Partial<CustomDiscoverStrategy> & { name: string; prompt: string }) => {
    const result = saveCustomDiscoverStrategy(strategies, input)
    if (!result) return null
    setStrategies(result.items)
    return result.saved
  }, [strategies])

  const removeStrategy = useCallback((id: string) => {
    setStrategies(removeCustomDiscoverStrategy(strategies, id))
  }, [strategies])

  return { strategies, saveStrategy, removeStrategy, setStrategies }
}
