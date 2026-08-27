import { useEffect, useState } from 'react'
import type { FxRatesToCny } from '@opptrix/shared/fx-rates'
import { fetchFxRatesToCny } from '../api/client'

export function useFxRates(enabled: boolean): FxRatesToCny | null {
  const [rates, setRates] = useState<FxRatesToCny | null>(null)

  useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false
    void fetchFxRatesToCny()
      .then(data => {
        if (!cancelled) setRates(data)
      })
      .catch(() => {
        if (!cancelled) setRates(null)
      })
    return () => {
      cancelled = true
    }
  }, [enabled])

  return rates
}
