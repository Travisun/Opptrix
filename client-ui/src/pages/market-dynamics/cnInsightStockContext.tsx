import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react'
import type { CnInsightStockPick } from './cnInsightStockUtils'
import { insightStockCodeKey } from './cnInsightStockUtils'

type CnInsightStockSelectContextValue = {
  selectedCode: string | null
  onPick: (pick: CnInsightStockPick) => void
}

const CnInsightStockSelectContext = createContext<CnInsightStockSelectContextValue | null>(null)

type ProviderProps = {
  selected: CnInsightStockPick | null
  onSelect: (pick: CnInsightStockPick | null) => void
  children: ReactNode
}

export function CnInsightStockSelectProvider({
  selected,
  onSelect,
  children,
}: ProviderProps) {
  const onPick = useCallback((pick: CnInsightStockPick) => {
    const key = insightStockCodeKey(pick.code)
    if (selected && insightStockCodeKey(selected.code) === key) {
      onSelect(null)
      return
    }
    onSelect(pick)
  }, [onSelect, selected])

  const value = useMemo((): CnInsightStockSelectContextValue => ({
    selectedCode: selected ? insightStockCodeKey(selected.code) : null,
    onPick,
  }), [onPick, selected])

  return (
    <CnInsightStockSelectContext.Provider value={value}>
      {children}
    </CnInsightStockSelectContext.Provider>
  )
}

export function useCnInsightStockSelect(): CnInsightStockSelectContextValue | null {
  return useContext(CnInsightStockSelectContext)
}
